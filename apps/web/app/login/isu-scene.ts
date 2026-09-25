import * as THREE from "three";
import {
  createDotCore,
  createDotShellMaterial,
  createIceMaterial,
  loadBlockGeometries,
} from "./isu-blocks";
import { createGlowCores, createGroundGlow, seamSides } from "./isu-glow";
import { drawHud, pickHudPoints, type HudPoint } from "./isu-hud";
import { createIsuLandscape } from "./isu-landscape";
import { buildIsuLayout } from "./isu-layout";
import { applyHaze, createPostChain } from "./isu-post";
import {
  courseFactor,
  createLoginMotion,
  landing,
  LANDING_SPAN,
  shareIntensity,
} from "./login-motion";

// 랜딩 arctic-scene.ts의 지형, 눈, 서리 재질, 윤곽선 등장을 가져와 이글루 대신 ISU 블록을 세운다.
// 구도와 조명은 캡처를 보며 TUNE 값만 조정한다.
const TUNE = {
  camera: new THREE.Vector3(-3.2, 1.9, 13.6),
  lookTarget: new THREE.Vector3(0.25, 1.35, 0),
  letterBaseY: -0.53,
  exposure: 0.8,
  fog: { color: "#131f33", near: 20, far: 80 },
  hemisphere: { sky: 0x6f88b5, ground: 0x0d1422, intensity: 0.9 },
  moon: {
    color: 0xbcd2ff,
    intensity: 1.15,
    position: new THREE.Vector3(-6, 9, 7),
  },
  rim: {
    color: 0x4a6fae,
    intensity: 0.45,
    position: new THREE.Vector3(5, 3, -8),
  },
  isuBlue: new THREE.Color("#0090d0"),
  snow: new THREE.Color("#e6f2ff"),
  terrainColor: 0x8e9bb2,
  iceGlow: new THREE.Color(0.35, 0.62, 0.95),
  coreColor: new THREE.Color(0.85, 0.95, 1),
  iceTint: 0.45,
  lime: new THREE.Color("#a0c840"),
  post: {
    bloom: { strength: 0.25, radius: 0.5, threshold: 1.1 },
    ao: { radius: 0.35, intensity: 0.85 },
    grade: {
      contrast: 1.05,
      lift: 0.012,
      vignette: 0.6,
      grain: 0.012,
      aberration: 0.002,
    },
  },
  haze: { color: new THREE.Color("#22324d"), density: 0.6 },
  glow: {
    core: 4.5,
    coreOpen: 3.6,
    ground: 0.8,
    groundOpen: 0.4,
    lime: 6,
    spill: 0.2,
    spillOpen: 0.15,
  },
  pointerOrbit: { theta: 0.06, phi: 0.025 },
  desktop: { zoomPerAspect: 0.42, offsetX: 0.2, offsetY: 0.06 },
  portrait: { zoomPerAspect: 0.86, offsetY: 0.28 },
};

