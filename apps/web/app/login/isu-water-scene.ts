import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import {
  luminance,
  skyRadiance,
  SUN_INTENSITY,
  sunTransmittance,
  type Rgb,
} from "./isu-atmosphere";
import { loadBlockMeshes } from "./isu-blocks";
import { advanceDay, daypart, randomDayTime, sunAt } from "./isu-day-cycle";
import { buildIsuLayout } from "./isu-layout";
import { createIsuRipples, RIPPLE_AREA } from "./isu-ripples";
import { createIsuSky } from "./isu-sky";
import { createIsuWater } from "./isu-water";
import { createLoginMotion } from "./login-motion";

// 조명과 노출 상수. 캡처로 조정할 때 이 표의 값만 바꾼다.
const LIGHT = {
  sun: 2.2, // 햇빛 방향광 = sun x 투과 휘도
  sky: 1.8, // 반구광 = sky x 하늘 평균 휘도
  rim: 0.45, // 뒤쪽 푸른 윤곽광
  moon: 0.35, // 밤의 푸른 방향광
  nightFill: 0.2, // 밤 반구광 바닥값
  disc: 10, // 해 원판 HDR 밝기. 색은 투과를 정규화한다.
  exposureKey: 0.8, // 노출 = key / sqrt(하늘 평균 휘도)
  exposureMin: 0.8,
  exposureMax: 3,
  water: [0.012, 0.07, 0.15] as Rgb, // 물속 색 = (천정 0.6 + 하늘 평균 0.4) x 이 값
  bloomStrength: 0.18,
  bloomRadius: 0.25,
  // 노출 전 선형값. 해 원판(정오 약 9.2)과 수면 반짝임(상한 6)은 닿지 않아 블록의 강한 반사광만 번진다.
  // 해 주변 광채는 하늘 LUT의 미 산란이 만든다. "빛이 너무 세다"는 피드백으로 줄인 값이다.
  bloomThreshold: 10,
};

