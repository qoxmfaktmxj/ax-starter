import * as THREE from "three";
import { BLOCK_GAP, type BlockSpec } from "./isu-layout";

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
  cores.forEach((spec, index) => {
    // 둥근 모서리 블록은 심이 모서리 밖으로 비치지 않게 작게 둔다.
    const cover =
      spec.corner === "none" ? BLOCK_GAP * 1.6 : -spec.size[1] * 0.55;
    position.set(
      spec.center[0],
      spec.center[1],
      spec.center[2] - spec.size[2] * 0.28,
    );
    rotation.setFromAxisAngle(axis, spec.rotation);
    scale.set(spec.size[0] + cover, spec.size[1] + cover, spec.size[2] * 0.4);
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

// 글자 아래 바닥에 번지는 빛. 가운데는 푸른 흰빛, 초록 큐브 아래는 연두 빛이다.
export function createGroundGlow(
  width: number,
  depth: number,
  dotX: number,
  ice: THREE.Color,
  lime: THREE.Color,
) {
  const uniforms = {
    uIce: { value: 0.35 },
    uLime: { value: 0.4 },
    uDotX: { value: dotX / (width / 2) },
    uIceColor: { value: ice.clone() },
    uLimeColor: { value: lime.clone() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader:
      "varying vec2 vGlowUv; void main(){ vGlowUv = uv * 2. - 1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: `uniform float uIce, uLime, uDotX; uniform vec3 uIceColor, uLimeColor; varying vec2 vGlowUv;
      void main(){
        float ice = exp(-(vGlowUv.x * vGlowUv.x * 2.4 + vGlowUv.y * vGlowUv.y * 7.));
        float dx = vGlowUv.x - uDotX;
        float lime = exp(-(dx * dx * 18. + vGlowUv.y * vGlowUv.y * 10.));
        gl_FragColor = vec4(uIceColor * ice * uIce + uLimeColor * lime * uLime, 1.);
      }`,
  });
  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return {
    mesh,
    setIntensity(iceValue: number, limeValue: number) {
      uniforms.uIce.value = iceValue;
      uniforms.uLime.value = limeValue;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
