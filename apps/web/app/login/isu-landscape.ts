import * as THREE from "three";

// 랜딩 arctic-landscape.ts를 가져와 하늘과 먼 산을 해 질 녘 블루아워 색으로 바꿨다.

// Coarse world bounds and visible peak landmarks, not original mesh vertices.
const mountains = [
  {
    bounds: [26.2, 114.5, -45.7, 37.7],
    peak: [58.7, 8.74, -24.67],
    origin: [59.53, -1, -11.84],
    rotation: [4.1, -42.8, 5],
    scale: [4, 3.14, 4],
  },
  {
    bounds: [-17.4, 25.5, -51.7, -6],
    peak: [-5.22, 4.01, -24.42],
    origin: [1, -2.21, -23],
    rotation: [3.5, 30, 0],
    scale: [2, 2, 2],
  },
  {
    bounds: [4.4, 166.2, -179.8, -2.8],
    peak: [64.24, 26.52, -111.27],
    origin: [75, 0, -90],
    rotation: [3.2, -16.7, -2.6],
    scale: [8, 8, 8],
  },
  {
    bounds: [155.9, 367.6, -270.1, -48.4],
    peak: [245.1, 44.02, -149.61],
    origin: [250, 11.33, -133],
    rotation: [13.2, 20, 5],
    scale: [10, 10, 10],
  },
  {
    bounds: [-48.6, 5, -88.8, -31.5],
    peak: [-32.77, 6.23, -55.49],
    origin: [-25.22, -1.59, -53.05],
    rotation: [3.5, 25, 0],
    scale: [2.5, 2.5, 2.5],
  },
];

