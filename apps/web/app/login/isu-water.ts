import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

const MAX_RIPPLES = 12;

export function createIsuWater(scene: THREE.Scene) {
  const geometry = new THREE.PlaneGeometry(180, 180);
  const ripples = Array.from(
    { length: MAX_RIPPLES },
    () => new THREE.Vector4(1000, 1000, -100, 0),
  );
  const flowDirections = Array.from(
    { length: MAX_RIPPLES },
    () => new THREE.Vector2(1, 0),
  );
  const shader = {
    uniforms: {
      color: { value: new THREE.Color("#879da4") },
      tDiffuse: { value: null },
      textureMatrix: { value: new THREE.Matrix4() },
      time: { value: 0 },
      wave: { value: 0.075 },
      rain: { value: 0 },
      sunX: { value: 0 },
      sunStrength: { value: 0 },
      sunColor: { value: new THREE.Color("#ffd087") },
      rippleCount: { value: 0 },
      ripples: { value: ripples },
      flowDirections: { value: flowDirections },
    },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vMirror; varying vec3 vWorld;
      void main(){vMirror=textureMatrix*vec4(position,1.);vWorld=(modelMatrix*vec4(position,1.)).xyz;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse;uniform vec3 color,sunColor;
      uniform float time,wave,rain,sunX,sunStrength;
      uniform vec4 ripples[12];uniform vec2 flowDirections[12];uniform int rippleCount;
      varying vec4 vMirror;varying vec3 vWorld;
      void main(){
        vec2 p=vWorld.xz;
        float bend=sin(p.x*.21+time*.13+sin(p.y*.24-time*.12)*.6)*.35
          +sin(p.y*.16-time*.09)*.2;
        float broad=sin(p.y*1.65+p.x*.34+bend+time*.31)*.55
          +sin(p.y*2.7-p.x*.44-bend*.7-time*.23)*.28;
        float fine=sin(p.y*8.5+p.x*1.7+bend*2.+time*.55)*sin(p.x*2.3-time*.28);
        vec2 d=vec2(broad*.0044+fine*.0005,fine*.0022+bend*.001)*(.5+wave*2.8);
        float wakeShine=0.;
        for(int i=0;i<12;i++){
          if(i>=rippleCount)break;
          vec4 r=ripples[i];float age=max(time-r.z,0.);
          vec2 direction=flowDirections[i];vec2 across=vec2(-direction.y,direction.x);
          vec2 offset=p-r.xy;
          float along=dot(offset,direction),side=dot(offset,across);
          float lengthScale=2.3+age*.7,widthScale=.8+age*.5;
          float wake=exp(-pow(along/lengthScale,2.)-pow(side/widthScale,2.))
            *exp(-age*1.3)*r.w;
          float fold=sin(along*2.1-age*1.7);
          d+=(direction*.009+across*fold*.028)*wake*(1.+wave*2.);
          wakeShine+=abs(fold)*wake;
        }
        d=clamp(d,vec2(-.04),vec2(.04));
        vec2 uv=vMirror.xy/vMirror.w+d;
        float depth=clamp((p.y+18.)/35.,0.,1.);
        vec2 smear=vec2(.0014+depth*.002+abs(broad)*.0006,
          .0006+depth*.0005+fine*.0002);
        vec3 reflection=texture2D(tDiffuse,uv).rgb*.42;
        reflection+=texture2D(tDiffuse,uv+smear).rgb*.29;
        reflection+=texture2D(tDiffuse,uv-smear).rgb*.29;
        float peak=max(reflection.r,max(reflection.g,reflection.b));
        reflection*=1.-.4*smoothstep(.52,.98,peak);
        float grazing=clamp(1.-abs(cameraPosition.y-vWorld.y)/max(length(cameraPosition-vWorld),.001),0.,1.);
        vec3 c=mix(color,reflection,mix(.43,.76,grazing));
        c+=vec3(.10,.14,.17)*pow(max(0.,broad*.48+fine*.28+.2),9.)*(1.+wave*2.);
        float sunPath=exp(-pow((p.x-sunX*12.)/(.35+depth*1.8),2.));
        float fleck=pow(max(0.,sin(p.y*10.5+bend*4.+time*.48)
          *sin(p.x*4.7-p.y*1.3-time*.19)),4.);
        float streak=pow(max(0.,sin(p.y*2.4+fine*.4-time*.12)),6.);
        c+=sunColor*sunPath*sunStrength*(.016+fleck*.22+streak*.045);
        c+=vec3(.24,.31,.34)*min(wakeShine*.3,.12);
        c+=vec3(.08,.13,.16)*rain*min(wakeShine*.08,.06);
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
  const active: {
    x: number;
    z: number;
    start: number;
    strength: number;
    dx: number;
    dz: number;
  }[] = [];

  return {
    color: uniforms.color.value as THREE.Color,
    setConditions(wave: number, rain: number) {
      uniforms.wave.value = wave;
      uniforms.rain.value = rain;
    },
    setSun(x: number, strength: number, color: THREE.Color) {
      uniforms.sunX.value = x;
      uniforms.sunStrength.value = strength;
      (uniforms.sunColor.value as THREE.Color).copy(color);
    },
    addRipple(
      x: number,
      z: number,
      time: number,
      strength: number,
      dx = 1,
      dz = 0,
    ) {
      const length = Math.hypot(dx, dz) || 1;
      active.push({
        x,
        z,
        start: time,
        strength,
        dx: dx / length,
        dz: dz / length,
      });
      if (active.length > MAX_RIPPLES) active.shift();
    },
    update(time: number) {
      for (let i = active.length - 1; i >= 0; i--)
        if (time - active[i].start > 3.5) active.splice(i, 1);
      uniforms.time.value = time;
      uniforms.rippleCount.value = active.length;
      active.forEach((ripple, index) => {
        ripples[index].set(ripple.x, ripple.z, ripple.start, ripple.strength);
        flowDirections[index].set(ripple.dx, ripple.dz);
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
