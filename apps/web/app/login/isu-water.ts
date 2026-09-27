import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { RIPPLE_AREA, RIPPLE_SIZE } from "./isu-ripples";
import { SKY_LUT_GLSL } from "./isu-sky";

// 수면: 거울 반사(Reflector), Blender에서 구운 잔물결 법선 세 겹, 각도별 반사율, 햇빛 반짝임, 수평선 안개.
// 판을 수평선 가까이까지 넓혀 판 끝이 수평선 아래에 띠로 보이지 않게 한다.
const WATER_SIZE = 3000;

export function createIsuWater(
  scene: THREE.Scene,
  options: { normalMap: THREE.Texture; skyLut: THREE.Texture },
) {
  const geometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE);
  const shader = {
    uniforms: {
      color: { value: new THREE.Color() },
      tDiffuse: { value: null },
      textureMatrix: { value: new THREE.Matrix4() },
      time: { value: 0 },
      normalMap: { value: null },
      skyLut: { value: null },
      rippleMap: { value: null },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      sunIrradiance: { value: new THREE.Color() },
      waterColor: { value: new THREE.Color() },
    },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vMirror; varying vec3 vWorld;
      void main(){vMirror=textureMatrix*vec4(position,1.);vWorld=(modelMatrix*vec4(position,1.)).xyz;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `${SKY_LUT_GLSL}
      uniform sampler2D tDiffuse, normalMap, skyLut, rippleMap;
      uniform vec3 sunDirection, sunIrradiance, waterColor;
      uniform float time;
      varying vec4 vMirror;
      varying vec3 vWorld;
      vec2 waveSlope(vec2 p, float scale, vec2 flow) {
        vec3 n = texture2D(normalMap, p * scale + flow * time).xyz * 2. - 1.;
        return n.xy / max(n.z, .25);
      }
      void main() {
        vec2 p = vWorld.xz;
        float distance = length(cameraPosition.xz - p);
        // x 방향으로 늘여 가로로 긴 물마루를 만든다. 참고 사진 1처럼 반사가 가로로 끊긴다.
        vec2 q = p * vec2(.55, 1.);
        vec2 wave = waveSlope(q, .045, vec2(.0035, .010)) * .28
          + waveSlope(mat2(.8, -.6, .6, .8) * q, .13, vec2(-.008, .014)) * .26
          + waveSlope(mat2(.6, .8, -.8, .6) * q, .41, vec2(.011, .019)) * .2;
        vec2 rippleUv = (p - vec2(${RIPPLE_AREA.x.toFixed(1)}, ${RIPPLE_AREA.z.toFixed(1)})) / ${RIPPLE_AREA.size.toFixed(1)};
        float edge = smoothstep(0., .06, min(min(rippleUv.x, 1. - rippleUv.x), min(rippleUv.y, 1. - rippleUv.y)));
        const float texel = 1. / ${RIPPLE_SIZE.toFixed(1)};
        vec2 ripple = vec2(
          texture2D(rippleMap, rippleUv + vec2(texel, 0.)).r - texture2D(rippleMap, rippleUv - vec2(texel, 0.)).r,
          texture2D(rippleMap, rippleUv + vec2(0., texel)).r - texture2D(rippleMap, rippleUv - vec2(0., texel)).r) * edge;
        vec2 slope = wave + ripple * 8.;
        vec3 normal = normalize(vec3(-slope.x, 1., -slope.y));
        vec3 view = normalize(cameraPosition - vWorld);
        float facing = clamp(dot(normal, view), 0., 1.);
        // 물리값(5제곱)보다 반사를 조금 강하게 둔 연출값.
        float fresnel = .02 + .98 * pow(1. - facing, 3.);
        // 물결은 반사를 세로로 더 흔든다. 호버 물결의 흔들림은 0.004 안으로 제한한다.
        vec2 wobble = clamp(vec2(wave.x * .4, wave.y) * .016, vec2(-.018), vec2(.018))
          + clamp(ripple * .1, vec2(-.004), vec2(.004));
        vec3 reflection = texture2D(tDiffuse, vMirror.xy / vMirror.w + wobble).rgb;
        vec3 color = mix(waterColor, reflection, fresnel);
        // 햇빛 반짝임(GGX, Kelemen 가시성). 멀수록 거칠게 해 넓은 빛길이 된다.
        vec3 halfway = normalize(sunDirection + view);
        float roughness = clamp(.07 + distance * .0015, .07, .24);
        float alpha2 = roughness * roughness * roughness * roughness;
        float nh = max(dot(normal, halfway), 0.);
        float denominator = nh * nh * (alpha2 - 1.) + 1.;
        float distribution = alpha2 / (3.1415927 * denominator * denominator);
        float lh = max(dot(sunDirection, halfway), .1);
        float sunFresnel = .02 + .98 * pow(1. - lh, 5.);
        float nl = max(dot(normal, sunDirection), 0.);
        // 물리값은 반짝임 하나가 수만까지 올라가 빛 번짐이 화면을 덮는다. 빛 번짐 기준(10) 아래로 묶는다.
        color += min(sunIrradiance * distribution * sunFresnel * nl / (4. * lh * lh), vec3(6.));
        // 먼 수면은 물결이 카메라 쪽으로 기울어 물속 색이 섞이며 회색 얼룩이 된다. 시선 방향 수평선의
        // 하늘색보다 조금 어둡고 푸른 먼바다 색으로 고르게 녹여, 밝은 하늘과 사이에 수평선 한 줄을 남긴다.
        vec3 horizon = texture2D(skyLut, skyLutUv(normalize(vec3(-view.x, 0., -view.z)))).rgb;
        color = mix(color, horizon * vec3(.8, .9, .98), min(.9, 1. - exp(-distance * .006)));
        gl_FragColor = vec4(color, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const reflector = new Reflector(geometry, {
    textureWidth: 768,
    textureHeight: 512,
    multisample: 0,
    clipBias: 0.003,
    shader,
  });
  reflector.rotation.x = -Math.PI / 2;
  scene.add(reflector);
  const uniforms = (reflector.material as THREE.ShaderMaterial).uniforms;
  const normalMap = options.normalMap;
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.anisotropy = 4;
  uniforms.normalMap.value = normalMap;
  uniforms.skyLut.value = options.skyLut;

  return {
    update(
      time: number,
      rippleMap: THREE.Texture,
      sunDirection: THREE.Vector3,
      sunIrradiance: THREE.Color,
      waterColor: THREE.Color,
    ) {
      uniforms.time.value = time;
      uniforms.rippleMap.value = rippleMap;
      (uniforms.sunDirection.value as THREE.Vector3).copy(sunDirection);
      (uniforms.sunIrradiance.value as THREE.Color).copy(sunIrradiance);
      (uniforms.waterColor.value as THREE.Color).copy(waterColor);
    },
    resize(width: number, height: number) {
      reflector
        .getRenderTarget()
        .setSize(
          Math.min(1024, Math.ceil(width * 0.75)),
          Math.min(768, Math.ceil(height * 0.75)),
        );
    },
    dispose() {
      scene.remove(reflector);
      reflector.dispose();
      geometry.dispose();
      normalMap.dispose();
    },
  };
}
