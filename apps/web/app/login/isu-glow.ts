import * as THREE from "three";
import {
  BLOCK_GAP,
  blockBounds,
  type BlockSpec,
  type Letter,
} from "./isu-layout";

// 같은 글자 이웃이 왼쪽/오른쪽/아래/위에 있으면 1, 없으면 0. 블록 면으로 번지는 옆면/틈
// 빛(isu-blocks.ts)이 이 이웃 판정을 쓴다.
export function seamSides(
  spec: BlockSpec,
  specs: BlockSpec[],
): [number, number, number, number] {
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
  return [left ? 1 : 0, right ? 1 : 0, below ? 1 : 0, above ? 1 : 0];
}

// 글자마다 블록 뒤쪽에 발광면을 둔다(랜딩 cavityLight + glowMaterial과 같은 자리, 같은
// 역할). 실제 THREE.PointLight를 장면에 두면 다른 모든 블록/지형 재질이 그 빛까지 매
// 프레임 계산해야 해 SwiftShader 기준 e2e가 눈에 띄게 느려졌다(3:1 대비 검사가 150초
// 제한을 넘겼다). 대신 재질 자체에 셰이더로 명암을 그려 넣어 장면에 새 광원을 더하지
// 않는다. 발광면은 글자 외접 사각형 하나가 아니라 블록마다 그 블록 앞면 윤곽(둥근
// 모서리와 S의 비스듬한 윤곽 포함)을 조금 안쪽으로 줄인 판 하나씩을 합친 기하다. 블록이
// 벌어져 틈이 생겨도 그 틈 뒤에는 항상 그 자리 블록 자신의 윤곽만 있어, 글자 실루엣
// 밖으로 빛 판이 드러나지 않는다. 가만히 있을 때는 거의 꺼져 있다가, 그 글자 블록들이
// 벌어질수록 밝아지고 불투명해져 틈 사이로 명암 있는 흰빛이 비친다.
const CAVITY_EDGE_INSET = 0.15; // build_isu_blocks.py BEVEL_RADIUS_RATIO와 같은 비율만큼 각 변에서 줄인다.
const CAVITY_CORNER_INSET = 0.4; // 로고의 큰 반경 둥근 모서리(corner != "none")가 있는 블록은 더 넉넉히 줄인다.
const CAVITY_SLANT_SCALE = 0.85; // S의 비스듬한 윤곽은 중심 기준으로 고르게 줄인다.

export function createCavityGlow(specs: BlockSpec[], frost: THREE.Texture) {
  const group = new THREE.Group();
  const letters: Letter[] = ["i", "s", "u"];
  const materials = new Map<Letter, THREE.MeshBasicMaterial>();
  const uniforms = new Map<Letter, { value: number }>();
  for (const letter of letters) {
    const blocks = specs.filter((spec) => spec.letter === letter && !spec.dot);
    const bounds = blocks.map(blockBounds);
    const minX = Math.min(...bounds.map((b) => b.min[0]));
    const maxX = Math.max(...bounds.map((b) => b.max[0]));
    const minY = Math.min(...bounds.map((b) => b.min[1]));
    const maxY = Math.max(...bounds.map((b) => b.max[1]));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const halfWidth = (maxX - minX) / 2;
    const halfHeight = (maxY - minY) / 2;

    const positions: number[] = [];
    const glowUvs: number[] = [];
    const pushCorner = (x: number, y: number) => {
      positions.push(x, y, -0.5);
      glowUvs.push((x - cx) / halfWidth, (y - cy) / halfHeight);
    };
    // corners는 왼쪽 아래, 오른쪽 아래, 오른쪽 위, 왼쪽 위(반시계 방향)여야 plane과 같은
    // +z 방향 앞면이 나온다.
    const pushQuad = (corners: [number, number][]) => {
      const [bl, br, tr, tl] = corners;
      pushCorner(...bl);
      pushCorner(...br);
      pushCorner(...tr);
      pushCorner(...bl);
      pushCorner(...tr);
      pushCorner(...tl);
    };
    for (const spec of blocks) {
      const [bx, by] = spec.center;
      if (spec.outline) {
        pushQuad(
          spec.outline.map(([ox, oy]): [number, number] => [
            bx + ox * CAVITY_SLANT_SCALE,
            by + oy * CAVITY_SLANT_SCALE,
          ]) as [number, number][],
        );
      } else {
        const [width, height] = spec.size;
        const inset =
          Math.min(width, height) *
          (spec.corner === "none" ? CAVITY_EDGE_INSET : CAVITY_CORNER_INSET);
        const hw = width / 2 - inset;
        const hh = height / 2 - inset;
        pushQuad([
          [bx - hw, by - hh],
          [bx + hw, by - hh],
          [bx + hw, by + hh],
          [bx - hw, by + hh],
        ]);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "glowUv",
      new THREE.Float32BufferAttribute(glowUvs, 2),
    );
    const intensity = { value: 0 };
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uCavityGrain = { value: frost };
      shader.uniforms.uCavityIntensity = intensity;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec2 glowUv; varying vec2 vGlowUv;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvGlowUv = glowUv;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform sampler2D uCavityGrain; uniform float uCavityIntensity; varying vec2 vGlowUv;",
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          // 질감은 휘도만 밝기 변화에 쓴다. 석고 원본의 갈색 회색이 색에 섞이지 않는다.
          float cavityLuma = dot(texture2D(uCavityGrain, vGlowUv * 3.).rgb, vec3(.299, .587, .114));
          float cavityRadial = 1. - smoothstep(0., 1., length(vGlowUv));
          diffuseColor.rgb = vec3(.85, .94, 1.) * mix(.55, 1.2, cavityLuma) * mix(.35, 1.3, cavityRadial) * uCavityIntensity;`,
        );
    };
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    materials.set(letter, material);
    uniforms.set(letter, intensity);
  }
  return {
    group,
    setGlow(letter: Letter, intensity: number, opacity: number) {
      uniforms.get(letter)!.value = intensity;
      materials.get(letter)!.opacity = opacity;
    },
    dispose() {
      for (const material of materials.values()) material.dispose();
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
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
