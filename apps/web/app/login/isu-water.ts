import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

const MAX_RIPPLES = 12;

export function createIsuWater(scene: THREE.Scene) {
  const geometry = new THREE.PlaneGeometry(180, 180);
  const ripples = Array.from(
    { length: MAX_RIPPLES },
    () => new THREE.Vector4(1000, 1000, -100, 0),
  );
  const shader = {
    uniforms: {
      color: { value: new THREE.Color("#879da4") },
      tDiffuse: { value: null },
      textureMatrix: { value: new THREE.Matrix4() },
      time: { value: 0 },
      wave: { value: 0.075 },
      rain: { value: 0 },
      rippleCount: { value: 0 },
      ripples: { value: ripples },
    },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vMirror; varying vec3 vWorld;
      void main(){vMirror=textureMatrix*vec4(position,1.);vWorld=(modelMatrix*vec4(position,1.)).xyz;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse;uniform vec3 color;uniform float time,wave,rain;
      uniform vec4 ripples[12];uniform int rippleCount;varying vec4 vMirror;varying vec3 vWorld;
      void main(){
        vec2 p=vWorld.xz;
        float broad=sin(p.y*1.65+p.x*.34+time*.31)*.55+sin(p.y*2.7-p.x*.44-time*.23)*.28;
        float fine=sin(p.y*8.5+p.x*1.7+time*.55)*sin(p.x*2.3-time*.28);
        vec2 d=vec2(broad*.007,fine*.003)*(.5+wave*2.8);
        float rings=0.;
        for(int i=0;i<12;i++){
          if(i>=rippleCount)break;
          vec4 r=ripples[i];float age=time-r.z;float radius=length(p-r.xy);
          float envelope=exp(-max(age,0.)*1.55)*exp(-radius*.16)*r.w;
          float ring=sin(radius*18.-age*12.)*exp(-pow((radius-age*1.7)*1.8,2.));
          vec2 direction=(p-r.xy)/max(radius,.001);
          d+=direction*ring*envelope*.023;rings+=abs(ring)*envelope;
        }
        vec2 uv=vMirror.xy/vMirror.w+d;
        vec3 reflection=texture2D(tDiffuse,uv).rgb*.54;
        reflection+=texture2D(tDiffuse,uv+vec2(.0013,.0007)).rgb*.23;
        reflection+=texture2D(tDiffuse,uv-vec2(.0013,.0007)).rgb*.23;
        float grazing=clamp(1.-abs(cameraPosition.y-vWorld.y)/max(length(cameraPosition-vWorld),.001),0.,1.);
        vec3 c=mix(color,reflection,mix(.51,.87,grazing));
        c+=vec3(.15,.19,.22)*pow(max(0.,broad*.5+fine*.22+.25),7.)*(1.+wave*2.);
        c+=vec3(.42,.59,.67)*min(rings*.11,.16);
        c+=vec3(.08,.13,.16)*rain*min(rings*.05,.07);
        gl_FragColor=vec4(c,1.);
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
  const active: { x: number; z: number; start: number; strength: number }[] =
    [];

  return {
    color: uniforms.color.value as THREE.Color,
    setConditions(wave: number, rain: number) {
      uniforms.wave.value = wave;
      uniforms.rain.value = rain;
    },
    addRipple(x: number, z: number, time: number, strength: number) {
      active.push({ x, z, start: time, strength });
      if (active.length > MAX_RIPPLES) active.shift();
    },
    update(time: number) {
      for (let i = active.length - 1; i >= 0; i--)
        if (time - active[i].start > 3.5) active.splice(i, 1);
      uniforms.time.value = time;
      uniforms.rippleCount.value = active.length;
      active.forEach((ripple, index) => {
        ripples[index].set(ripple.x, ripple.z, ripple.start, ripple.strength);
      });
    },
    get rippleEnergy() {
      return active.reduce(
        (sum, ripple) =>
          sum +
          ripple.strength *
            Math.exp(-(uniforms.time.value - ripple.start) * 1.55),
        0,
      );
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
    },
  };
}
