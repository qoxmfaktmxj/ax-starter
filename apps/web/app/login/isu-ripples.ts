import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

// 포인터 물결: ISU 앞쪽 수면의 작은 파동 방정식. R=높이, G=속도. 한 텍셀은 36 / 256 = 0.14 단위다.
// 카메라(z 11.8) 앞의 모바일 하단 수면도 감쇠 띠 밖에 둔다.
export const RIPPLE_AREA = { x: -16, z: -22, size: 36 };
export const RIPPLE_SIZE = 256;
const STEP_SECONDS = 1 / 60;
const MAX_STEPS = 3;
// 파동 속도 약 1.5 단위/초. 감쇠로 물결이 포인터 뒤에 좁게 남아 약 1초 안에 사라진다.
const WAVE_SPEED = 0.12;
const DAMPING = 0.935;
const DROP_RADIUS = 0.25 / RIPPLE_AREA.size;
// data-ripple-energy용 에너지 값의 감쇠 시간(초). 넣은 세기를 벽시계 시간으로 줄인다.
const ENERGY_SECONDS = 0.35;
const MAX_PENDING = 0.35;

const SIMULATION_GLSL = `
uniform sampler2D state;
uniform vec4 drop;
uniform float strength;
varying vec2 vUv;
float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0., 1.);
  return length(p - a - ab * t);
}
void main() {
  const float texel = 1. / ${RIPPLE_SIZE.toFixed(1)};
  vec4 cell = texture2D(state, vUv);
  float average = (texture2D(state, vUv + vec2(texel, 0.)).r + texture2D(state, vUv - vec2(texel, 0.)).r
    + texture2D(state, vUv + vec2(0., texel)).r + texture2D(state, vUv - vec2(0., texel)).r) * .25;
  cell.g = (cell.g + (average - cell.r) * ${WAVE_SPEED}) * ${DAMPING};
  cell.r = (cell.r + cell.g) * .995;
  float distance = segmentDistance(vUv, drop.xy, drop.zw) / ${DROP_RADIUS};
  cell.r -= strength * exp(-distance * distance);
  gl_FragColor = cell;
}`;

export function createIsuRipples() {
  const options = {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  };
  const targets = [
    new THREE.WebGLRenderTarget(RIPPLE_SIZE, RIPPLE_SIZE, options),
    new THREE.WebGLRenderTarget(RIPPLE_SIZE, RIPPLE_SIZE, options),
  ];
  const drop = new THREE.Vector4(-1, -1, -1, -1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      state: { value: targets[0].texture },
      drop: { value: drop },
      strength: { value: 0 },
    },
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
    fragmentShader: SIMULATION_GLSL,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(material);
  const toUv = (x: number, z: number) => [
    (x - RIPPLE_AREA.x) / RIPPLE_AREA.size,
    (z - RIPPLE_AREA.z) / RIPPLE_AREA.size,
  ];
  let current = 0;
  let pending = 0;
  let pendingEnergy = 0;
  let accumulator = 0;
  let energy = 0;

  return {
    get texture() {
      return targets[current].texture;
    },
    get energy() {
      return energy;
    },
    // 이전 점에서 현재 점까지의 선분을 한 번의 눌림으로 넣는다. strength는 높이 단위다.
    disturb(
      fromX: number,
      fromZ: number,
      toX: number,
      toZ: number,
      strength: number,
    ) {
      const [ax, az] = toUv(fromX, fromZ);
      const [bx, bz] = toUv(toX, toZ);
      if (pending === 0) drop.set(ax, az, bx, bz);
      else drop.set(drop.x, drop.y, bx, bz);
      pending = Math.min(MAX_PENDING, pending + strength);
      pendingEnergy += strength;
    },
    update(renderer: THREE.WebGLRenderer, seconds: number) {
      const elapsed = Math.max(0, seconds);
      energy *= Math.exp(-elapsed / ENERGY_SECONDS);
      energy += pendingEnergy;
      pendingEnergy = 0;
      accumulator = Math.min(accumulator + elapsed, STEP_SECONDS * MAX_STEPS);
      const previous = renderer.getRenderTarget();
      while (accumulator >= STEP_SECONDS) {
        accumulator -= STEP_SECONDS;
        material.uniforms.state.value = targets[current].texture;
        material.uniforms.strength.value = pending;
        pending = 0;
        current = 1 - current;
        renderer.setRenderTarget(targets[current]);
        quad.render(renderer);
      }
      renderer.setRenderTarget(previous);
    },
    dispose() {
      material.dispose();
      quad.dispose();
      targets.forEach((target) => target.dispose());
    },
  };
}
