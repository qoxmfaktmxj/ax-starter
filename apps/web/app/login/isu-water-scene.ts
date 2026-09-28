import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
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
  moon: 1.1, // 밤의 푸른 방향광
  nightFill: 0.28, // 밤 반구광 바닥값
  disc: 10, // 해 원판 HDR 밝기. 색은 투과를 정규화한다.
  water: [0.012, 0.07, 0.15] as Rgb, // 물속 색 = (천정 0.6 + 하늘 평균 0.4) x 이 값
};

// 해 고도에 고정된 노출 곡선으로 장면의 순간 휘도 변화가 화면을 흔들지 않게 한다.
const EXPOSURE_STOPS = [
  [-30, 2.4],
  [-12, 2.3],
  [-6, 2.05],
  [0, 1.4],
  [10, 0.95],
  [30, 0.86],
  [60, 1.0],
] as const;

function exposureAtElevation(elevation: number) {
  for (let index = 1; index < EXPOSURE_STOPS.length; index++) {
    const [endElevation, endExposure] = EXPOSURE_STOPS[index];
    if (elevation > endElevation) continue;
    const [startElevation, startExposure] = EXPOSURE_STOPS[index - 1];
    const t = THREE.MathUtils.smoothstep(
      elevation,
      startElevation,
      endElevation,
    );
    return THREE.MathUtils.lerp(startExposure, endExposure, t);
  }
  return EXPOSURE_STOPS[EXPOSURE_STOPS.length - 1][1];
}

