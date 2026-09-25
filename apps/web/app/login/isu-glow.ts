import * as THREE from "three";
import { BLOCK_GAP, blockBounds, type BlockSpec } from "./isu-layout";

const FILL = BLOCK_GAP * 0.6; // 이웃 쪽으로 틈을 메우는 길이
const INSET = 0.03; // 글자 바깥쪽은 블록 안으로 줄인다

// 심의 로컬 상자(회전 전, 블록 중심 기준)를 정한다. 이웃이 있는 쪽으로만 틈을 메우고
// 글자 바깥쪽과 둥근 모서리 쪽은 블록 안으로 줄여 실루엣 밖으로 빛이 새지 않게 한다.
function coreBox(spec: BlockSpec, specs: BlockSpec[]) {
  const [width, height] = spec.size;
  if (spec.rotation !== 0)
    // 대각선 획 블록은 획 방향 양 끝만 이웃과 닿는다.
    return {
      x0: -width / 2 - FILL,
      x1: width / 2 + FILL,
      y0: -height / 2 + INSET,
      y1: height / 2 - INSET,
    };
  const me = blockBounds(spec);
  const others = specs
    .filter(
      (other) => other !== spec && other.letter === spec.letter && !other.dot,
    )
    .map(blockBounds);
  const overlapsY = (b: ReturnType<typeof blockBounds>) =>
    b.min[1] < me.max[1] - 0.05 && b.max[1] > me.min[1] + 0.05;
  const overlapsX = (b: ReturnType<typeof blockBounds>) =>
    b.min[0] < me.max[0] - 0.05 && b.max[0] > me.min[0] + 0.05;
  const near = BLOCK_GAP * 1.5;
  const left = others.some(
    (b) => overlapsY(b) && Math.abs(b.max[0] - me.min[0]) < near,
  );
  const right = others.some(
    (b) => overlapsY(b) && Math.abs(b.min[0] - me.max[0]) < near,
  );
  const below = others.some(
    (b) => overlapsX(b) && Math.abs(b.max[1] - me.min[1]) < near,
  );
  const above = others.some(
    (b) => overlapsX(b) && Math.abs(b.min[1] - me.max[1]) < near,
  );
  // 둥근 모서리 블록은 그 모서리 쪽 두 변을 크게 줄여 네모난 빛이 곡선 밖으로 나오지 않게 한다.
  const round = Math.min(width, height) * 0.35;
  const cut = (side: "l" | "r" | "t" | "b") =>
    spec.corner !== "none" && spec.corner.includes(side) ? round : INSET;
  return {
    x0: -width / 2 + (left ? -FILL : cut("l")),
    x1: width / 2 - (right ? -FILL : cut("r")),
    y0: -height / 2 + (below ? -FILL : cut("b")),
    y1: height / 2 - (above ? -FILL : cut("t")),
  };
}

// 블록 뒤쪽 절반을 채우는 빛나는 심. 블록 틈으로 빛이 새고, 블록이 벌어지면 심이 드러나 더 밝게 보인다.
export function createGlowCores(specs: BlockSpec[], color: THREE.Color) {
  const cores = specs.filter((spec) => !spec.dot);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: color.clone(),
    toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, cores.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 0, 1);
  const boxCenter = new THREE.Vector2();
  cores.forEach((spec, index) => {
    const box = coreBox(spec, specs);
    boxCenter.set((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2);
    boxCenter.rotateAround(new THREE.Vector2(0, 0), spec.rotation);
    position.set(
      spec.center[0] + boxCenter.x,
      spec.center[1] + boxCenter.y,
      spec.center[2] - spec.size[2] * 0.28,
    );
    rotation.setFromAxisAngle(axis, spec.rotation);
    scale.set(box.x1 - box.x0, box.y1 - box.y0, spec.size[2] * 0.4);
    mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
  });
  mesh.instanceMatrix.needsUpdate = true;
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

type Shader = Parameters<THREE.MeshStandardMaterial["onBeforeCompile"]>[0];

// 글자 아래 바닥에 번지는 빛. 지형 셰이더에 직접 더해 굴곡진 지형에도 매끄럽게 번진다.
// 가운데는 푸른 흰빛, 초록 큐브 아래는 연두 빛이다.
export function createGroundGlow(
  width: number,
  depth: number,
  dotX: number,
  ice: THREE.Color,
  lime: THREE.Color,
) {
  const uniforms = {
    // 글자 무리의 바닥 중심(월드 x, z). z는 기존 mesh 오프셋 0.4를 그대로 가져온다.
    uGlowCenter: { value: new THREE.Vector2(0, 0.4) },
    uGlowSize: { value: new THREE.Vector2(width, depth) },
    uIce: { value: 0.35 },
    uLime: { value: 0.4 },
    uDotX: { value: dotX / (width / 2) },
    uIceColor: { value: ice.clone() },
    uLimeColor: { value: lime.clone() },
  };
  return {
    uniforms,
    applyToShader(shader: Shader) {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vGlowWorld;",
        )
        .replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\nvGlowWorld = (modelMatrix * vec4(transformed, 1.)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform vec2 uGlowCenter, uGlowSize;
          uniform float uIce, uLime, uDotX;
          uniform vec3 uIceColor, uLimeColor;
          varying vec3 vGlowWorld;`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          {
            vec2 glowUv = vec2(
              (vGlowWorld.x - uGlowCenter.x) / (uGlowSize.x * .5),
              (vGlowWorld.z - uGlowCenter.y) / (uGlowSize.y * .5)
            );
            float ice = exp(-(glowUv.x * glowUv.x * 2.4 + glowUv.y * glowUv.y * 7.));
            float dx = glowUv.x - uDotX;
            float lime = exp(-(dx * dx * 18. + glowUv.y * glowUv.y * 10.));
            totalEmissiveRadiance += uIceColor * ice * uIce + uLimeColor * lime * uLime;
          }`,
        );
    },
    setIntensity(iceValue: number, limeValue: number) {
      uniforms.uIce.value = iceValue;
      uniforms.uLime.value = limeValue;
    },
    dispose() {},
  };
}
