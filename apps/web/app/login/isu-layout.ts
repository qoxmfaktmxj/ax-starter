// ISU 글자를 얼음 블록으로 쌓는 배치. 월드 단위이며 글자 바닥이 y=0, 전체 가운데가 x=0이다.
export type Letter = "i" | "s" | "u";
export type Vec3 = [number, number, number];

export type BoxBlock = {
  kind: "box";
  letter: Letter;
  dot: boolean;
  center: Vec3;
  size: Vec3;
};

export type ArcBlock = {
  kind: "arc";
  letter: Letter;
  dot: false;
  /** 원호 중심 (x, y) */
  origin: [number, number];
  /** 안쪽, 바깥쪽 반지름 */
  radii: [number, number];
  /** 시작, 끝 각도(라디안). 시작 < 끝 */
  angles: [number, number];
  depth: number;
  /** 중간 반지름과 중간 각도의 점 */
  center: Vec3;
};

export type BlockSpec = BoxBlock | ArcBlock;

const COURSE = 0.62;
const GAP = 0.03;
const DEPTH = 0.7;
const S_STROKE = 0.7;
const U_STROKE = 0.8;
const LETTER_GAP = 0.5;
export const LETTER_HEIGHT = 5 * COURSE;

const degrees = (value: number) => (value * Math.PI) / 180;

function box(
  letter: Letter,
  x: number,
  y: number,
  width: number,
  height: number,
  dot = false,
): BoxBlock {
  return {
    kind: "box",
    letter,
    dot,
    center: [x, y, 0],
    size: [width, height, DEPTH],
  };
}

function arc(
  letter: Letter,
  origin: [number, number],
  outer: number,
  stroke: number,
  from: number,
  to: number,
  pieces: number,
): ArcBlock[] {
  const inner = outer - stroke;
  const radius = (inner + outer) / 2;
  const span = (to - from) / pieces;
  // 블록 사이 틈을 중간 반지름 기준 각도로 바꾼다.
  const pad = GAP / 2 / radius;
  return Array.from({ length: pieces }, (_, index): ArcBlock => {
    const start = from + index * span;
    const middle = start + span / 2;
    return {
      kind: "arc",
      letter,
      dot: false,
      origin,
      radii: [inner, outer],
      angles: [start + pad, start + span - pad],
      depth: DEPTH,
      center: [
        origin[0] + Math.cos(middle) * radius,
        origin[1] + Math.sin(middle) * radius,
        0,
      ],
    };
  });
}

export function blockBounds(spec: BlockSpec): { min: Vec3; max: Vec3 } {
  if (spec.kind === "box") {
    const [x, y, z] = spec.center;
    const [width, height, depth] = spec.size;
    return {
      min: [x - width / 2, y - height / 2, z - depth / 2],
      max: [x + width / 2, y + height / 2, z + depth / 2],
    };
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (let step = 0; step <= 8; step++) {
    const angle =
      spec.angles[0] + ((spec.angles[1] - spec.angles[0]) * step) / 8;
    for (const radius of spec.radii) {
      xs.push(spec.origin[0] + Math.cos(angle) * radius);
      ys.push(spec.origin[1] + Math.sin(angle) * radius);
    }
  }
  return {
    min: [Math.min(...xs), Math.min(...ys), -spec.depth / 2],
    max: [Math.max(...xs), Math.max(...ys), spec.depth / 2],
  };
}

export function buildIsuLayout(): BlockSpec[] {
  const blocks: BlockSpec[] = [];

  // i: 5단 기둥과 간격을 둔 점 하나
  const iWidth = 0.9;
  for (let course = 0; course < 5; course++)
    blocks.push(
      box("i", iWidth / 2, COURSE * (course + 0.5), iWidth - GAP, COURSE - GAP),
    );
  blocks.push(
    box("i", iWidth / 2, LETTER_HEIGHT + 0.3 + 0.41, 0.82, 0.82, true),
  );

  // s: 위아래 원이 가운데 획을 공유한다. 위 원은 오른쪽 위 끝에서, 아래 원은 왼쪽 아래 끝에서 끝난다.
  const sOuter = (LETTER_HEIGHT + S_STROKE) / 4;
  const sCenterX = iWidth + LETTER_GAP + sOuter;
  blocks.push(
    ...arc(
      "s",
      [sCenterX, LETTER_HEIGHT - sOuter],
      sOuter,
      S_STROKE,
      degrees(20),
      degrees(270),
      7,
    ),
    ...arc(
      "s",
      [sCenterX, sOuter],
      sOuter,
      S_STROKE,
      degrees(-160),
      degrees(90),
      7,
    ),
  );

  // u: 양쪽 3단 기둥과 바닥 반원
  const uOuter = LETTER_HEIGHT - 3 * COURSE;
  const uLeft = sCenterX + sOuter + LETTER_GAP;
  const uCenterX = uLeft + uOuter;
  for (const x of [uLeft + U_STROKE / 2, uCenterX + uOuter - U_STROKE / 2])
    for (let course = 0; course < 3; course++)
      blocks.push(
        box(
          "u",
          x,
          uOuter + COURSE * (course + 0.5),
          U_STROKE - GAP,
          COURSE - GAP,
        ),
      );
  blocks.push(
    ...arc(
      "u",
      [uCenterX, uOuter],
      uOuter,
      U_STROKE,
      degrees(180),
      degrees(360),
      5,
    ),
  );

  // 전체 폭의 가운데를 x=0으로 옮긴다.
  const bounds = blocks.map(blockBounds);
  const shift =
    -(
      Math.min(...bounds.map((value) => value.min[0])) +
      Math.max(...bounds.map((value) => value.max[0]))
    ) / 2;
  return blocks.map(
    (block): BlockSpec =>
      block.kind === "box"
        ? { ...block, center: [block.center[0] + shift, block.center[1], 0] }
        : {
            ...block,
            origin: [block.origin[0] + shift, block.origin[1]],
            center: [block.center[0] + shift, block.center[1], 0],
          },
  );
}