const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
const noise = (x: number, y: number) => {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let fx = x - ix,
    fy = y - iy;
  fx *= fx * (3 - 2 * fx);
  fy *= fy * (3 - 2 * fy);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), fx),
    THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx),
    fy,
  );
};
const ridge = (x: number, y: number) => {
  let value = 0,
    amplitude = 0.5;
  for (let i = 0; i < 5; i++) {
    value += (1 - Math.abs(noise(x, y) * 2 - 1)) * amplitude;
    x = x * 2.1 + 11;
    y = y * 2.1 - 7;
    amplitude *= 0.48;
  }
  return value;
};
const terrainHeight = (x: number, z: number) => {
  const sx = (x + z) * Math.SQRT1_2,
    depth = (x - z) * Math.SQRT1_2;
  const peak = (px: number, pz: number, width: number, height: number) =>
    height * Math.exp(-((sx - px) ** 2 + (depth - pz) ** 2) / width ** 2);
  const hills =
    peak(-3.7, -7, 3.2, 2.0) +
    peak(-5.4, -9, 3.7, 0.4) +
    peak(7, -5, 4.5, 1.1) +
    peak(-12, 6, 9, 0.7) +
    peak(15, 9, 10, 1.2);
  const middle =
    1.3 *
      Math.exp(-(((sx + 12) / 8) ** 2 + ((depth - 7 - sx * 0.22) / 4) ** 2)) +
    1.5 *
      Math.exp(
        -(((sx - 14) / 10) ** 2 + ((depth - 11 + sx * 0.16) / 4.5) ** 2),
      ) +
    0.9 *
      Math.exp(-(((sx - 1) / 18) ** 2 + ((depth - 22 - sx * 0.12) / 5) ** 2));
  const detail =
    ridge(x * 0.32, z * 0.32) * 0.62 + noise(x * 1.2, z * 1.2) * 0.055;
  // ISU 글자 폭만큼 가운데 평지를 가로로 넓힌다.
  const flatten = THREE.MathUtils.smoothstep(Math.hypot(x * 0.55, z), 2.8, 11);
  return (hills + middle + detail - 0.34) * flatten - 0.51;
};

