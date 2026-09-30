import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import seasons from "./login-seasons.json";
import type { LoginSeason } from "./login-season";
import type { StudioFrame } from "./studio-frame";

const MODEL_URL = "/login-scene/studio/isu-studio.glb";
type StudioMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;

// A 새틴 세라믹. render-login-studio.py의 ceramic()과 같은 값이다.
const CERAMIC = {
  metalness: 0,
  roughness: 0.4,
  clearcoat: 0.25,
  clearcoatRoughness: 0.15,
  ior: 1.5,
  envMapIntensity: 0.7,
};
// 실시간 얼음은 투과 없이 흉내 낸다. three.js 투과 패스는 CSS 배경을 보지 못해 흰 반투명으로 나오고,
// 캔버스 전체 크기의 렌더 패스를 매 프레임 한 번 더 돈다.
const ICE = {
  color: [197, 221, 241],
  roughness: 0.3,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
};

function srgb(color: THREE.Color, [r, g, b]: number[]) {
  return color.setRGB(r! / 255, g! / 255, b! / 255, THREE.SRGBColorSpace);
}

/** 큐브를 계절 모양으로 입히고, 그 계절 장식(큐브의 자식 Season_*)만 보이게 한다. */
function dressCube(cube: StudioMesh, season: LoginSeason) {
  const { cube: look, decorations } = seasons[season] as {
    cube: unknown;
    decorations: string[];
  };
  const material = cube.material;
  if (look === "ice") {
    srgb(material.color, ICE.color);
    Object.assign(material, {
      roughness: ICE.roughness,
      clearcoat: ICE.clearcoat,
      clearcoatRoughness: ICE.clearcoatRoughness,
    });
  } else if (Array.isArray(look)) {
    srgb(material.color, look);
  } else {
    // 단풍: 아래 호박색에서 위 단풍 빨강으로. Blender 색 램프(0.15~0.85)와 같은 구간에서 섞는다.
    const { bottom, top } = look as { bottom: number[]; top: number[] };
    const position = cube.geometry.getAttribute("position");
    cube.geometry.computeBoundingBox();
    const { min, max } = cube.geometry.boundingBox!;
    const [from, to, mixed] = [
      srgb(new THREE.Color(), bottom),
      srgb(new THREE.Color(), top),
      new THREE.Color(),
    ];
    const colors = new Float32Array(position.count * 3);
    for (let index = 0; index < position.count; index++) {
      const t = THREE.MathUtils.clamp(
        ((position.getY(index) - min.y) / (max.y - min.y) - 0.15) / 0.7,
        0,
        1,
      );
      mixed.lerpColors(from, to, t).toArray(colors, index * 3);
    }
    cube.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    material.vertexColors = true;
    material.color.set(1, 1, 1);
  }
  for (const child of cube.children) {
    child.visible = decorations.some((name) =>
      child.name.startsWith(`Season_${name}`),
    );
  }
}

