import * as THREE from "three";
import { loadBlockGeometries } from "./isu-blocks";
import { buildIsuLayout } from "./isu-layout";
import { createLoginMotion } from "./login-motion";
import {
  advanceMood,
  MOODS,
  nextMood,
  randomMood,
  TRANSITION_SECONDS,
  transitionStops,
  type MoodId,
  type MoodTimeline,
} from "./isu-water-moods";
import { createIsuWater } from "./isu-water";
import { createWaterSlogan } from "./isu-water-slogan";

const colorKeys = ["sky", "horizon", "water", "sun"] as const;
const numberKeys = [
  "power",
  "ambient",
  "exposure",
  "rain",
  "wave",
  "haze",
] as const;
const palettes = Object.fromEntries(
  Object.entries(MOODS).map(([id, mood]) => [
    id,
    {
      ...mood,
      sky: new THREE.Color(mood.sky),
      horizon: new THREE.Color(mood.horizon),
      water: new THREE.Color(mood.water),
      sun: new THREE.Color(mood.sun),
    },
  ]),
) as Record<
  MoodId,
  Omit<(typeof MOODS)[MoodId], (typeof colorKeys)[number]> & {
    [Key in (typeof colorKeys)[number]]: THREE.Color;
  }
>;

export async function createIsuWaterScene(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
) {
  if (signal.aborted)
    throw new DOMException("Scene initialization cancelled", "AbortError");
  const layout = buildIsuLayout();
  const geometries = await loadBlockGeometries(layout.length, signal);
  let slogan: Awaited<ReturnType<typeof createWaterSlogan>>;
  try {
    slogan = await createWaterSlogan(signal);
  } catch (error) {
    geometries.forEach((geometry) => geometry.dispose());
    throw error;
  }
  if (signal.aborted) {
    geometries.forEach((geometry) => geometry.dispose());
    slogan.dispose();
    throw new DOMException("Scene initialization cancelled", "AbortError");
  }

  const mobile = window.matchMedia("(pointer: coarse)").matches;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !mobile,
      powerPreference: "high-performance",
    });
  } catch (error) {
    geometries.forEach((geometry) => geometry.dispose());
    slogan.dispose();
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
  scene.fog = new THREE.FogExp2("#f0e6e0", 0.005);
  const skyColor = new THREE.Color();
  const horizonColor = new THREE.Color();
  const sunColor = new THREE.Color();
  const waterColor = new THREE.Color();
  const skyGeometry = new THREE.SphereGeometry(180, 32, 16);
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      sky: { value: skyColor },
      horizon: { value: horizonColor },
    },
    vertexShader: `varying vec3 vDirection;
      void main(){vec4 p=modelMatrix*vec4(position,1.);vDirection=normalize(p.xyz);
      gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `uniform vec3 sky,horizon;varying vec3 vDirection;
      void main(){float h=smoothstep(-.04,.64,vDirection.y);
      gl_FragColor=vec4(mix(horizon,sky,h),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.frustumCulled = false;
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(49, 1, 0.1, 400);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x708999, 1.8);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(-6, 9, 7);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xc8efff, 0.55);
  rim.position.set(4, 4, -6);
  scene.add(rim);
  const water = createIsuWater(scene);

  const logo = new THREE.Group();
  scene.add(logo);
  const blocks = layout.map((spec, index) => {
    const material = new THREE.MeshPhysicalMaterial({
      color: spec.dot ? "#a0c840" : "#0090d0",
      metalness: spec.dot ? 0.04 : 0.08,
      roughness: 0.28,
      clearcoat: spec.dot ? 0.35 : 0.42,
      clearcoatRoughness: 0.18,
      emissive: spec.dot ? "#2a3d00" : "#005d87",
      emissiveIntensity: spec.dot ? 0.22 : 0,
    });
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

  slogan.group.position.set(0, 0.58, 4.2);
  slogan.group.scale.setScalar(0.75);
  scene.add(slogan.group);

  const motion = createLoginMotion();
  const pointer = new THREE.Vector2(2, 2);
  const raycaster = new THREE.Raycaster();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const waterHit = new THREE.Vector3();
  const previousHit = new THREE.Vector3(1000, 0, 1000);
  const lastSloganHit = new THREE.Vector3(1000, 1000, 1000);
  let timeline: MoodTimeline = {
    mood: randomMood(),
    phase: "hold",
    elapsed: 0,
  };
  let frameCount = 0;
  let activeTime = 0;
  let introTime = 0;
  let calmTarget = false;
  let hoverIndex = -1;
  let openAmount = 0;
  let pointerHits = 0;
  let blockHits = 0;
  let sloganHits = 0;
  let rainAccumulator = 0;
  let sharePending: (() => void) | null = null;
  let disposed = false;

  const applyPalette = () => {
    const stops =
      timeline.phase === "transition"
        ? transitionStops(timeline.mood, timeline.elapsed / TRANSITION_SECONDS)
        : { from: timeline.mood, to: timeline.mood, mix: 0 };
    const from = palettes[stops.from];
    const to = palettes[stops.to];
    const colors = {
      sky: skyColor,
      horizon: horizonColor,
      water: waterColor,
      sun: sunColor,
    };
    for (const key of colorKeys)
      colors[key].copy(from[key]).lerp(to[key], stops.mix);
    const values = {} as Record<(typeof numberKeys)[number], number>;
    for (const key of numberKeys)
      values[key] = THREE.MathUtils.lerp(from[key], to[key], stops.mix);
    ambient.intensity = values.ambient;
    sun.intensity = values.power;
    sun.color.copy(sunColor);
    renderer.toneMappingExposure = values.exposure;
    scene.fog!.color.copy(horizonColor);
    (scene.fog as THREE.FogExp2).density = values.haze;
    water.color.copy(waterColor);
    water.setConditions(values.wave, values.rain);
    return values.rain;
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
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
    if (timeline.phase === "transition" || (!calmTarget && frame.calm < 0.1))
      timeline = advanceMood(timeline, wallDelta);
    const rain = applyPalette();
    rainAccumulator += Math.min(wallDelta, 1) * rain;
    while (rainAccumulator > 0.3) {
      rainAccumulator -= 0.3;
      water.addRipple(
        (Math.random() - 0.5) * 24,
        (Math.random() - 0.5) * 22,
        activeTime,
        0.08,
      );
    }

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
        if (hoverIndex >= 0 && blocks[hoverIndex].hover < 0.1) blockHits++;
      }
      const sloganHit = slogan.interact(raycaster);
      if (sloganHit && sloganHit.distanceTo(lastSloganHit) > 0.3) {
        slogan.pulse(sloganHit);
        lastSloganHit.copy(sloganHit);
        water.addRipple(sloganHit.x, sloganHit.z, activeTime, 0.28);
        sloganHits++;
      }
      if (raycaster.ray.intersectPlane(waterPlane, waterHit)) {
        if (
          Math.abs(waterHit.x) < 35 &&
          Math.abs(waterHit.z) < 35 &&
          waterHit.distanceTo(previousHit) > 0.24
        ) {
          water.addRipple(waterHit.x, waterHit.z, activeTime, 0.2);
          previousHit.copy(waterHit);
          pointerHits++;
        }
      }
    }

    const intro = THREE.MathUtils.smoothstep(introTime, 0, 2.2);
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
        ? 0.22 + Math.sin(time * 2) * 0.06 + frame.share * 0.45
        : 0.035 * spread + frame.share * 0.12;
    }
    openAmount +=
      ((hoverIndex >= 0 ? 1 : 0) - openAmount) *
      (1 - Math.exp(-activeDelta * 6));
    slogan.update(time, delta, frame.share, frame.calm);
    water.update(activeTime);
    renderer.render(scene, camera);
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
    canvas.dataset.mood = timeline.mood;
    canvas.dataset.nextMood = nextMood(timeline.mood);
    canvas.dataset.phase = timeline.phase;
    canvas.dataset.transitioning = String(timeline.phase === "transition");
    canvas.dataset.elapsed = timeline.elapsed.toFixed(2);
    canvas.dataset.pointerHits = String(pointerHits);
    canvas.dataset.rippleEnergy = water.rippleEnergy.toFixed(3);
    canvas.dataset.openAmount = openAmount.toFixed(3);
    canvas.dataset.blockHits = String(blockHits);
    canvas.dataset.sloganHits = String(sloganHits);
    canvas.dataset.sloganScatter = Number(
      slogan.group.userData.peakScatter ?? 0,
    ).toFixed(3);
    const bounds = slogan.projectedBounds(
      camera,
      canvas.clientWidth,
      canvas.clientHeight,
    );
    canvas.dataset.sloganChallengeBounds = JSON.stringify(bounds.challenge);
    canvas.dataset.sloganShareBounds = JSON.stringify(bounds.share);
  };

  resize();
  applyPalette();
  return {
    resize,
    render,
    texturesReady: Promise.resolve(true),
    pointer(x: number, y: number) {
      pointer.set(x, y);
    },
    pointerLeave() {
      pointer.set(2, 2);
      previousHit.set(1000, 0, 1000);
      lastSloganHit.set(1000, 1000, 1000);
    },
    calm(on: boolean) {
      calmTarget = on;
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
      slogan.dispose();
      water.dispose();
      skyGeometry.dispose();
      skyMaterial.dispose();
      for (const block of blocks) block.material.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      renderer.dispose();
    },
  };
}