// 출력 변환 뒤 8비트 하늘 그라디언트만 미세하게 디더링한다.
const GradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader:
    "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 color = texture2D(tDiffuse, vUv);
      float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5;
      gl_FragColor = vec4(clamp(color.rgb + noise / 255., 0., 1.), color.a);
    }`,
};

const UP = { x: 0, y: 1, z: 0 };
const AHEAD = { x: 0, y: 0.05, z: -1 };
const BEHIND = { x: 0, y: 0.05, z: 1 };

const SKY_ENV_CHUNK = THREE.ShaderChunk.envmap_physical_pars_fragment
  .replace(
    "textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 )",
    "mix( textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 ), textureCubeUV( skyEnvironmentNext, envMapRotation * worldNormal, 1.0 ), skyEnvironmentBlend )",
  )
  .replace(
    "textureCubeUV( envMap, envMapRotation * reflectVec, roughness )",
    "mix( textureCubeUV( envMap, envMapRotation * reflectVec, roughness ), textureCubeUV( skyEnvironmentNext, envMapRotation * reflectVec, roughness ), skyEnvironmentBlend )",
  );
if (!SKY_ENV_CHUNK.includes("skyEnvironmentNext, envMapRotation * reflectVec"))
  throw new Error("Sky environment shader chunk changed");

export type BlockMaterialVariant = "metal" | "glass";

export async function createIsuWaterScene(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  materialVariant: BlockMaterialVariant,
) {
  if (signal.aborted)
    throw new DOMException("Scene initialization cancelled", "AbortError");
  const layout = buildIsuLayout();
  const mobile = window.matchMedia("(pointer: coarse)").matches;
  const textureLoader = new THREE.TextureLoader();
  const modelRoot = mobile ? "/models/mobile" : "/models";
  const [modelBlocks, waterNormal, blockNormal, blockRoughness] =
    await Promise.all([
      loadBlockMeshes(layout.length, signal),
      textureLoader.loadAsync(
        mobile
          ? "/images/login/mobile/water-normal.webp"
          : "/images/login/water-normal.webp",
      ),
      textureLoader.loadAsync(`${modelRoot}/isu-blocks-normal.webp`),
      textureLoader.loadAsync(`${modelRoot}/isu-blocks-roughness.webp`),
    ]);
  const geometries = modelBlocks.map((block) => block.geometry);
  for (const texture of [blockNormal, blockRoughness]) {
    texture.flipY = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 4;
  }
  if (signal.aborted) {
    geometries.forEach((geometry) => geometry.dispose());
    waterNormal.dispose();
    blockNormal.dispose();
    blockRoughness.dispose();
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
    blockNormal.dispose();
    blockRoughness.dispose();
    throw error;
  }
  const failedSetupCleanup: Array<() => void> = [
    () => renderer.dispose(),
    () => geometries.forEach((geometry) => geometry.dispose()),
    () => waterNormal.dispose(),
    () => blockNormal.dispose(),
    () => blockRoughness.dispose(),
  ];
  const releaseFailedSetup = (error: unknown): never => {
    for (const dispose of failedSetupCleanup.reverse()) {
      try {
        dispose();
      } catch {
        // 원래 초기화 오류를 유지한다.
      }
    }
    throw error;
  };
  const initialize = <T>(create: () => T, dispose?: (value: T) => void): T => {
    try {
      const value = create();
      if (dispose) failedSetupCleanup.push(() => dispose(value));
      return value;
    } catch (error) {
      return releaseFailedSetup(error);
    }
  };
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
  const sky = initialize(
    () => createIsuSky(scene),
    (value) => value.dispose(),
  );
  const environmentGenerator = initialize(
    () => new THREE.PMREMGenerator(renderer),
    (value) => value.dispose(),
  );
  let environment: THREE.WebGLRenderTarget | null = null;
  let nextEnvironment: THREE.WebGLRenderTarget | null = null;
  const environmentSun = new THREE.Vector3();
  const nextEnvironmentSun = new THREE.Vector3();
  const nextEnvironmentUniform = { value: null as THREE.Texture | null };
  const environmentBlendUniform = { value: 0 };
  let environmentBlendStart = 0;

  const camera = new THREE.PerspectiveCamera(49, 1, 0.1, 2500);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x708999, 1.8);
  scene.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(sunLight);
  const moonLight = new THREE.DirectionalLight("#9fc4ff", 0);
  moonLight.position.set(-6, 9, 10);
  scene.add(moonLight);
  const rim = new THREE.DirectionalLight(0xc8efff, LIGHT.rim);
  rim.position.set(4, 4, -6);
  scene.add(rim);
  const ripples = initialize(
    () => createIsuRipples(),
    (value) => value.dispose(),
  );
  const water = initialize(
    () => createIsuWater(scene, { normalMap: waterNormal, skyLut: sky.lut }),
    (value) => value.dispose(),
  );

  const composer = initialize(
    () => {
      const value = new EffectComposer(
        renderer,
        new THREE.WebGLRenderTarget(1, 1, {
          type: THREE.HalfFloatType,
          samples: mobile ? 0 : 4,
        }),
      );
      try {
        // 출력 결과를 받는 타깃에는 MSAA가 필요 없다.
        value.renderTarget1.samples = 0;
        value.addPass(new RenderPass(scene, camera));
        value.addPass(new OutputPass());
        value.addPass(new ShaderPass(GradeShader));
        return value;
      } catch (error) {
        for (const pass of value.passes) pass.dispose();
        value.dispose();
        throw error;
      }
    },
    (value) => {
      for (const pass of value.passes) pass.dispose();
      value.dispose();
    },
  );

  const logo = new THREE.Group();
  scene.add(logo);
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext("2d")!;
  const shadowFade = shadowContext.createRadialGradient(32, 32, 4, 32, 32, 32);
  shadowFade.addColorStop(0, "rgba(4, 14, 22, 0.35)");
  shadowFade.addColorStop(0.5, "rgba(4, 14, 22, 0.13)");
  shadowFade.addColorStop(1, "rgba(4, 14, 22, 0)");
  shadowContext.fillStyle = shadowFade;
  shadowContext.fillRect(0, 0, 64, 64);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.7,
  });
  const shadows = layout
    .filter((spec) => !spec.dot && spec.course === 0)
    .map((spec) => {
      const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(spec.center[0], 0.004, spec.center[2]);
      shadow.scale.set(spec.size[0] * 1.6, spec.size[2] * 1.5, 1);
      scene.add(shadow);
      return shadow;
    });
  failedSetupCleanup.push(() => {
    shadows.forEach((shadow) => scene.remove(shadow));
    shadowGeometry.dispose();
    shadowMaterial.dispose();
    shadowTexture.dispose();
  });
  const createdMaterials: THREE.Material[] = [];
  failedSetupCleanup.push(() =>
    createdMaterials.forEach((material) => material.dispose()),
  );
  const blocks = initialize(() =>
    layout.map((spec, index) => {
      const material = modelBlocks[index].material.clone();
      createdMaterials.push(material);
      material.vertexColors = false;
      material.color.set(spec.dot ? "#99ca3c" : "#008fd4");
      material.normalMap = blockNormal;
      material.roughnessMap = blockRoughness;
      material.envMap = null;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.skyEnvironmentNext = nextEnvironmentUniform;
        shader.uniforms.skyEnvironmentBlend = environmentBlendUniform;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <envmap_physical_pars_fragment>",
          `uniform sampler2D skyEnvironmentNext;
          uniform float skyEnvironmentBlend;
          ${SKY_ENV_CHUNK}`,
        );
      };
      material.customProgramCacheKey = () => "isu-sky-environment-blend";
      material.emissive.set(spec.dot ? "#99ca3c" : "#008fd4");
      material.emissiveIntensity = 0;
      if (spec.dot) {
        material.metalness = 0.05;
        material.roughness = 0.52;
        material.transmission = 0;
        material.clearcoat = 0.1;
        material.envMapIntensity = 0.5;
        material.normalScale.setScalar(0.18);
      } else if (materialVariant === "metal") {
        material.metalness = 0.74;
        material.roughness = 0.46;
        material.transmission = 0;
        material.clearcoat = 0.08;
        material.envMapIntensity = 0.82;
        material.normalScale.setScalar(0.12);
      } else {
        material.metalness = 0;
        material.roughness = 0.34;
        material.transmission = 1;
        material.thickness = 0.6;
        material.ior = 1.46;
        material.clearcoat = 0.28;
        material.sheen = 0.6;
        material.sheenColor = new THREE.Color("#69bbf0");
        material.sheenRoughness = 0.45;
        material.envMapIntensity = 0.75;
        material.normalScale.setScalar(0.16);
      }
      material.clearcoatRoughness = 0.25;
      material.attenuationColor = new THREE.Color(
        spec.dot ? "#99ca3c" : "#7bbde3",
      );
      material.attenuationDistance = 1.2;
      material.needsUpdate = true;
      const mesh = new THREE.Mesh(geometries[index], material);
      const base = new THREE.Vector3(
        spec.center[0],
        spec.center[1] + 0.02,
        spec.center[2],
      );
      mesh.position.copy(base);
      logo.add(mesh);
      return {
        mesh,
        material,
        base,
        spec,
        hover: 0,
        roughness: material.roughness,
        clearcoat: material.clearcoat,
      };
    }),
  );

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
  let hoverSheen = 0;
  let openAmount = 0;
  let pointerHits = 0;
  let blockHits = 0;
  let skyLightFactor = 1;
  let sharePending: (() => void) | null = null;
  let disposed = false;

  const updateEnvironment = (time: number) => {
    if (!environment) {
      environment = environmentGenerator.fromScene(
        sky.environmentScene,
        0,
        0.1,
        200,
        { size: 64 },
      );
      scene.environment = environment.texture;
      nextEnvironmentUniform.value = environment.texture;
      environmentSun.copy(sunDirection);
      return;
    }
    if (
      !nextEnvironment &&
      environmentSun.angleTo(sunDirection) >= THREE.MathUtils.degToRad(2)
    ) {
      nextEnvironment = environmentGenerator.fromScene(
        sky.environmentScene,
        0,
        0.1,
        200,
        { size: 64 },
      );
      nextEnvironmentUniform.value = nextEnvironment.texture;
      nextEnvironmentSun.copy(sunDirection);
      environmentBlendStart = time;
    }
    if (!nextEnvironment) return;
    const blend = THREE.MathUtils.smoothstep(
      time,
      environmentBlendStart,
      environmentBlendStart + 0.8,
    );
    environmentBlendUniform.value = blend;
    if (blend < 1) return;
    environment.dispose();
    environment = nextEnvironment;
    nextEnvironment = null;
    scene.environment = environment.texture;
    nextEnvironmentUniform.value = environment.texture;
    environmentBlendUniform.value = 0;
    environmentSun.copy(nextEnvironmentSun);
  };

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
    skyLightFactor = THREE.MathUtils.clamp(Math.sqrt(skyLuminance), 0.5, 1);
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
    rim.intensity = LIGHT.rim * skyLightFactor;
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
    renderer.toneMappingExposure = exposureAtElevation(sun.elevation);
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
    hoverSheen +=
      ((hoverIndex >= 0 ? 1 : 0) - hoverSheen) *
      (1 - Math.exp(-activeDelta * 5));
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      const target = hoverIndex === index ? 1 : 0;
      block.hover += (target - block.hover) * (1 - Math.exp(-activeDelta * 5));
      const sheen = block.hover * (1 - frame.calm * 0.8);
      block.mesh.position.set(
        block.base.x + frame.shake * 0.045,
        block.base.y +
          0.025 * sheen +
          (1 - intro) * (0.35 + (index % 4) * 0.12),
        block.base.z,
      );
      block.mesh.rotation.z = (index % 2 === 0 ? 1 : -1) * 0.012 * sheen;
      block.material.roughness = block.roughness - 0.03 * sheen;
      block.material.clearcoat = block.clearcoat + 0.12 * sheen;
      block.material.emissiveIntensity =
        frame.share * (block.spec.dot ? 0.25 : 0.12);
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
    updateEnvironment(time);
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
    canvas.dataset.blockLight = hoverSheen.toFixed(2);
  };

  try {
    resize();
    applyDaylight();
  } catch (error) {
    return releaseFailedSetup(error);
  }
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
      environment?.dispose();
      nextEnvironment?.dispose();
      environmentGenerator.dispose();
      shadows.forEach((shadow) => scene.remove(shadow));
      shadowGeometry.dispose();
      shadowMaterial.dispose();
      shadowTexture.dispose();
      blockNormal.dispose();
      blockRoughness.dispose();
      for (const block of blocks) block.material.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      renderer.dispose();
    },
  };
}