export function createIsuLandscape(
  scene: THREE.Scene,
  rockColor: THREE.Texture,
  rockNormal: THREE.Texture,
  snow: THREE.Texture,
  ridge: (x: number, z: number) => number,
) {
  const viewport = { value: new THREE.Vector2(1, 1) };
  const lowSky = { value: new THREE.Color("#0b1428") };
  const highSky = { value: new THREE.Color("#22324f") };
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: { viewport, lowSky, highSky },
    vertexShader:
      "void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `uniform vec2 viewport; uniform vec3 lowSky,highSky;
      void main(){vec2 uv=gl_FragCoord.xy/viewport;float blend=pow((uv.x+uv.y)*.5,2.);gl_FragColor=vec4(mix(lowSky,highSky,blend),1.);}`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    skyMaterial,
  );
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  sky.castShadow = sky.receiveShadow = false;
  scene.add(sky);
  scene.background = null;

  const color = rockColor.clone();
  const normal = rockNormal.clone();
  color.repeat.set(3, 3);
  normal.repeat.set(3, 3);
  const material = new THREE.MeshStandardMaterial({
    color: 0x5d6f8e,
    map: color,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.98,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      viewport,
      lowSky,
      highSky,
      mountainSnow: { value: snow },
    });
    shader.vertexShader = `attribute float mountainRadius; varying float vMountainRadius; varying float vMountainHeight;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vMountainRadius=mountainRadius;vMountainHeight=(modelMatrix*vec4(transformed,1.)).y;`,
    );
    shader.fragmentShader = `uniform vec2 viewport;uniform vec3 lowSky,highSky;uniform sampler2D mountainSnow;
      varying float vMountainRadius;varying float vMountainHeight;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float rockLuma=dot(diffuseColor.rgb,vec3(.299,.587,.114));
      vec3 snowColor=texture2D(mountainSnow,vMapUv*4.).rgb*vec3(.9,.97,1.07);
      diffuseColor.rgb=mix(vec3(rockLuma)*1.8,snowColor,.45);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
      float edgeAlpha=1.-smoothstep(5.1,8.295,vMountainRadius);
      if(edgeAlpha<.005)discard;
      float fogHeight=clamp(.5-vMountainHeight*.05,0.,1.);
      float fogDepth=.75*clamp(vViewPosition.z*.005,0.,1.);
      vec2 screenUv=gl_FragCoord.xy/viewport;
      vec3 fogColor=mix(lowSky,highSky,pow((screenUv.x+screenUv.y)*.5,2.));
      vec3 texturedColor=clamp(outgoingLight,0.,1.);
      vec3 fogDestination=fogColor*1.1+vec3(smoothstep(.5,1.,texturedColor.r));
      outgoingLight=mix(texturedColor,fogDestination,fogHeight+fogDepth);
      diffuseColor.a*=edgeAlpha;
      #include <opaque_fragment>`,
    );
  };

  const meshes = mountains.map((mountain, index) => {
    const [minX, maxX, minZ, maxZ] = mountain.bounds;
    const [peakX, peakY, peakZ] = mountain.peak;
    const [ox, oy, oz] = mountain.origin;
    const rotation = new THREE.Euler(
      ...(mountain.rotation.map(THREE.MathUtils.degToRad) as [
        number,
        number,
        number,
      ]),
    );
    const tilt = new THREE.Vector3(0, 1, 0).applyEuler(rotation);
    const inverseWorld = new THREE.Matrix4()
      .compose(
        new THREE.Vector3(ox, oy, oz),
        new THREE.Quaternion().setFromEuler(rotation),
        new THREE.Vector3(...(mountain.scale as [number, number, number])),
      )
      .invert();
    const planeHeight = (x: number, z: number) =>
      oy - (tilt.x * (x - ox) + tilt.z * (z - oz)) / tilt.y;
    const peakBase = planeHeight(peakX, peakZ);
    const localPeak = new THREE.Vector3(peakX, peakBase, peakZ).applyMatrix4(
      inverseWorld,
    );
    const geometry = new THREE.PlaneGeometry(2, 2, 96, 96);
    const position = geometry.attributes.position;
    const radius = new Float32Array(position.count);
    const local = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      const u = position.getX(i),
        v = -position.getY(i);
      const x = peakX + u * (u < 0 ? peakX - minX : maxX - peakX);
      const z = peakZ + v * (v < 0 ? peakZ - minZ : maxZ - peakZ);
      local.set(x, planeHeight(x, z), z).applyMatrix4(inverseWorld);
      const dx = local.x - localPeak.x,
        dz = local.z - localPeak.z;
      const angle = Math.atan2(dz, dx);
      const distance =
        Math.hypot(dx, dz) /
        (7.8 +
          Math.sin(angle * 3 + index) * 0.9 +
          Math.cos(angle * 5 - index) * 0.35);
      // A rounded crest branches into uneven shoulders; the measured peak stays fixed.
      const envelope = 1 - THREE.MathUtils.smoothstep(distance, 0, 1);
      const shoulder = Math.sin(angle * 3 + distance * 5 + index) * 0.5 + 0.5;
      const erosion =
        1 -
        Math.sin(Math.min(1, distance) * Math.PI) *
          (0.08 * shoulder + 0.2 * (1 - ridge(local.x * 0.75, local.z * 0.75)));
      const skirt = (peakY - peakBase) * 0.22 * (1 - envelope) ** 2;
      const y = Math.min(
        peakY,
        planeHeight(x, z) + (peakY - peakBase) * envelope * erosion - skirt,
      );
      position.setXYZ(i, x, y, z);
      local.set(x, y, z).applyMatrix4(inverseWorld);
      radius[i] = Math.hypot(local.x, local.z);
    }
    geometry.setAttribute(
      "mountainRadius",
      new THREE.BufferAttribute(radius, 1),
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `isu-mountain-${index + 1}`;
    mesh.castShadow = mesh.receiveShadow = false;
    scene.add(mesh);
    return mesh;
  });

  return {
    meshes,
    resize(width: number, height: number) {
      viewport.value.set(width, height);
    },
    dispose() {
      for (const mesh of [sky, ...meshes]) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
      }
      material.dispose();
      skyMaterial.dispose();
      color.dispose();
      normal.dispose();
    },
  };
}
