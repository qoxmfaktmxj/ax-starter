import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { loadBlockMeshes } from "./isu-blocks";
import { buildIsuLayout } from "./isu-layout";
import { createLoginMotion } from "./login-motion";
import {
  advanceMood,
  MOODS,
  nextMood,
  randomMood,
  sunArc,
  TRANSITION_SECONDS,
  transitionStops,
  type MoodId,
  type MoodTimeline,
} from "./isu-water-moods";
import { createIsuWater } from "./isu-water";

const colorKeys = ["sky", "horizon", "water", "sun"] as const;
const numberKeys = [
  "power",
  "ambient",
  "exposure",
  "rain",
  "wave",
  "haze",
  "sunset",
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
  const modelBlocks = await loadBlockMeshes(layout.length, signal);
  const geometries = modelBlocks.map((block) => block.geometry);
  if (signal.aborted) {
    geometries.forEach((geometry) => geometry.dispose());
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
  scene.fog = new THREE.FogExp2("#f0e6e0", 0.005);
  const skyColor = new THREE.Color();
  const horizonColor = new THREE.Color();
  const sunColor = new THREE.Color();
  const sunDirection = new THREE.Vector3(0, -0.13, -1);
  const waterColor = new THREE.Color();
  const skyGeometry = new THREE.SphereGeometry(180, 32, 16);
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      sky: { value: skyColor },
      horizon: { value: horizonColor },
      sunColor: { value: sunColor },
      sunDirection: { value: sunDirection },
      sunStrength: { value: 0 },
      sunset: { value: 0 },
    },
    vertexShader: `varying vec3 vDirection;
      void main(){vec4 p=modelMatrix*vec4(position,1.);vDirection=normalize(p.xyz);
      gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `uniform vec3 sky,horizon,sunColor,sunDirection;
      uniform float sunset,sunStrength;varying vec3 vDirection;
      void main(){float h=smoothstep(-.04,.64,vDirection.y);
      vec3 color=mix(horizon,sky,h);
      float towardSun=dot(normalize(vDirection),normalize(sunDirection));
      float halo=pow(max(towardSun,0.),90.);
      float disc=smoothstep(.9935,.9955,towardSun);
      vec3 discColor=mix(sunColor,vec3(1.,.6,.27),sunset*.65);
      float horizonHaze=exp(-abs(vDirection.y)*46.);
      color+=sunColor*horizonHaze*(.045+sunStrength*.09);
      color+=discColor*halo*sunStrength*(.26+.2*sunset);
      color=mix(color,discColor,disc*sunStrength*.9);
      gl_FragColor=vec4(color,1.);
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
  const rimBaseColor = rim.color.clone();
  const hoverLight = new THREE.PointLight("#c8eaff", 0, 2.7, 2);
  scene.add(hoverLight);
  const water = createIsuWater(scene);

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
    material.emissive = new THREE.Color(spec.dot ? "#2a3d00" : "#008fd4");
    material.emissiveIntensity = spec.dot ? 0.22 : 0.025;
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
  const previousHit = new THREE.Vector3(1000, 0, 1000);
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
    const arc = sunArc(timeline);
    sunDirection.set(arc.x, arc.height, -1).normalize();
    skyMaterial.uniforms.sunStrength.value = arc.strength;
    ambient.intensity = values.ambient;
    sun.intensity = values.power * (arc.active ? 0.6 + arc.strength * 0.4 : 1);
    sun.color.copy(sunColor);
    if (arc.active)
      sun.position.set(-5 + arc.x * 20, 1 + Math.max(0, arc.height) * 40, 7);
    else sun.position.set(-6, 9, 7);
    rim.intensity = 0.55 + arc.strength * 0.3;
    rim.color.copy(rimBaseColor).lerp(sunColor, arc.strength * 0.65);
    renderer.toneMappingExposure = values.exposure;
    scene.fog!.color.copy(horizonColor);
    (scene.fog as THREE.FogExp2).density = values.haze;
    skyMaterial.uniforms.sunset.value = values.sunset;
    water.color.copy(waterColor);
    water.setConditions(values.wave, values.rain);
    water.setSun(arc.x, arc.strength, sunColor);
    canvas.dataset.sunX = arc.x.toFixed(3);
    canvas.dataset.sunHeight = arc.height.toFixed(3);
    canvas.dataset.sunStrength = arc.strength.toFixed(2);
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
      const angle = Math.random() * Math.PI * 2;
      water.addRipple(
        (Math.random() - 0.5) * 24,
        (Math.random() - 0.5) * 22,
        activeTime,
        0.08,
        Math.cos(angle),
        Math.sin(angle),
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
        if (hoverIndex >= 0) {
          hoverLight.position
            .copy(blockHit.point)
            .addScaledVector(raycaster.ray.direction, -0.65);
          hoverLight.color.set(
            blocks[hoverIndex].spec.dot ? "#f0fad4" : "#c8eaff",
          );
          if (blocks[hoverIndex].hover < 0.1) blockHits++;
        }
      }
      if (raycaster.ray.intersectPlane(waterPlane, waterHit)) {
        if (
          Math.abs(waterHit.x) < 35 &&
          Math.abs(waterHit.z) < 35 &&
          waterHit.distanceTo(previousHit) > 0.24
        ) {
          water.addRipple(
            waterHit.x,
            waterHit.z,
            activeTime,
            0.3,
            previousHit.x === 100 ? 1 : waterHit.x - previousHit.x,
            previousHit.z === 100 ? 0 : waterHit.z - previousHit.z,
          );
          previousHit.copy(waterHit);
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
        ? 0.22 + Math.sin(time * 2) * 0.06 + frame.share * 0.45
        : 0.025 + 0.035 * spread + frame.share * 0.12;
    }
    openAmount +=
      ((hoverIndex >= 0 ? 1 : 0) - openAmount) *
      (1 - Math.exp(-activeDelta * 6));
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
    canvas.dataset.blockLight = hoverLight.intensity.toFixed(2);
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
      water.dispose();
      skyGeometry.dispose();
      skyMaterial.dispose();
      environment.dispose();
      for (const block of blocks) block.material.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      renderer.dispose();
    },
  };
}
