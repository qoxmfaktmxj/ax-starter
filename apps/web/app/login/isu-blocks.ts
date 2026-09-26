import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { BlockSpec, Vec3 } from "./isu-layout";

// 블렌더(tools/blender/build_isu_blocks.py)로 만든 블록 형태를 불러오고 파랑 얼음돌 재질을 입힌다.
const BLOCK_MODEL_URL = "/models/isu-blocks.glb";

export async function loadBlockGeometries(count: number, signal: AbortSignal) {
  const draco = new DRACOLoader().setDecoderPath("/draco/");
  const loader = new GLTFLoader().setDRACOLoader(draco);
  try {
    const gltf = await loader.loadAsync(BLOCK_MODEL_URL);
    if (signal.aborted)
      throw new DOMException("Scene initialization cancelled", "AbortError");
    return Array.from({ length: count }, (_, index) => {
      const name = `block-${String(index).padStart(2, "0")}`;
      const node = gltf.scene.getObjectByName(name);
      if (!(node instanceof THREE.Mesh))
        throw new Error(`블록 모델에 ${name}이 없습니다.`);
      return node.geometry as THREE.BufferGeometry;
    });
  } finally {
    draco.dispose();
  }
}

type Shader = Parameters<THREE.MeshStandardMaterial["onBeforeCompile"]>[0];

export type IceShared = {
  reveal: { value: number };
  glow: { value: THREE.Color };
  snow: { value: THREE.Color };
  tint: { value: number };
};

type IceMaps = { frost: THREE.Texture; bump: THREE.Texture };
// 블렌더에서 구운 아틀라스 질감. normal은 접선 공간 법선, detail은 R=디테일 AO, G=볼록도.
type BlockDetailMaps = { normal: THREE.Texture; detail: THREE.Texture };

// 등장: 윤곽선만 보이다가 재질이 위에서 아래로 차오른다(랜딩 arctic-scene.ts와 같은 방식).
function addReveal(shader: Shader, reveal: { value: number }) {
  shader.uniforms.uIceReveal = reveal;
  shader.vertexShader = `varying vec2 vRevealUv; varying float vRevealY;\n${shader.vertexShader}`;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\nvRevealUv = uv; vRevealY = (modelMatrix * vec4(transformed, 1.)).y;",
  );
  shader.fragmentShader = `uniform float uIceReveal; varying vec2 vRevealUv; varying float vRevealY;\n${shader.fragmentShader}`;
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <tonemapping_fragment>",
    `
      if (uIceReveal < 1.) {
        float scanHeight = mix(4.5, -.8, uIceReveal);
        float solid = smoothstep(scanHeight - .12, scanHeight + .12, vRevealY);
        float border = min(min(vRevealUv.x, vRevealUv.y), min(1. - vRevealUv.x, 1. - vRevealUv.y));
        float outline = 1. - smoothstep(.0, max(fwidth(border) * 1.5, .008), border);
        if (solid < .01 && outline < .15) discard;
        vec3 wire = vec3(.85, 1., 1.1) * pow(outline, .3);
        gl_FragColor.rgb = mix(wire, gl_FragColor.rgb, solid);
        float scanLight = 1. - smoothstep(.02, .24, abs(vRevealY - scanHeight));
        gl_FragColor.rgb += vec3(.7, .85, 1.) * scanLight * .9;
      }
      #include <tonemapping_fragment>`,
  );
}