export async function createIsuScene(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  hudCanvas: HTMLCanvasElement | null = null,
) {
  if (signal.aborted)
    throw new DOMException("Scene initialization cancelled", "AbortError");
  const mobile = window.matchMedia("(pointer: coarse)").matches;
  const texturePath = mobile ? "/images/login/mobile" : "/images/login";
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    // 장면은 MSAA 렌더 타깃에 그리고 캔버스에는 전체 화면 사각형만 그리므로 캔버스 자체 antialias는 끈다.
    antialias: false,
    powerPreference: "low-power",
  });
  const loader = new THREE.TextureLoader();
  const textures: THREE.Texture[] = [];
  const texturesReady = Promise.allSettled(
    [
      `${texturePath}/rough_plaster_03-diffuse.webp`,
      `${texturePath}/rough_plaster_03-nor_gl.webp`,
      `${texturePath}/aerial_rocks_02-diffuse.webp`,
      `${texturePath}/aerial_rocks_02-nor_gl.webp`,
      `${texturePath}/snow_02-diffuse.webp`,
    ].map(
      (url) =>
        new Promise<void>((resolve, reject) => {
          textures.push(loader.load(url, () => resolve(), undefined, reject));
        }),
    ),
  ).then(
    (results) =>
      !signal.aborted &&
      results.every((result) => result.status === "fulfilled"),
  );
  const [frost, bump, terrainMap, terrainBump, snowAlbedo] = textures;
  let shaderFailed = false;
  renderer.debug.onShaderError = () => {
    shaderFailed = true;
  };
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.5),
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TUNE.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(TUNE.fog.color, TUNE.fog.near, TUNE.fog.far);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
  camera.position.copy(TUNE.camera);
  camera.lookAt(TUNE.lookTarget);
  scene.add(
    new THREE.HemisphereLight(
      TUNE.hemisphere.sky,
      TUNE.hemisphere.ground,
      TUNE.hemisphere.intensity,
    ),
  );
  const rim = new THREE.DirectionalLight(TUNE.rim.color, TUNE.rim.intensity);
  rim.position.copy(TUNE.rim.position);
  scene.add(rim);
  const moon = new THREE.DirectionalLight(TUNE.moon.color, TUNE.moon.intensity);
  moon.position.copy(TUNE.moon.position);
  moon.castShadow = true;
  const shadowSize = mobile ? 1024 : 2048;
  moon.shadow.mapSize.set(shadowSize, shadowSize);
  moon.shadow.camera.left = moon.shadow.camera.bottom = -12;
  moon.shadow.camera.right = moon.shadow.camera.top = 12;
  moon.shadow.camera.far = 36;
  moon.shadow.normalBias = 0.035;
  moon.shadow.bias = -0.0002;
  moon.shadow.radius = 3;
  scene.add(moon);

  frost.colorSpace = THREE.SRGBColorSpace;
  snowAlbedo.colorSpace = THREE.SRGBColorSpace;
  snowAlbedo.wrapS = snowAlbedo.wrapT = THREE.RepeatWrapping;
  for (const texture of [frost, bump]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    texture.repeat.set(2.4, 2.4);
  }

  // 등장 진행과 블록 발광은 모든 블록 재질이 함께 쓰는 값이다.
  const reveal = { value: 1 };
  const iceShared = {
    reveal,
    glow: { value: TUNE.iceGlow.clone() },
    snow: { value: TUNE.snow.clone() },
    seam: { value: TUNE.glow.spill },
    seamColor: { value: TUNE.coreColor.clone() },
    tint: { value: TUNE.iceTint },
  };
  const maps = { frost, bump };

  terrainMap.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [terrainMap, terrainBump]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(95, 95);
    texture.anisotropy = 8;
  }
  // 지형 셰이더에 직접 주입하는 바닥 빛. 블록/dot 레이아웃이 준비된 뒤 아래에서 만든다.
  let groundGlow: ReturnType<typeof createGroundGlow>;
  const haze = {
    color: { value: TUNE.haze.color.clone() },
    density: { value: TUNE.haze.density },
  };
  const terrainMaterial = new THREE.MeshStandardMaterial({
    color: TUNE.terrainColor,
    map: terrainMap,
    normalMap: terrainBump,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.98,
    metalness: 0,
  });
  terrainMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uSnowAlbedo = { value: snowAlbedo };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSnowNormal;",
      )
      .replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\nvSnowNormal = normalize(mat3(modelMatrix) * objectNormal);",
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nuniform sampler2D uSnowAlbedo; varying vec3 vSnowNormal;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float frostLuma = dot(diffuseColor.rgb, vec3(.299, .587, .114));
      vec3 snowColor = min(texture2D(uSnowAlbedo, vMapUv * .8).rgb * vec3(1.13, 1.22, 1.35), vec3(.75, .79, .85));
      float windFacing = dot(normalize(vSnowNormal), normalize(vec3(.8, .55, -.7)));
      float cover = .34 + smoothstep(.30, .96, vSnowNormal.y) * .42;
      vec3 snowSurface = mix(vec3(frostLuma * .96, frostLuma, frostLuma * 1.06) * 1.7, snowColor, cover);
      snowSurface *= .80 + texture2D(uSnowAlbedo, vMapUv * 5.).r * .40;
      diffuseColor.rgb = snowSurface * mix(vec3(.38,.43,.56), vec3(1.10,1.13,1.18), smoothstep(-.12,.78,windFacing));`,
    );
    groundGlow.applyToShader(shader);
    applyHaze(shader, haze);
  };
  const terrainSegments = mobile ? 180 : 300;
  const terrainGeometry = new THREE.PlaneGeometry(
    150,
    150,
    terrainSegments,
    terrainSegments,
  );
  terrainGeometry.rotateX(-Math.PI / 2);
  const vertices = terrainGeometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x =
      Math.sign(vertices.getX(i)) *
      75 *
      Math.pow(Math.abs(vertices.getX(i)) / 75, 1.65);
    const z =
      Math.sign(vertices.getZ(i)) *
      75 *
      Math.pow(Math.abs(vertices.getZ(i)) / 75, 1.65);
    vertices.setXYZ(i, x, terrainHeight(x, z) - 0.04, z);
    terrainGeometry.attributes.uv.setXY(i, x / 150 + 0.5, z / 150 + 0.5);
  }
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.receiveShadow = true;
  scene.add(terrain);
  const landscape = createIsuLandscape(
    scene,
    terrainMap,
    terrainBump,
    snowAlbedo,
    ridge,
  );

  // ISU 블록
  const letters = new THREE.Group();
  letters.position.y = TUNE.letterBaseY;
  scene.add(letters);
  const layout = buildIsuLayout();
  // 블렌더로 만든 블록 형태. 불러오지 못하면 렌더러를 정리하고 정지 이미지로 넘어간다.
  let geometries: THREE.BufferGeometry[];
  try {
    geometries = await loadBlockGeometries(layout.length, signal);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  const letterCenters = new Map<string, THREE.Vector3>();
  for (const letter of ["i", "s", "u"] as const) {
    const members = layout.filter((spec) => spec.letter === letter);
    letterCenters.set(
      letter,
      members
        .reduce(
          (sum, spec) => sum.add(new THREE.Vector3(...spec.center)),
          new THREE.Vector3(),
        )
        .divideScalar(members.length),
    );
  }
  const dotCenter = new THREE.Vector3(
    ...layout.find((spec) => spec.dot)!.center,
  );
  const blocks = layout.map((spec, index) => {
    const material = spec.dot
      ? createDotShellMaterial(maps, iceShared, TUNE.lime)
      : createIceMaterial(
          maps,
          iceShared,
          TUNE.isuBlue,
          spec.size,
          seamSides(spec, layout),
        );
    const mesh = new THREE.Mesh(geometries[index], material);
    const base = new THREE.Vector3(...spec.center);
    // 손으로 쌓은 느낌을 주려고 블록마다 위치 편차(폭 10%, 높이 6%)와 깊이 방향 돌출(30%)을 준다.
    base.x += (hash(index, 83) - 0.5) * spec.size[0] * 0.1;
    base.y += (hash(index, 89) - 0.5) * spec.size[1] * 0.06;
    base.z += (hash(index, 97) - 0.5) * spec.size[2] * 0.3;
    // 블록마다 크기 +-6%, 기울기 +-3도 편차를 준다.
    mesh.scale.setScalar(1 + (hash(index, 41) - 0.5) * 0.12);
    const rotation =
      spec.rotation + (hash(index, 53) - 0.5) * THREE.MathUtils.degToRad(6);
    mesh.position.copy(base);
    mesh.rotation.z = rotation;
    mesh.castShadow = mesh.receiveShadow = !spec.dot;
    letters.add(mesh);
    return {
      mesh,
      material,
      base,
      // 글자 가운데에서 조금 바깥으로, 위로, 카메라 쪽으로 벌어진다.
      outward: new THREE.Vector3()
        .subVectors(base, letterCenters.get(spec.letter)!)
        .setZ(0)
        .normalize()
        .multiplyScalar(spec.size[0] * 0.3)
        .add(new THREE.Vector3(0, spec.size[1] * 0.12, 0.35)),
      rotation,
      reach: courseFactor(spec.course),
      dot: spec.dot,
      id: index + 1,
      amount: 0,
      target: 0,
      idle: 0,
      shareDistance: base.distanceTo(dotCenter),
      course: spec.course,
      // 등장 때 흩어진 위치에서 날아와 앉는다.
      from: base
        .clone()
        .add(
          new THREE.Vector3(
            (hash(index, 61) - 0.5) * 3,
            0.8 + hash(index, 67) * 1.6,
            1 + hash(index, 71) * 2,
          ),
        ),
      spin: (hash(index, 73) - 0.5) * 1.2,
      delay: 0,
    };
  });
  const dotSpec = layout.find((spec) => spec.dot)!;
  const dotCore = createDotCore(dotSpec, TUNE.lime);
  blocks.find((block) => block.dot)!.mesh.add(dotCore.mesh);
  // 아래 단부터, 같은 단은 왼쪽부터 차례로 날아와 앉는다. 마지막 블록이 진행 1에서 끝난다.
  [...blocks]
    .sort((a, b) => a.course - b.course || a.base.x - b.base.x)
    .forEach((block, rank, order) => {
      block.delay = (rank / (order.length - 1)) * (1 - LANDING_SPAN);
    });
  const cores = createGlowCores(layout, TUNE.coreColor);
  letters.add(cores.mesh);
  groundGlow = createGroundGlow(
    9,
    4,
    dotSpec.center[0],
    TUNE.iceGlow,
    TUNE.lime,
  );
  const limeLight = new THREE.PointLight(TUNE.lime, 0, 3.5, 2);
  limeLight.position.set(
    dotSpec.center[0],
    dotSpec.center[1],
    dotSpec.center[2] + 0.45,
  );
  letters.add(limeLight);
  const maxShareDistance = Math.max(
    ...blocks.map((block) => block.shareDistance),
  );

  // 등장 순간에만 보이는 가벼운 삼각 연결망이다.
  const introPoints = Array.from(
    { length: 49 },
    (_, index) =>
      new THREE.Vector3(
        ((index % 7) - 3) * 3.3 + (hash(index, 11) - 0.5),
        hash(index, 23) * 2.4 - 0.2,
        (Math.floor(index / 7) - 3) * 3.3 + (hash(index, 37) - 0.5),
      ),
  );
  const introPositions: number[] = [];
  introPoints.forEach((point, index) => {
    for (const offset of [1, 7, 8]) {
      const next = introPoints[index + offset];
      if (!next || (offset !== 7 && index % 7 === 6)) continue;
      if (
        Math.hypot(point.x, point.z) < 3.8 ||
        Math.hypot(next.x, next.z) < 3.8
      )
        continue;
      introPositions.push(point.x, point.y, point.z, next.x, next.y, next.z);
    }
  });
  const introGeometry = new THREE.BufferGeometry();
  introGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(introPositions, 3),
  );
  const introMaterial = new THREE.LineBasicMaterial({
    color: 0xe0edff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const introLines = new THREE.LineSegments(introGeometry, introMaterial);
  scene.add(introLines);
  const introDuration = mobile ? 1.8 : 2.6;
  let introTime = 0,
    introFinished = false;

  const snowCount = mobile ? 600 : 1200;
  const snowPositions = new Float32Array(snowCount * 3);
  const snowVariations = new Float32Array(snowCount);
  for (let i = 0; i < snowCount; i++) {
    snowPositions[i * 3] = (hash(i, 13) - 0.5) * 36;
    snowPositions[i * 3 + 1] = hash(i, 39) * 14;
    snowPositions[i * 3 + 2] = (hash(i, 67) - 0.5) * 36;
    snowVariations[i] = hash(i, 97);
  }
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(snowPositions, 3),
  );
  snowGeometry.setAttribute(
    "variation",
    new THREE.BufferAttribute(snowVariations, 1),
  );
  const snowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: `uniform float uTime,uPixelRatio;attribute float variation;varying float vOpacity;varying vec2 vDirection;
      void main(){
        float speed=.68+variation*.65;
        float gust=sin(uTime*.32)*1.8;
        vec3 velocity=vec3(.82,-.90,.34)*speed;
        vec3 p=position;
        p.x=mod(p.x+18.+uTime*velocity.x+gust,36.)-18.;
        p.z=mod(p.z+18.+uTime*velocity.z,36.)-18.;
        p.y=mod(p.y+uTime*velocity.y+1400.,14.);
        float phase=p.y*.65+uTime*.45+variation*6.283;
        p.x+=sin(phase)*.45;
        velocity.x+=cos(uTime*.32)*.576+cos(phase)*.45*(velocity.y*.65+.45);
        vec4 mv=modelViewMatrix*vec4(p,1.),clip=projectionMatrix*mv;
        vec4 motion=projectionMatrix*vec4(mat3(modelViewMatrix)*velocity,0.);
        vec2 direction=motion.xy*clip.w-clip.xy*motion.w;
        vDirection=normalize(vec2(direction.x,-direction.y));
        gl_Position=clip;
        gl_PointSize=clamp(64.*uPixelRatio*(.65+fract(variation*13.37)*.70)/-mv.z,1.,14.);
        float edges=smoothstep(0.,.8,p.y)*(1.-smoothstep(13.,14.,p.y));
        edges*=(1.-smoothstep(16.,18.,abs(p.x)))*(1.-smoothstep(16.,18.,abs(p.z)));
        vOpacity=(1.-smoothstep(12.,38.,-mv.z))*smoothstep(.6,2.5,-mv.z)*edges*(.55+variation*.25)*.75;
      }`,
    fragmentShader: `varying float vOpacity;varying vec2 vDirection;
      void main(){vec2 p=(gl_PointCoord-.5)*2.;float along=dot(p,vDirection),across=dot(p,vec2(-vDirection.y,vDirection.x));float a=1.-smoothstep(.10,1.,length(vec2(across*2.,along)));gl_FragColor=vec4(.94,.97,1.,a*vOpacity);}`,
    transparent: true,
    depthWrite: false,
  });
  const snow = new THREE.Points(snowGeometry, snowMaterial);
  snow.frustumCulled = false;
  scene.add(snow);

  const post = createPostChain(renderer, scene, camera, TUNE.post, { mobile });

  const motion = createLoginMotion();
  let sharePending: (() => void) | null = null;
  const pointer = new THREE.Vector2(2, 2);
  const dampedPointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const cursorPoint = new THREE.Vector3(100, 100, 100);
  const dampedCursor = cursorPoint.clone();
  const cameraOffset = new THREE.Vector3();
  const interactionPlane = new THREE.Plane();
  const shareColor = new THREE.Color();
  let frames = 0;
  const hudContext = hudCanvas?.getContext("2d") ?? null;
  const hudScale = Math.min(window.devicePixelRatio, 2);
  const projected = new THREE.Vector3();
  let hudAlpha = 0;

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    camera.aspect = width / height;
    // 데스크톱은 글자를 왼쪽 열 가운데로, 좁은 화면은 위쪽 영역으로 옮긴다.
    if (width < 768) {
      camera.zoom = Math.min(1.1, TUNE.portrait.zoomPerAspect * camera.aspect);
      camera.setViewOffset(
        width,
        height,
        0,
        height * TUNE.portrait.offsetY,
        width,
        height,
      );
    } else {
      camera.zoom = Math.min(1.1, TUNE.desktop.zoomPerAspect * camera.aspect);
      camera.setViewOffset(
        width,
        height,
        width * TUNE.desktop.offsetX,
        height * TUNE.desktop.offsetY,
        width,
        height,
      );
    }
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    post.setSize(width, height);
    landscape.resize(canvas.width, canvas.height);
    if (hudCanvas) {
      hudCanvas.width = Math.round(width * hudScale);
      hudCanvas.height = Math.round(height * hudScale);
    }
  };

  const render = (time: number, delta: number, assetsReady: boolean) => {
    if (!introFinished && assetsReady) {
      introTime = Math.min(introDuration, introTime + delta);
      introFinished = introTime >= introDuration;
    }
    const introProgress = introFinished ? 1 : introTime / introDuration;
    const materialize = THREE.MathUtils.smoothstep(introProgress, 0, 1);
    reveal.value = materialize;
    const landscapeAlpha = THREE.MathUtils.smoothstep(
      introProgress,
      0.12,
      0.92,
    );
    terrain.visible = landscapeAlpha > 0;
    terrainMaterial.opacity = landscapeAlpha;
    if (terrainMaterial.transparent !== landscapeAlpha < 1) {
      terrainMaterial.transparent = landscapeAlpha < 1;
      terrainMaterial.needsUpdate = true;
    }
    for (const mesh of landscape.meshes) {
      mesh.visible = landscapeAlpha > 0;
      (mesh.material as THREE.MeshStandardMaterial).opacity = landscapeAlpha;
    }
    introLines.visible = !introFinished;
    introMaterial.opacity =
      (1 - THREE.MathUtils.smoothstep(introProgress, 0.2, 0.9)) * 0.42;
    introLines.scale.setScalar(1 + (1 - materialize) * 0.18);
    introLines.rotation.y = (1 - materialize) * 0.12;

    const frame = motion.update(delta);
    // 초록 큐브는 약 3초 주기로 숨 쉬듯 밝아졌다 어두워진다.
    const breath = 0.5 + 0.5 * Math.sin((time * Math.PI * 2) / 3);
    // 입력 중에는 카메라 추적과 블록 움직임을 약하게 한다.
    const follow = 1 - frame.calm * 0.7;
    const ease = 1 - Math.exp(-delta * 2.15);
    dampedPointer.lerp(pointer.x === 2 ? new THREE.Vector2() : pointer, ease);
    cameraOffset.copy(TUNE.camera).sub(TUNE.lookTarget);
    const spherical = new THREE.Spherical().setFromVector3(cameraOffset);
    spherical.theta +=
      dampedPointer.x * TUNE.pointerOrbit.theta * follow +
      (1 - materialize) * 0.08;
    spherical.phi +=
      dampedPointer.y * TUNE.pointerOrbit.phi * follow -
      (1 - materialize) * (mobile ? 0.25 : 0.45);
    camera.position
      .copy(TUNE.lookTarget)
      .add(cameraOffset.setFromSpherical(spherical));
    camera.lookAt(TUNE.lookTarget);
    if (pointer.x !== 2) {
      raycaster.setFromCamera(pointer, camera);
      const direction = camera.getWorldDirection(new THREE.Vector3());
      interactionPlane.setFromNormalAndCoplanarPoint(
        direction,
        camera.position
          .clone()
          .addScaledVector(
            direction,
            camera.position.distanceTo(TUNE.lookTarget),
          ),
      );
      raycaster.ray.intersectPlane(interactionPlane, cursorPoint);
      letters.worldToLocal(cursorPoint);
      if (dampedCursor.x === 100) dampedCursor.copy(cursorPoint);
      else dampedCursor.lerp(cursorPoint, 1 - Math.exp(-delta * 3));
    } else dampedCursor.set(100, 100, 100);
    letters.position.x = frame.shake * 0.08;

    let hover = false;
    let opened = 0;
    for (const block of blocks) {
      const distance = block.base.distanceTo(dampedCursor);
      const heightGate = block.reach;
      const local =
        (1 - THREE.MathUtils.smoothstep(distance, 0.8, 2.4)) *
        heightGate *
        follow;
      const wave = Math.max(
        0,
        Math.sin(time * 0.78 + block.base.x * 0.8 + block.base.y * 0.45),
      );
      const pulse = 0.35 + (0.5 + 0.5 * Math.sin(time * 0.34)) * 0.65;
      const idleTarget =
        wave *
        wave *
        pulse *
        (0.1 + hash(block.id, 19) * 0.05) *
        heightGate *
        THREE.MathUtils.smoothstep(introProgress, 0.6, 1) *
        follow;
      block.idle = THREE.MathUtils.lerp(
        block.idle,
        idleTarget,
        1 - Math.exp(-delta * 1.6),
      );
      // 포인터에 가까운 블록일수록 반응 속도가 빨라 파도처럼 퍼져 보인다.
      const spreadRate = 3.7 * (1.2 - Math.min(distance, 2.4) / 4);
      block.target = THREE.MathUtils.lerp(
        block.target,
        local * (1.0 + hash(block.id, 7) * 0.4),
        1 - Math.exp(-delta * spreadRate),
      );
      block.amount = THREE.MathUtils.lerp(
        block.amount,
        block.target,
        1 - Math.exp(-delta * spreadRate),
      );
      const land = landing(introProgress, block.delay);
      const spread = Math.max(block.amount, block.idle);
      opened = Math.max(opened, spread);
      block.mesh.position
        .copy(block.from)
        .lerp(block.base, land)
        .addScaledVector(block.outward, spread);
      block.mesh.rotation.set(
        spread * Math.sin(block.id) * 0.2 + (1 - land) * block.spin,
        spread * Math.cos(block.id * 0.9) * 0.2,
        block.rotation +
          spread * Math.sin(block.id * 0.7) * 0.14 +
          (1 - land) * block.spin * 0.5,
      );
      const lit = shareIntensity(
        frame.share,
        block.shareDistance,
        maxShareDistance,
      );
      if (block.dot)
        block.material.emissive
          .copy(TUNE.lime)
          .multiplyScalar(0.35 + breath * 0.25 + lit * 0.8);
      else {
        // 벌어질 때 면은 밝아지지 않는다. 밝아지는 것은 심과 바닥 빛뿐이다.
        block.material.emissive
          .set(0, 0, 0)
          .lerp(shareColor.copy(TUNE.lime).multiplyScalar(1.3), lit);
      }
      if (local > 0.2) hover = true;
    }

    dotCore.setIntensity(1.6 + breath * 0.8 + frame.share * 1.2);
    // 블록이 벌어질수록 심과 바닥 빛, 틈 옆 블록 면으로 번지는 빛이 밝아진다.
    const openness = THREE.MathUtils.smoothstep(opened, 0.02, 0.25);
    cores.setIntensity(TUNE.glow.core + openness * TUNE.glow.coreOpen);
    groundGlow.setIntensity(
      TUNE.glow.ground + openness * TUNE.glow.groundOpen,
      (0.35 + breath * 0.25) * (1 + frame.share),
    );
    limeLight.intensity =
      TUNE.glow.lime * (0.7 + breath * 0.3) * (1 + frame.share);
    iceShared.seam.value = TUNE.glow.spill + openness * TUNE.glow.spillOpen;
    if (hudContext && hudCanvas) {
      hudAlpha = THREE.MathUtils.lerp(
        hudAlpha,
        pointer.x !== 2 && introFinished ? 1 : 0,
        1 - Math.exp(-delta * 4),
      );
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const candidates: HudPoint[] = blocks
        .filter((block) => !block.dot)
        .map((block) => {
          projected.copy(block.mesh.position);
          letters.localToWorld(projected);
          projected.project(camera);
          return {
            id: block.id,
            x: (projected.x * 0.5 + 0.5) * width,
            y: (-projected.y * 0.5 + 0.5) * height,
            distance: block.base.distanceTo(dampedCursor),
          };
        });
      const shown = pickHudPoints(candidates, 8, 4.5);
      drawHud(hudContext, shown, hudAlpha, hudScale);
      hudCanvas.dataset.points = String(hudAlpha > 0.5 ? shown.length : 0);
    }
    snowMaterial.uniforms.uTime.value = time;
    post.render(time);
    if (shaderFailed)
      throw new Error("ISU 장면의 셰이더를 컴파일하지 못했습니다.");
    if (sharePending && frame.share >= 1) {
      sharePending();
      sharePending = null;
    }
    canvas.dataset.ready = assetsReady ? "true" : "loading";
    canvas.dataset.preview = "true";
    canvas.dataset.intro = introFinished ? "complete" : "running";
    canvas.dataset.calm = frame.calm.toFixed(2);
    canvas.dataset.share = frame.share.toFixed(2);
    canvas.dataset.hover = String(hover);
    canvas.dataset.frames = String(++frames);
  };

  resize();
  return {
    resize,
    render,
    texturesReady,
    pointer(x: number, y: number) {
      pointer.set(x, y);
    },
    pointerLeave() {
      pointer.set(2, 2);
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
        sharePending = resolve;
      });
    },
    dispose() {
      hudContext?.clearRect(0, 0, hudCanvas!.width, hudCanvas!.height);
      sharePending?.();
      sharePending = null;
      introGeometry.dispose();
      introMaterial.dispose();
      landscape.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points)
          object.geometry.dispose();
      });
      for (const block of blocks) block.material.dispose();
      dotCore.dispose();
      cores.dispose();
      groundGlow.dispose();
      terrainMaterial.dispose();
      snowMaterial.dispose();
      for (const texture of textures) texture.dispose();
      moon.shadow.map?.dispose();
      post.dispose();
      renderer.dispose();
    },
  };
}
