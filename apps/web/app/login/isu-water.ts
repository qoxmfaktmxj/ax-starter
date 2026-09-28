import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { RIPPLE_AREA, RIPPLE_SIZE } from "./isu-ripples";
import { SKY_LUT_GLSL } from "./isu-sky";

// 수면: 분산 파동, 미세 법선, 거칠기에 따른 반사, 각도별 반사율, 햇빛 반짝임.
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
      vec2 waveSlope(vec2 p, vec2 direction, float wavelength, float steepness, float phase) {
        float k = 6.2831853 / wavelength;
        float omega = sqrt(9.81 * k);
        return direction * steepness * cos(k * dot(p, direction) - omega * time + phase);
      }
      float hash(vec2 p) {
        p = fract(p * vec2(.1031, .11369));
        p += dot(p, p.yx + 33.33);
        return fract((p.x + p.y) * p.x);
      }
      float patchNoise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(cell), hash(cell + vec2(1., 0.)), f.x),
          mix(hash(cell + vec2(0., 1.)), hash(cell + vec2(1.)), f.x), f.y);
      }
      void main() {
        vec2 p = vWorld.xz;
        float distance = length(cameraPosition.xz - p);
        // 파장마다 분산 속도를 달리해 물결이 제자리에서 변한다.
        vec2 wave = waveSlope(p, vec2(.28, .96), 4., .026, .2)
          + waveSlope(p, vec2(.52, .85), 2.8, .023, 2.3)
          + waveSlope(p, vec2(-.05, .999), 2., .020, 4.1)
          + waveSlope(p, vec2(.65, .76), 1.4, .017, 1.2)
          + waveSlope(p, vec2(-.34, .94), .95, .014, 5.4);
        float smallWaveFade = 1. - smoothstep(20., 110., distance);
        wave += (waveSlope(p, vec2(.15, .99), .68, .012, 3.7)
          + waveSlope(p, vec2(-.6, .8), .46, .010, .8)
          + waveSlope(p, vec2(.75, .66), .32, .008, 5.9)) * smallWaveFade;
        float patchStrength = mix(.6, 1.2, patchNoise(p * .075 + vec2(time * .003, 0.)));
        wave *= patchStrength * (1. - smoothstep(220., 600., distance));
        // 구운 법선은 정적인 미세 거칠기에만 사용한다.
        vec3 baked = texture2D(normalMap, p * .3).xyz * 2. - 1.;
        vec2 micro = baked.xy / max(baked.z, .25) * .08 * smallWaveFade;
        vec2 rippleUv = (p - vec2(${RIPPLE_AREA.x.toFixed(1)}, ${RIPPLE_AREA.z.toFixed(1)})) / ${RIPPLE_AREA.size.toFixed(1)};
        float edge = smoothstep(0., .06, min(min(rippleUv.x, 1. - rippleUv.x), min(rippleUv.y, 1. - rippleUv.y)));
        const float texel = 1. / ${RIPPLE_SIZE.toFixed(1)};
        vec2 ripple = vec2(
          texture2D(rippleMap, rippleUv + vec2(texel, 0.)).r - texture2D(rippleMap, rippleUv - vec2(texel, 0.)).r,
          texture2D(rippleMap, rippleUv + vec2(0., texel)).r - texture2D(rippleMap, rippleUv - vec2(0., texel)).r) * edge;
        vec2 slope = wave + micro + ripple * 8.;
        vec3 normal = normalize(vec3(-slope.x, 1., -slope.y));
        vec3 view = normalize(cameraPosition - vWorld);
        float facing = clamp(dot(normal, view), 0., 1.);
        float fresnel = .02 + .98 * pow(1. - facing, 5.);
        // 밉맵에서 짧은 법선이 평균화된 만큼 거칠기를 올려 먼 반짝임을 누른다.
        float normalVariance = max(1. - length(baked), 0.) / max(length(baked), .2);
        float baseRoughness = clamp(.08 + distance * .00035, .08, .28);
        float roughness = clamp(sqrt(baseRoughness * baseRoughness + normalVariance * .22), .08, .38);
        vec2 wobble = clamp(wave * .008, vec2(-.012), vec2(.012))
          + clamp(ripple * .1, vec2(-.004), vec2(.004));
        vec2 reflectionUv = vMirror.xy / vMirror.w + wobble;
        float reflectionLod = clamp(roughness * 8., 0., 3.);
        float stretch = min(.005, distance * .000045) * (0.5 + roughness);
        vec3 reflection = texture2D(tDiffuse, reflectionUv, reflectionLod).rgb * .5
          + texture2D(tDiffuse, reflectionUv + vec2(0., stretch), reflectionLod).rgb * .25
          + texture2D(tDiffuse, reflectionUv - vec2(0., stretch), reflectionLod).rgb * .25;
        vec3 horizon = texture2D(skyLut, skyLutUv(normalize(vec3(-view.x, 0., -view.z)))).rgb;
        reflection = mix(reflection, horizon * vec3(.84, .92, .98), smoothstep(180., 650., distance));
        vec3 depthColor = waterColor * (.65 + .55 * pow(1. - facing, 2.))
          + horizon * .035 * (1. - facing);
        vec3 color = mix(depthColor, reflection, fresnel);
        // GGX 반짝임은 거칠기로 폭을 정하고 밝기를 임의로 자르지 않는다.
        vec3 halfway = normalize(sunDirection + view);
        float alpha2 = roughness * roughness * roughness * roughness;
        float nh = max(dot(normal, halfway), 0.);
        float denominator = nh * nh * (alpha2 - 1.) + 1.;
        float distribution = alpha2 / (3.1415927 * denominator * denominator);
        float lh = max(dot(sunDirection, halfway), .1);
        float sunFresnel = .02 + .98 * pow(1. - lh, 5.);
        float nl = max(dot(normal, sunDirection), 0.);
        color += sunIrradiance * distribution * sunFresnel * nl / (4. * lh * lh);
        float backlit = max(dot(-sunDirection, view), 0.);
        color += sunIrradiance * .008 * backlit * smoothstep(.03, .16, length(wave));
        // 먼 수면의 평균 법선과 제한된 안개가 수평선 한 줄을 남긴다.
        color = mix(color, horizon * vec3(.8, .9, .98), min(.3, 1. - exp(-distance * .0015)));
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
  reflector.getRenderTarget().texture.generateMipmaps = true;
  reflector.getRenderTarget().texture.minFilter =
    THREE.LinearMipmapLinearFilter;
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
      const scale = width < 700 ? 0.75 : 1;
      reflector
        .getRenderTarget()
        .setSize(
          Math.min(1600, Math.ceil(width * scale)),
          Math.min(1000, Math.ceil(height * scale)),
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
