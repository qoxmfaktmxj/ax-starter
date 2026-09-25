import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { BlockSpec } from "./isu-layout";

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
};

type IceMaps = { frost: THREE.Texture; bump: THREE.Texture };

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
function addIceSurface(shader: Shader, shared: IceShared) {
  shader.uniforms.uIceGlow = shared.glow;
  shader.uniforms.uSnow = shared.snow;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute vec4 color; varying vec4 vIceBake; varying vec3 vIceWorld; varying vec3 vIceNormal;",
    )
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvIceBake = color;",
    )
    .replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvIceWorld = (modelMatrix * vec4(transformed, 1.)).xyz; vIceNormal = normalize(mat3(modelMatrix) * objectNormal);",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform vec3 uIceGlow; uniform vec3 uSnow; varying vec4 vIceBake; varying vec3 vIceWorld; varying vec3 vIceNormal;",
    )
    .replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float bakedAo = vIceBake.r;
      float wear = vIceBake.g;
      float tint = vIceBake.b;
      float frostGrain = texture2D(map, vMapUv * 2.0).r;
      float fineGrain = texture2D(map, vIceWorld.xy * .9 + vIceWorld.z * .37).g;
      vec3 blueDeep = diffuse * .6;
      vec3 blueLight = mix(diffuse, vec3(.75, .9, 1.), .45);
      vec3 stone = mix(blueDeep, blueLight, smoothstep(.15, .85, frostGrain * .6 + fineGrain * .25 + tint * .15));
      float blotch = texture2D(map, vIceWorld.xy * .25 + vIceWorld.z * .11).b;
      stone *= .88 + blotch * .24;
      float snowCover = smoothstep(.5, .9, vIceNormal.y) * (.55 + .45 * fineGrain);
      stone = mix(stone, uSnow, snowCover);
      stone = mix(stone, vec3(.86, .95, 1.), smoothstep(.2, .7, wear) * .5);
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
      totalEmissiveRadiance += uIceGlow * (frostRim * .16 * bakedAo + wear * wear * .12);`,
    );
}

export function createIceMaterial(
  maps: IceMaps,
  shared: IceShared,
  color: THREE.Color,
) {
  const material = new THREE.MeshStandardMaterial({
    color,
    map: maps.frost,
    normalMap: maps.bump,
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.6,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    addIceSurface(shader, shared);
    addReveal(shader, shared.reveal);
  };
  material.customProgramCacheKey = () => "isu-ice";
  return material;
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
