import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { ATMOSPHERE_GLSL } from "./isu-atmosphere";

// 하늘 LUT: 가로는 방위 atan(x, -z)라 이음새가 카메라 뒤(+z)에 있다. 세로는 고도의 제곱근이라
// 수평선 근처가 촘촘하다. 수평선 아래 방향은 고도 0 행을 읽어 수면 안개와 같은 색이 된다.
export const SKY_LUT_GLSL = `
vec2 skyLutUv(vec3 direction) {
  float elevation = asin(clamp(direction.y, 0., 1.));
  return vec2(atan(direction.x, -direction.z) * .1591549 + .5, sqrt(elevation * .6366198));
}`;

// 해 원판 각반지름 0.45도(라디안). 실제보다 조금 크게 둔다.
const SUN_RADIUS = 0.00785;

export function createIsuSky(scene: THREE.Scene) {
  const lut = new THREE.WebGLRenderTarget(256, 128, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
  const sunDirection = new THREE.Vector3(0, 1, 0);
  const sunRadiance = new THREE.Color(0, 0, 0);
  const lutMaterial = new THREE.ShaderMaterial({
    uniforms: { sunDirection: { value: sunDirection } },
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
    fragmentShader: `${ATMOSPHERE_GLSL}
      uniform vec3 sunDirection;
      varying vec2 vUv;
      void main() {
        float azimuth = (vUv.x - .5) * 6.2831853;
        float elevation = vUv.y * vUv.y * 1.5707963;
        vec3 direction = vec3(cos(elevation) * sin(azimuth), sin(elevation), -cos(elevation) * cos(azimuth));
        gl_FragColor = vec4(atmosphereRadiance(direction, sunDirection), 1.);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const lutQuad = new FullScreenQuad(lutMaterial);

  const domeGeometry = new THREE.SphereGeometry(180, 32, 16);
  const domeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      skyLut: { value: lut.texture },
      sunDirection: { value: sunDirection },
      sunRadiance: { value: sunRadiance },
      stars: { value: 0 },
      time: { value: 0 },
    },
    // 방향을 카메라 기준으로 구해 수면 반사용 가상 카메라에서도 맞는 하늘을 그린다.
    vertexShader: `varying vec3 vDirection;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.);
        vDirection = world.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `${SKY_LUT_GLSL}
      uniform sampler2D skyLut;
      uniform vec3 sunDirection, sunRadiance;
      uniform float stars, time;
      varying vec3 vDirection;
      float starHash(vec3 cell) { return fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 direction = normalize(vDirection);
        vec3 color = texture2D(skyLut, skyLutUv(direction)).rgb;
        // 해 원판과 가장자리 어두움. 수면 아래 가상 카메라(반사)에서는 그리지 않는다.
        // 물에 비친 해는 수면 셰이더의 반짝임이 맡는다.
        float radius = length(direction - sunDirection) / ${SUN_RADIUS};
        if (radius < 1. && cameraPosition.y > 0.) {
          float limb = 1. - .6 * (1. - sqrt(1. - radius * radius));
          color += sunRadiance * limb * smoothstep(1., .85, radius) * smoothstep(-.004, .003, direction.y);
        }
        // 밤의 별: 방향을 격자로 나눠 드물게 점을 찍고 천천히 깜박인다.
        if (stars > 0.) {
          vec3 grid = direction * 320.;
          float seed = starHash(floor(grid));
          float point = smoothstep(.32, 0., length(fract(grid) - .5)) * step(.9965, seed);
          float twinkle = .6 + .4 * sin(time * (1.5 + seed * 3.) + seed * 40.);
          color += vec3(.75, .85, 1.) * point * twinkle * stars * .06 * smoothstep(.02, .2, direction.y);
        }
        gl_FragColor = vec4(color, 1.);
      }`,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(domeGeometry, domeMaterial);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);

  return {
    lut: lut.texture,
    update(
      renderer: THREE.WebGLRenderer,
      sun: THREE.Vector3,
      disc: THREE.Color,
      starAmount: number,
      time: number,
    ) {
      sunDirection.copy(sun);
      sunRadiance.copy(disc);
      domeMaterial.uniforms.stars.value = starAmount;
      domeMaterial.uniforms.time.value = time;
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(lut);
      lutQuad.render(renderer);
      renderer.setRenderTarget(previous);
    },
    dispose() {
      scene.remove(dome);
      domeGeometry.dispose();
      domeMaterial.dispose();
      lutMaterial.dispose();
      lutQuad.dispose();
      lut.dispose();
    },
  };
}