// 파랑 얼음돌: 굽기 AO로 틈을 어둡게, 깨진 모서리는 밝은 서리로, 위를 향한 면에는 눈을 얹는다.
// half/sides는 블록마다 다른 크기와 이웃 방향(seamSides)이라 재질별 uniform으로 둔다.
function addIceSurface(
  shader: Shader,
  shared: IceShared,
  half: THREE.Vector3,
  sides: [number, number, number, number],
  detailMap: THREE.Texture,
  open: { value: number },
) {
  shader.uniforms.uIceGlow = shared.glow;
  shader.uniforms.uSnow = shared.snow;
  shader.uniforms.uIceTint = shared.tint;
  shader.uniforms.uIceHalf = { value: half };
  shader.uniforms.uIceSides = { value: new THREE.Vector4(...sides) };
  shader.uniforms.uDetailMap = { value: detailMap };
  shader.uniforms.uOpen = open;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform vec4 uIceSides; attribute vec4 color; varying vec4 vIceBake; varying vec3 vIceWorld; varying vec3 vIceNormal; varying vec3 vIceLocal; varying float vIceSide; varying float vIceSideNeighbor;",
    )
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvIceBake = color; vIceLocal = position;",
    )
    .replace(
      "#include <beginnormal_vertex>",
      // 옆면 빛 세기는 로컬 법선에서만 정해져 정점당 한 번이면 되므로, 화소마다 다시
      // 계산하지 않게 여기서 구해 보간한다(SwiftShader 기준 소프트웨어 렌더링 성능).
      `#include <beginnormal_vertex>
      vec3 iceLocalNormal = normalize(objectNormal);
      vIceSide = 1. - abs(iceLocalNormal.z);
      float iceSideAxisSum = max(1e-4, abs(iceLocalNormal.x) + abs(iceLocalNormal.y));
      vIceSideNeighbor = (
        max(0., -iceLocalNormal.x) * uIceSides.x + max(0., iceLocalNormal.x) * uIceSides.y +
        max(0., -iceLocalNormal.y) * uIceSides.z + max(0., iceLocalNormal.y) * uIceSides.w
      ) / iceSideAxisSum;`,
    )
    .replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvIceWorld = (modelMatrix * vec4(transformed, 1.)).xyz; vIceNormal = normalize(mat3(modelMatrix) * objectNormal);",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform vec3 uIceGlow; uniform vec3 uSnow; uniform float uIceTint; uniform vec3 uIceHalf; uniform sampler2D uDetailMap; uniform float uOpen; varying vec4 vIceBake; varying vec3 vIceWorld; varying vec3 vIceNormal; varying vec3 vIceLocal; varying float vIceSide; varying float vIceSideNeighbor;",
    )
    .replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float bakedAo = vIceBake.r;
      float wear = vIceBake.g;
      float tint = vIceBake.b;
      float frostGrain = texture2D(map, vMapUv * 2.0).r;
      float fineGrain = texture2D(map, vIceWorld.xy * .9 + vIceWorld.z * .37).g;
      vec2 sculptDetail = texture2D(uDetailMap, vNormalMapUv).rg;
      vec3 blueDeep = diffuse * .55;
      vec3 blueLight = diffuse * 1.15;
      vec3 stone = mix(blueDeep, blueLight, smoothstep(.15, .85, frostGrain * .6 + fineGrain * .25 + tint * .15));
      float blotch = texture2D(map, vIceWorld.xy * .25 + vIceWorld.z * .11).b;
      stone *= .8 + blotch * .4;
      // 조각본에서 구운 끌 자국/공동 그늘(R)과 볼록한 곳의 서리 하이라이트(G, 윗면만, 최대 0.2).
      stone *= mix(.55, 1., sculptDetail.r);
      stone = mix(stone, uSnow, smoothstep(.4, .9, vIceNormal.y) * sculptDetail.g * .2);
      float snowCover = smoothstep(.5, .9, vIceNormal.y) * (.55 + .45 * fineGrain);
      stone = mix(stone, uSnow, snowCover * .6);
      stone = mix(stone, vec3(.8, .92, 1.), smoothstep(.25, .75, wear) * .3 * smoothstep(.1, .6, vIceNormal.y));
      diffuseColor.rgb = stone * mix(.3, 1., bakedAo);`,
    )
    .replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = mix(.6, .95, clamp(frostGrain * .7 + snowCover * .4, 0., 1.));`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      float frostRim = pow(1. - max(0., dot(normalize(vNormal), normalize(vViewPosition))), 4.);
      totalEmissiveRadiance += uIceGlow * (frostRim * .08 * bakedAo + wear * wear * .12) * .5;
      // 구운 법선과 디테일 AO가 파랑 발광에도 걸리게 해 끌 자국과 공동이 보이게 한다.
      vec3 iceN = normalize((vec4(normal, 0.) * viewMatrix).xyz);
      float iceKey = clamp(dot(iceN, normalize(vec3(-.46, .69, .54))), 0., 1.);
      totalEmissiveRadiance += diffuse * uIceTint * mix(.4, 1., bakedAo) * mix(.5, 1., sculptDetail.r) * mix(.55, 1.2, iceKey);
      // 옆면 빛(랜딩 sideIce): 로컬 법선이 옆(±x, ±y)을 향할수록 밝고, 둥근 모서리에서 부드럽게
      // 이어진다(vIceSide/vIceSideNeighbor는 정점 셰이더에서 구해 보간한 값). 이웃이 있는
      // 쪽은 그대로, 글자 바깥쪽은 0.3으로 줄인다. 가만히 있을 때는 거의 꺼져 있다.
      totalEmissiveRadiance += vec3(.80, .93, 1.08) * frostGrain * vIceSide * (.06 + uOpen * 2.4) * mix(.3, 1., vIceSideNeighbor);
      // 앞면 틈 테두리 빛(랜딩 seamGlow): 앞면에서 블록 가장자리까지 거리로, 이웃이 있는 쪽만.
      float faceFront = 1. - vIceSide;
      vec2 edgeRatio = vec2(abs(vIceLocal.x) / uIceHalf.x, abs(vIceLocal.y) / uIceHalf.y);
      float edgeDistance = .5 - max(edgeRatio.x, edgeRatio.y) * .5;
      float seamGlow = 1. - smoothstep(.012, .075, edgeDistance);
      totalEmissiveRadiance += vec3(.66, .79, .96) * seamGlow * faceFront * vIceSideNeighbor * (.07 + uOpen * .42);
      // 모서리 서리(랜딩 edgeFrost): 시야에 스치는 모서리를 차갑게 밝힌다.
      float edgeFrost = pow(1. - max(0., dot(normalize(vNormal), normalize(vViewPosition))), 3.);
      totalEmissiveRadiance += vec3(.66, .79, .96) * edgeFrost * .12;`,
    );
}

export function createIceMaterial(
  maps: IceMaps,
  blockMaps: BlockDetailMaps,
  shared: IceShared,
  color: THREE.Color,
  size: Vec3,
  sides: [number, number, number, number],
) {
  const material = new THREE.MeshStandardMaterial({
    color,
    map: maps.frost,
    normalMap: blockMaps.normal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.6,
    metalness: 0,
  });
  const half = new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2);
  // 블록마다 벌어짐 정도가 달라 재질별 uniform으로 둔다(장면이 매 프레임 갱신한다).
  const open = { value: 0 };
  material.onBeforeCompile = (shader) => {
    addIceSurface(shader, shared, half, sides, blockMaps.detail, open);
    addReveal(shader, shared.reveal);
  };
  material.customProgramCacheKey = () => "isu-ice";
  return { material, open };
}

// 초록 큐브의 반투명 껍질. 안쪽 코어(createDotCore)가 비쳐 보인다.
export function createDotShellMaterial(
  maps: IceMaps,
  shared: IceShared,
  color: THREE.Color,
) {
  const material = new THREE.MeshStandardMaterial({
    color,
    map: maps.frost,
    normalMap: maps.bump,
    normalScale: new THREE.Vector2(0.25, 0.25),
    roughness: 0.35,
    metalness: 0,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    emissive: color,
    emissiveIntensity: 0.35,
  });
  material.onBeforeCompile = (shader) => addReveal(shader, shared.reveal);
  material.customProgramCacheKey = () => "isu-dot";
  return material;
}

// 초록 큐브 안의 빛나는 코어. 톤 매핑을 받지 않아 빛 번짐이 잘 걸린다.
export function createDotCore(spec: BlockSpec, color: THREE.Color) {
  const geometry = new THREE.BoxGeometry(
    spec.size[0] * 0.55,
    spec.size[1] * 0.55,
    spec.size[2] * 0.55,
  );
  const material = new THREE.MeshBasicMaterial({
    color: color.clone(),
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  return {
    mesh,
    setIntensity(value: number) {
      material.color.copy(color).multiplyScalar(value);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
