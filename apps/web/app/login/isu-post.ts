import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export type PostSettings = {
  bloom: { strength: number; radius: number; threshold: number };
  ao: { radius: number; intensity: number };
  grade: {
    contrast: number;
    lift: number;
    vignette: number;
    grain: number;
    aberration: number;
  };
};

// 색 보정, 비네트, 필름 그레인, 약한 색수차. 출력 변환 전 선형 색 공간에서 적용한다.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uContrast: { value: 1 },
    uLift: { value: 0 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uAberration: { value: 0 },
  },
  vertexShader:
    "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uResolution;
    uniform float uTime, uContrast, uLift, uVignette, uGrain, uAberration;
    varying vec2 vUv;
    float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 center = vUv - .5;
      float dist = length(center);
      vec2 shift = center * uAberration * dist;
      vec3 color = vec3(
        texture2D(tDiffuse, vUv + shift).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - shift).b
      );
      color = (color - .18) * uContrast + .18;
      color = color * (1. - uLift) + uLift;
      color *= 1. - uVignette * smoothstep(.25, .85, dist);
      color += (rand(vUv * uResolution + fract(uTime) * 100.) - .5) * uGrain;
      gl_FragColor = vec4(max(color, 0.), 1.);
    }`,
};

export function createPostChain(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  settings: PostSettings,
  options: { mobile: boolean },
) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: options.mobile ? 0 : Math.min(2, renderer.capabilities.maxSamples),
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // 틈새와 접촉면 그림자. 터치 기기는 비용 때문에 끈다.
  if (!options.mobile) {
    const ao = new GTAOPass(scene, camera, 1, 1);
    // @types/three는 6번째 인자(aoParameters)를 아직 타입에 반영하지 않는다.
    // 생성자가 넘겨받은 aoParameters로 하는 일과 동일하게, 공개 메서드로 바로 적용한다.
    ao.updateGtaoMaterial({
      radius: settings.ao.radius,
      distanceExponent: 1,
      thickness: 1,
      scale: 1,
      samples: 12,
    });
    ao.blendIntensity = settings.ao.intensity;
    composer.addPass(ao);
  }
  composer.addPass(
    new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      settings.bloom.strength,
      settings.bloom.radius,
      settings.bloom.threshold,
    ),
  );
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uContrast.value = settings.grade.contrast;
  grade.uniforms.uLift.value = settings.grade.lift;
  grade.uniforms.uVignette.value = settings.grade.vignette;
  grade.uniforms.uGrain.value = settings.grade.grain;
  grade.uniforms.uAberration.value = settings.grade.aberration;
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    setSize(width: number, height: number) {
      composer.setSize(width, height);
      grade.uniforms.uResolution.value.set(width, height);
    },
    render(time: number) {
      grade.uniforms.uTime.value = time;
      composer.render();
    },
    dispose() {
      composer.passes.forEach((pass) => pass.dispose());
      composer.dispose();
    },
  };
}

type Shader = Parameters<THREE.MeshStandardMaterial["onBeforeCompile"]>[0];

export type Haze = {
  color: { value: THREE.Color };
  density: { value: number };
};

// 땅 근처가 짙은 높이 안개. 멀수록, 낮을수록 안개색에 가까워진다.
export function applyHaze(shader: Shader, haze: Haze) {
  shader.uniforms.uHazeColor = haze.color;
  shader.uniforms.uHazeDensity = haze.density;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nvarying float vHazeY; varying float vHazeDepth;",
    )
    .replace(
      "#include <fog_vertex>",
      "#include <fog_vertex>\nvHazeY = (modelMatrix * vec4(transformed, 1.)).y; vHazeDepth = -mvPosition.z;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform vec3 uHazeColor; uniform float uHazeDensity; varying float vHazeY; varying float vHazeDepth;",
    )
    .replace(
      "#include <fog_fragment>",
      `#include <fog_fragment>
      float haze = uHazeDensity * exp(-max(vHazeY + .6, 0.) * 1.3) * smoothstep(8., 34., vHazeDepth);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, clamp(haze, 0., .85));`,
    );
}