// 출력 변환 뒤 색 보정. ACES가 빼는 채도와 대비를 조금 되돌리고, 8비트 하늘 그라디언트의
// 띠를 미세한 디더링으로 없앤다.
const GradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader:
    "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 color = texture2D(tDiffuse, vUv);
      float gray = dot(color.rgb, vec3(.2126, .7152, .0722));
      vec3 graded = mix(vec3(gray), color.rgb, 1.15);
      graded = (graded - .5) * 1.05 + .5;
      float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5;
      gl_FragColor = vec4(clamp(graded, 0., 1.) + noise / 255., color.a);
    }`,
};

const UP = { x: 0, y: 1, z: 0 };
const AHEAD = { x: 0, y: 0.05, z: -1 };
const BEHIND = { x: 0, y: 0.05, z: 1 };

export async function createIsuWaterScene(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
) {
  if (signal.aborted)
    throw new DOMException("Scene initialization cancelled", "AbortError");
  const layout = buildIsuLayout();
  const mobile = window.matchMedia("(pointer: coarse)").matches;
  const [modelBlocks, waterNormal] = await Promise.all([
    loadBlockMeshes(layout.length, signal),
    new THREE.TextureLoader().loadAsync(
      mobile
        ? "/images/login/mobile/water-normal.webp"
        : "/images/login/water-normal.webp",
    ),
  ]);
  const geometries = modelBlocks.map((block) => block.geometry);
  if (signal.aborted) {
    geometries.forEach((geometry) => geometry.dispose());
    waterNormal.dispose();
    throw new DOMException("Scene initialization cancelled", "AbortError");
  }

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
  } catch (error) {
    geometries.forEach((geometry) => geometry.dispose());
    waterNormal.dispose();
    throw error;
  }
  let shaderFailed = false;
  renderer.debug.onShaderError = () => {
    shaderFailed = true;
  };
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, mobile ? 1.2 : 1.5),
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  const studio = new RoomEnvironment();
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  const environment = environmentGenerator.fromScene(studio, 0.35);
  environmentGenerator.dispose();
  studio.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    if (Array.isArray(object.material))
      object.material.forEach((material) => material.dispose());
    else object.material.dispose();
  });
  const sky = createIsuSky(scene);

  const camera = new THREE.PerspectiveCamera(49, 1, 0.1, 2500);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x708999, 1.8);
  scene.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(sunLight);
  const moonLight = new THREE.DirectionalLight("#9fc4ff", 0);
  moonLight.position.set(-6, 10, -8);
  scene.add(moonLight);
  const rim = new THREE.DirectionalLight(0xc8efff, LIGHT.rim);
  rim.position.set(4, 4, -6);
  scene.add(rim);
  const hoverLight = new THREE.PointLight("#c8eaff", 0, 2.7, 2);
  scene.add(hoverLight);
  const ripples = createIsuRipples();
  const water = createIsuWater(scene, {
    normalMap: waterNormal,
    skyLut: sky.lut,
  });

  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: mobile ? 0 : 4,
    }),
  );
  // 교환하는 패스가 둘(Output, Grade)이라 장면은 항상 renderTarget2에 그려진다. renderTarget1은 출력 결과만
  // 받으므로 MSAA가 필요 없다. 교환 패스 수를 바꾸면 이 설정을 다시 확인한다.
  composer.renderTarget1.samples = 0;
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      LIGHT.bloomStrength,
      LIGHT.bloomRadius,
      LIGHT.bloomThreshold,
    ),
  );
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GradeShader));

  const logo = new THREE.Group();
  scene.add(logo);
  const blocks = layout.map((spec, index) => {
    const material = modelBlocks[index].material.clone();
    material.vertexColors = false;
    material.color.set(spec.dot ? "#99ca3c" : "#008fd4");
    material.transmission = spec.dot ? 0 : 0.68;
    material.thickness = spec.dot ? 0 : 0.4;
    if (spec.dot) {
      material.metalness = 0.04;
      material.roughness = 0.25;
      material.clearcoat = 0.38;
      material.clearcoatRoughness = 0.14;
    } else {
      material.roughness = 0.14;
      material.clearcoatRoughness = 0.12;
      material.envMap = environment.texture;
      material.envMapIntensity = 0.22;
    }
    material.attenuationColor = new THREE.Color(
      spec.dot ? "#99ca3c" : "#80c7ea",
    );
    material.attenuationDistance = 1.8;
    // 초록 블록은 해가 낮거나 밤이어도 CI 초록이 보이도록 같은 색으로 스스로 빛난다.
    material.emissive = new THREE.Color(spec.dot ? "#99ca3c" : "#008fd4");
    material.emissiveIntensity = spec.dot ? 0.15 : 0.025;
    material.needsUpdate = true;
    const mesh = new THREE.Mesh(geometries[index], material);
    const base = new THREE.Vector3(
      spec.center[0],
      spec.center[1] + 0.02,
      spec.center[2],
    );
    mesh.position.copy(base);
    logo.add(mesh);
    return { mesh, material, base, spec, hover: 0 };
  });

  const motion = createLoginMotion();
  const pointer = new THREE.Vector2(2, 2);
  const raycaster = new THREE.Raycaster();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const waterHit = new THREE.Vector3();
  const previousHit = new THREE.Vector3();
  let hasPreviousHit = false;
  let dayTime = randomDayTime();
  const sunDirection = new THREE.Vector3(0, 1, 0);
  const sunIrradiance = new THREE.Color();
  const discColor = new THREE.Color();
  const waterColor = new THREE.Color();
  let frameCount = 0;
  let activeTime = 0;
  let introTime = 0;
  let hoverIndex = -1;
  let openAmount = 0;
  let pointerHits = 0;
  let blockHits = 0;
  let sharePending: (() => void) | null = null;
  let disposed = false;

  // 해 위치 하나에서 하늘, 햇빛, 주변광, 물속 색, 노출을 모두 정한다.
  const applyDaylight = () => {
    const sun = sunAt(dayTime);
    sunDirection.set(sun.x, sun.y, sun.z);
    const transmittance = sunTransmittance(sun);
    const zenith = skyRadiance(UP, sun);
    const ahead = skyRadiance(AHEAD, sun);
    const behind = skyRadiance(BEHIND, sun);
    const average = [0, 1, 2].map(
      (channel) => (zenith[channel] + ahead[channel] + behind[channel]) / 3,
    ) as Rgb;
    const skyLuminance = luminance(average);
    const night = THREE.MathUtils.smoothstep(-sun.y, 0.05, 0.25);
    const peak = Math.max(...transmittance, 1e-6);
    sunLight.color.setRGB(
      transmittance[0] / peak,
      transmittance[1] / peak,
      transmittance[2] / peak,
    );
    // 제곱근으로 낮은 해의 빛을 덜 줄여 일출과 일몰의 따뜻한 빛이 ISU 앞면에 보이게 한다.
    sunLight.intensity = LIGHT.sun * Math.sqrt(luminance(transmittance));
    sunLight.position.copy(sunDirection).multiplyScalar(20);
    moonLight.intensity = LIGHT.moon * night;
    const skyPeak = Math.max(...average, 1e-6);
    ambient.color.setRGB(
      average[0] / skyPeak,
      average[1] / skyPeak,
      average[2] / skyPeak,
    );
    ambient.intensity = LIGHT.sky * skyLuminance + LIGHT.nightFill * night;
    // 물속 빛은 주로 위에서 내려온다. 수평선 쪽 노을색만 따라가면 탁한 녹회색이 된다.
    waterColor.setRGB(
      (zenith[0] * 0.6 + average[0] * 0.4) * LIGHT.water[0],
      (zenith[1] * 0.6 + average[1] * 0.4) * LIGHT.water[1],
      (zenith[2] * 0.6 + average[2] * 0.4) * LIGHT.water[2],
    );
    discColor
      .copy(sunLight.color)
      .multiplyScalar(
        LIGHT.disc * THREE.MathUtils.smoothstep(sun.y, -0.01, 0.02),
      );
    sunIrradiance
      .setRGB(transmittance[0], transmittance[1], transmittance[2])
      .multiplyScalar(SUN_INTENSITY);
    renderer.toneMappingExposure = THREE.MathUtils.clamp(
      LIGHT.exposureKey / Math.sqrt(skyLuminance + 0.0004),
      LIGHT.exposureMin,
      LIGHT.exposureMax,
    );
    canvas.dataset.dayTime = dayTime.toFixed(2);
    canvas.dataset.daypart = daypart(sun);
    canvas.dataset.sunElevation = sun.elevation.toFixed(2);
    canvas.dataset.sunAzimuth = sun.azimuth.toFixed(1);
    return night;
  };

  const insideRippleArea = (point: THREE.Vector3) =>
    point.x > RIPPLE_AREA.x &&
    point.x < RIPPLE_AREA.x + RIPPLE_AREA.size &&
    point.z > RIPPLE_AREA.z &&
    point.z < RIPPLE_AREA.z + RIPPLE_AREA.size;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    if (width < 700) {
      camera.fov = 56;
      camera.position.set(0, 3.2, 11.7);
      camera.lookAt(0, 1.35, 0);
    } else {
      camera.fov = 49;
      camera.position.set(0, 3.2, 11.8);
      const targetX = THREE.MathUtils.lerp(
        1.65,
        3.1,
        THREE.MathUtils.clamp((camera.aspect - 1.18) / 0.6, 0, 1),
      );
      camera.lookAt(targetX, 1.4, 0);
    }
    camera.updateProjectionMatrix();
    water.resize(width, height);
  };

  const render = (
    time: number,
    delta: number,
    assetsReady: boolean,
    wallDelta = delta,
  ) => {
    if (disposed) return;
    const frame = motion.update(delta);
    const activeDelta = Math.min(delta, 0.06) * (1 - frame.calm * 0.7);
    activeTime += Math.min(wallDelta, 0.25) * (1 - frame.calm * 0.7);
    introTime += wallDelta;
    // 입력 중(calm)에는 해가 멈춘다. 페이지 복귀 시 큰 시간 간격은 1초로 자른다.
    dayTime = advanceDay(dayTime, Math.min(wallDelta, 1) * (1 - frame.calm));
    const night = applyDaylight();

    hoverIndex = -1;
    if (pointer.x !== 2 && assetsReady) {
      raycaster.setFromCamera(pointer, camera);
      const blockHit = raycaster.intersectObjects(
        blocks.map((block) => block.mesh),
        false,
      )[0];
      if (blockHit) {
        hoverIndex = blocks.findIndex(
          (block) => block.mesh === blockHit.object,
        );
        if (hoverIndex >= 0) {
          hoverLight.position
            .copy(blockHit.point)
            .addScaledVector(raycaster.ray.direction, -0.65);
          hoverLight.color.set(
            blocks[hoverIndex].spec.dot ? "#f0fad4" : "#c8eaff",
          );
          if (blocks[hoverIndex].hover < 0.1) blockHits++;
        }
      } else if (
        raycaster.ray.intersectPlane(waterPlane, waterHit) &&
        insideRippleArea(waterHit)
      ) {
        // 처음 닿은 점(탭 포함)은 작은 눌림 하나, 이후에는 움직인 거리에 비례한 선분 눌림.
        const moved = hasPreviousHit ? waterHit.distanceTo(previousHit) : 0;
        if (!hasPreviousHit || moved > 0.02) {
          ripples.disturb(
            hasPreviousHit ? previousHit.x : waterHit.x,
            hasPreviousHit ? previousHit.z : waterHit.z,
            waterHit.x,
            waterHit.z,
            hasPreviousHit ? Math.min(0.2, moved * 0.25) : 0.1,
          );
          previousHit.copy(waterHit);
          hasPreviousHit = true;
          pointerHits++;
        }
      }
    }

    const intro = THREE.MathUtils.smoothstep(introTime, 0, 2.2);
    hoverLight.intensity +=
      ((hoverIndex >= 0 ? 1.6 * (1 - frame.calm * 0.8) : 0) -
        hoverLight.intensity) *
      (1 - Math.exp(-activeDelta * 9));
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      const target = hoverIndex === index ? 1 : 0;
      block.hover += (target - block.hover) * (1 - Math.exp(-activeDelta * 7));
      const spread = block.hover * (1 - frame.calm * 0.8);
      const x = Math.sign(block.base.x) * (0.04 + (index % 3) * 0.014) * spread;
      block.mesh.position.set(
        block.base.x + x + frame.shake * 0.045,
        block.base.y +
          block.spec.course * 0.014 * spread +
          (1 - intro) * (0.35 + (index % 4) * 0.12),
        block.base.z + 0.16 * spread,
      );
      block.material.emissiveIntensity = block.spec.dot
        ? 0.15 + Math.sin(time * 2) * 0.04 + frame.share * 0.45
        : 0.025 + 0.035 * spread + frame.share * 0.12;
    }
    openAmount +=
      ((hoverIndex >= 0 ? 1 : 0) - openAmount) *
      (1 - Math.exp(-activeDelta * 6));
    // 에너지 값은 벽시계 시간으로 줄인다. 파동 계산 단계는 ripples 안에서 따로 제한한다.
    ripples.update(renderer, Math.min(wallDelta, 1));
    water.update(
      activeTime,
      ripples.texture,
      sunDirection,
      sunIrradiance,
      waterColor,
    );
    sky.update(renderer, sunDirection, discColor, night, time);
    composer.render(delta);
    if (shaderFailed) throw new Error("Water scene shader compilation failed");
    if (sharePending && frame.share >= 1) {
      sharePending();
      sharePending = null;
    }
    canvas.dataset.ready = assetsReady ? "true" : "loading";
    canvas.dataset.preview = "true";
    canvas.dataset.intro = introTime >= 2.2 ? "complete" : "running";
    canvas.dataset.calm = frame.calm.toFixed(2);
    canvas.dataset.share = frame.share.toFixed(2);
    canvas.dataset.frames = String(++frameCount);
    canvas.dataset.pointerHits = String(pointerHits);
    canvas.dataset.rippleEnergy = ripples.energy.toFixed(3);
    canvas.dataset.openAmount = openAmount.toFixed(3);
    canvas.dataset.blockHits = String(blockHits);
    canvas.dataset.blockLight = hoverLight.intensity.toFixed(2);
  };

  resize();
  applyDaylight();
  return {
    resize,
    render,
    texturesReady: Promise.resolve(true),
    pointer(x: number, y: number) {
      pointer.set(x, y);
    },
    pointerLeave() {
      pointer.set(2, 2);
      hasPreviousHit = false;
    },
    calm(on: boolean) {
      motion.calm(on);
    },
    shake() {
      motion.shake();
    },
    share() {
      motion.share();
      return new Promise<void>((resolve) => {
        sharePending?.();
        sharePending = resolve;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sharePending?.();
      sharePending = null;
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
      water.dispose();
      ripples.dispose();
      sky.dispose();
      environment.dispose();
      for (const block of blocks) block.material.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      renderer.dispose();
    },
  };
}