export async function createStudioScene(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  season: LoginSeason,
) {
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const meshes: StudioMesh[] = [];
  const originals = new Set<THREE.Material>();
  gltf.scene.traverse((node) => {
    if (
      node instanceof THREE.Mesh &&
      node.name.startsWith("ISU") &&
      node.material instanceof THREE.MeshStandardMaterial
    ) {
      originals.add(node.material);
      node.material = new THREE.MeshPhysicalMaterial({
        color: node.material.color,
        ...CERAMIC,
      });
      meshes.push(node);
    }
  });
  originals.forEach((material) => material.dispose());
  // 장식 메시와 재질까지 gltf 장면 전체를 한 번에 정리한다.
  const disposeMeshes = () => {
    gltf.scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        (node.material as THREE.Material).dispose();
      }
    });
  };
  if (signal.aborted) {
    disposeMeshes();
    throw new DOMException("Scene initialization cancelled", "AbortError");
  }
  const camera = gltf.cameras[0];
  const cube = meshes.find((mesh) => mesh.userData.isuDot);
  if (
    !(camera instanceof THREE.PerspectiveCamera) ||
    meshes.length !== 26 ||
    !cube
  ) {
    disposeMeshes();
    throw new Error("Studio model is incomplete");
  }
  dressCube(cube, season);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  scene.add(gltf.scene);
  const studioEnvironment = new THREE.Scene();
  studioEnvironment.background = new THREE.Color(0.35, 0.35, 0.35);
  RectAreaLightUniformsLib.init();
  const softbox = (
    position: THREE.Vector3,
    intensity: number,
    width: number,
    height: number,
  ) => {
    const light = new THREE.RectAreaLight(0xffffff, intensity, width, height);
    light.position.copy(position);
    light.lookAt(0, 1.6, 0);
    scene.add(light);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    panel.material.color.setRGB(intensity, intensity, intensity);
    panel.position.copy(light.position);
    panel.quaternion.copy(light.quaternion);
    studioEnvironment.add(panel);
  };
  softbox(new THREE.Vector3(-4, 7, 4), 1.5, 5, 5);
  softbox(new THREE.Vector3(0.5, 7, 0), 1.25, 6, 2);
  softbox(new THREE.Vector3(5, 5.5, -2), 2, 4, 4);
  softbox(new THREE.Vector3(1, 2.2, 6), 0.6, 5, 5);
  const environment = new THREE.PMREMGenerator(renderer);
  const environmentMap = environment.fromScene(studioEnvironment, 0.04);
  environment.dispose();
  for (const panel of studioEnvironment.children) {
    if (panel instanceof THREE.Mesh) {
      panel.geometry.dispose();
      panel.material.dispose();
    }
  }
  scene.environment = environmentMap.texture;
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(-4, 7, 4);
  key.target.position.set(0, 1.5, 0);
  scene.add(key, key.target);
  const blocks = meshes.map((mesh) => ({
    mesh,
    base: mesh.position.clone(),
    roll: mesh.rotation.z,
    hover: 0,
    target: 0,
    pulse: 0,
    roughness: mesh.material.roughness,
    clearcoat: mesh.material.clearcoat,
  }));
  const raycaster = new THREE.Raycaster();
  const point = new THREE.Vector2();
  let frame = 0;
  let previous = 0;
  let disposed = false;
  // 컨텍스트를 잃으면 정지 화면으로 남는다. 복구해도 PMREM 환경맵이 사라져 로고가 어둡게 나오므로 다시 그리지 않는다.
  let contextLost = false;
  let hovered = -1;
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  };
  const draw = (now: number) => {
    frame = 0;
    if (disposed || contextLost || document.hidden) return;
    const delta = previous ? Math.min((now - previous) / 1000, 0.05) : 1 / 60;
    previous = now;
    let moving = false;
    let lift = 0;
    for (const block of blocks) {
      block.hover = THREE.MathUtils.damp(block.hover, block.target, 10, delta);
      block.pulse *= Math.exp(-delta * 7);
      moving ||=
        Math.abs(block.hover - block.target) > 0.001 || block.pulse > 0.001;
      const strength = block.hover + block.pulse;
      const amount =
        0.075 * strength * (block.mesh.userData.isuCourse === 0 ? 0.5 : 1);
      block.mesh.position.y = block.base.y + amount;
      block.mesh.rotation.z =
        block.roll + (block.mesh.userData.isuDot ? -1 : 1) * 0.015 * strength;
      block.mesh.material.roughness = block.roughness - 0.06 * block.hover;
      block.mesh.material.clearcoat = block.clearcoat + 0.2 * block.hover;
      lift = Math.max(lift, amount);
    }
    renderer.render(scene, camera);
    canvas.dataset.blockLift = lift.toFixed(4);
    canvas.dataset.ready = "true";
    if (moving) frame = requestAnimationFrame(draw);
    else previous = 0;
  };
  const start = () => {
    if (!frame && !disposed && !contextLost && !document.hidden)
      frame = requestAnimationFrame(draw);
  };
  const leave = () => {
    hovered = -1;
    for (const block of blocks) block.target = 0;
    canvas.dataset.hoveredBlock = "";
    start();
  };
  // 로고 프레임 자리는 StudioLoginScene이 정지 화면과 같은 계산(studioFrame)으로 넘겨준다.
  let view: {
    root: { width: number; height: number };
    frame: StudioFrame;
  } | null = null;
  const apply = () => {
    if (!view) return;
    const { root, frame } = view;
    renderer.setSize(root.width, root.height, false);
    camera.setViewOffset(
      frame.width,
      frame.height,
      -frame.left,
      -frame.top,
      root.width,
      root.height,
    );
    leave();
  };
  const resize = (
    root: { width: number; height: number },
    frame: StudioFrame,
  ) => {
    view = { root, frame };
    apply();
  };
  const visibility = () => (document.hidden ? stop() : start());
  const lost = (event: Event) => {
    event.preventDefault();
    stop();
    contextLost = true;
    canvas.dataset.ready = "static";
  };
  canvas.addEventListener("webglcontextlost", lost);
  document.addEventListener("visibilitychange", visibility);
  return {
    resize,
    leave,
    pointer(x: number, y: number, press = false) {
      const rect = canvas.getBoundingClientRect();
      point.set(
        ((x - rect.left) / rect.width) * 2 - 1,
        1 - ((y - rect.top) / rect.height) * 2,
      );
      raycaster.setFromCamera(point, camera);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      const index = hit
        ? meshes.indexOf(hit.object as (typeof meshes)[number])
        : -1;
      if (index === hovered && !press) return;
      hovered = index;
      const active = blocks[index];
      for (const block of blocks) {
        const distance = active ? block.base.distanceTo(active.base) : Infinity;
        block.target = block === active ? 1 : distance < 1 ? 0.25 : 0;
        if (press && active) block.pulse = Math.max(0, 0.7 - distance * 0.4);
      }
      canvas.dataset.hoveredBlock = active?.mesh.name ?? "";
      start();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", lost);
      disposeMeshes();
      environmentMap.dispose();
      renderer.dispose();
    },
  };
}
