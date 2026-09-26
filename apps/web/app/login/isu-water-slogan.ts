import * as THREE from "three";

const FONT_URL = "/fonts/Geist-Sans-Variable.woff2";
const FONT_FAMILY = "ISU Water Slogan";
const LINES = [
  { text: "Challenge the Future", color: "#a0c840", y: 0.24 },
  { text: "Share the Future", color: "#33a9e6", y: -0.24 },
] as const;
const CELL = 128;
const COLUMNS = 16;
const ATLAS_WIDTH = 2048;
const FONT_SIZE = 96;
const LINE_WIDTH = 5;

type Glyph = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  home: THREE.Vector3;
  offset: THREE.Vector3;
  velocity: THREE.Vector3;
  angularVelocity: number;
  angle: number;
};

type Wave = { center: THREE.Vector3; age: number };

export type WaterSlogan = {
  group: THREE.Group;
  update(time: number, delta: number, share: number, calm: number): void;
  interact(raycaster: THREE.Raycaster): THREE.Vector3 | null;
  pulse(point: THREE.Vector3): void;
  projectedBounds(
    camera: THREE.Camera,
    width: number,
    height: number,
  ): {
    challenge: [number, number, number, number];
    share: [number, number, number, number];
  };
  dispose(): void;
};

function makeAtlas(font: string) {
  const characters = LINES.flatMap((line, lineIndex) =>
    [...new Set([...line.text])]
      .filter((character) => character !== " ")
      .map((character) => ({ character, lineIndex })),
  );
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_WIDTH;
  canvas.height = Math.ceil(characters.length / COLUMNS) * CELL;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.font = `700 ${FONT_SIZE}px ${font}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";

  const rects = new Map<string, [number, number, number, number]>();
  characters.forEach(({ character, lineIndex }, index) => {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const x = column * CELL + CELL / 2;
    const y = row * CELL + CELL / 2 + 5;
    context.shadowColor = "rgba(4, 16, 32, .65)";
    context.shadowBlur = 4;
    context.shadowOffsetY = 1;
    context.lineWidth = 4;
    context.strokeStyle = "#122b42";
    context.strokeText(character, x, y);
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.fillStyle = LINES[lineIndex].color;
    context.fillText(character, x, y);
    rects.set(`${lineIndex}:${character}`, [
      (column * CELL) / canvas.width,
      1 - ((row + 1) * CELL) / canvas.height,
      ((column + 1) * CELL) / canvas.width,
      1 - (row * CELL) / canvas.height,
    ]);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return { context, rects, texture };
}

export async function createWaterSlogan(
  signal?: AbortSignal,
): Promise<WaterSlogan> {
  const face = new FontFace(FONT_FAMILY, `url(${FONT_URL})`, { weight: "700" });
  await face.load();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  document.fonts.add(face);

  const atlas = makeAtlas(FONT_FAMILY);
  const group = new THREE.Group();
  group.name = "water-slogan";
  const floating = new THREE.Group();
  group.add(floating);
  const glyphs: Glyph[] = [];
  const lineMeshes: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >[][] = [[], []];
  const geometries: THREE.PlaneGeometry[] = [];
  const materials = LINES.map(
    () =>
      new THREE.MeshBasicMaterial({
        map: atlas.texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
  );

  LINES.forEach((line, lineIndex) => {
    atlas.context.font = `700 ${FONT_SIZE}px ${FONT_FAMILY}`;
    const widths = [...line.text].map(
      (character) => atlas.context.measureText(character).width,
    );
    const naturalWidth = widths.reduce((sum, width) => sum + width, 0);
    const scale = LINE_WIDTH / naturalWidth;
    let cursor = -LINE_WIDTH / 2;
    [...line.text].forEach((character, index) => {
      const width = widths[index] * scale;
      cursor += width;
      if (character === " ") return;
      const uv = atlas.rects.get(`${lineIndex}:${character}`);
      if (!uv) return;
      const geometry = new THREE.PlaneGeometry(CELL * scale, 0.55);
      const attribute = geometry.getAttribute("uv");
      for (let vertex = 0; vertex < attribute.count; vertex++) {
        attribute.setXY(
          vertex,
          uv[0] + attribute.getX(vertex) * (uv[2] - uv[0]),
          uv[1] + attribute.getY(vertex) * (uv[3] - uv[1]),
        );
      }
      attribute.needsUpdate = true;
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, materials[lineIndex]);
      const home = new THREE.Vector3(cursor - width / 2, line.y, 0);
      mesh.position.copy(home);
      mesh.name = `slogan-${lineIndex}-${index}`;
      floating.add(mesh);
      lineMeshes[lineIndex].push(mesh);
      glyphs.push({
        mesh,
        home,
        offset: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        angularVelocity: 0,
        angle: 0,
      });
    });
  });

  const waves: Wave[] = [];
  const localPoint = new THREE.Vector3();
  let disposed = false;
  let peakScatter = 0;
  group.userData.peakScatter = 0;

  return {
    group,
    update(time, delta, share, calm) {
      if (disposed) return;
      const dt = Math.min(Math.max(delta, 0), 0.06);
      materials[1].opacity = THREE.MathUtils.lerp(
        0.35,
        1,
        THREE.MathUtils.clamp(share, 0, 1),
      );
      floating.position.y = Math.sin(time * 0.75) * (0.018 * (1 - calm * 0.5));
      floating.rotation.z = Math.sin(time * 0.43) * 0.004;

      for (const wave of waves) wave.age += dt;
      for (let index = waves.length - 1; index >= 0; index--) {
        if (waves[index].age > 1.45) waves.splice(index, 1);
      }
      peakScatter = 0;
      for (const glyph of glyphs) {
        let impulseX = 0;
        let impulseY = 0;
        let impulseZ = 0;
        for (const wave of waves) {
          const dx = glyph.home.x - wave.center.x;
          const dy = glyph.home.y - wave.center.y;
          const distance = Math.hypot(dx, dy);
          const front = wave.age * 8.5;
          const band = Math.exp(-Math.pow((distance - front) / 0.42, 2));
          const decay = Math.exp(-wave.age * 3.5);
          const force = band * decay * 65;
          const inverse = 1 / Math.max(distance, 0.24);
          impulseX += dx * inverse * force;
          impulseY += dy * inverse * force + force * 0.22;
          impulseZ += force * 0.3;
        }
        glyph.velocity.x +=
          (impulseX - glyph.offset.x * 95 - glyph.velocity.x * 18) * dt;
        glyph.velocity.y +=
          (impulseY - glyph.offset.y * 95 - glyph.velocity.y * 18) * dt;
        glyph.velocity.z +=
          (impulseZ - glyph.offset.z * 95 - glyph.velocity.z * 18) * dt;
        glyph.offset.addScaledVector(glyph.velocity, dt);
        glyph.angularVelocity +=
          (glyph.offset.x * 2.5 -
            glyph.angle * 90 -
            glyph.angularVelocity * 17) *
          dt;
        glyph.angle += glyph.angularVelocity * dt;
        glyph.mesh.position.copy(glyph.home).add(glyph.offset);
        glyph.mesh.rotation.z = glyph.angle;
        peakScatter = Math.max(peakScatter, glyph.offset.length());
      }
      group.userData.peakScatter = peakScatter;
    },
    interact(raycaster) {
      if (disposed) return null;
      group.updateWorldMatrix(true, true);
      const intersections = raycaster.intersectObjects(
        glyphs.map(({ mesh }) => mesh),
        false,
      );
      return intersections[0]?.point.clone() ?? null;
    },
    pulse(point) {
      if (disposed) return;
      group.updateWorldMatrix(true, false);
      localPoint.copy(point);
      group.worldToLocal(localPoint);
      waves.push({ center: localPoint.clone(), age: 0 });
      if (waves.length > 5) waves.shift();
    },
    projectedBounds(camera, width, height) {
      group.updateWorldMatrix(true, true);
      camera.updateWorldMatrix(true, false);
      const measure = (meshes: (typeof lineMeshes)[number]) => {
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        const corner = new THREE.Vector3();
        for (const mesh of meshes) {
          const position = mesh.geometry.getAttribute("position");
          for (let index = 0; index < position.count; index++) {
            corner.fromBufferAttribute(position, index);
            corner.applyMatrix4(mesh.matrixWorld).project(camera);
            const x = ((corner.x + 1) * width) / 2;
            const y = ((1 - corner.y) * height) / 2;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
        return [left, top, right - left, bottom - top] as [
          number,
          number,
          number,
          number,
        ];
      };
      return {
        challenge: measure(lineMeshes[0]),
        share: measure(lineMeshes[1]),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      atlas.texture.dispose();
      waves.length = 0;
      glyphs.length = 0;
      document.fonts.delete(face);
    },
  };
}
