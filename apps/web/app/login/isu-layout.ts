// ISU 글자를 로고(introduction_logo.jpg, 306x67) 실측대로 얼음 블록으로 쌓는다.
// 로고 좌표는 픽셀 가장자리 기준이며 x는 오른쪽, y는 아래로 커진다. 글자 윗선 y=14, 바닥 y=67.
export type Letter = "i" | "s" | "u";
export type Corner = "none" | "tl" | "tr" | "bl" | "br";
export type Vec3 = [number, number, number];

export type BlockSpec = {
  letter: Letter;
  dot: boolean;
  /** 0이 맨 아래 단 */
  course: number;
  center: Vec3;
  /** 회전 전 폭, 높이, 두께 */
  size: Vec3;
  /** z축 회전(라디안) */
  rotation: number;
  /** 로고에서 크게 둥근 바깥 모서리 */
  corner: Corner;
};

export const LETTER_HEIGHT = 3.1;
export const BLOCK_DEPTH = 0.7;
export const BLOCK_GAP = 0.06;
const LOGO_TOP = 14;
const LOGO_BOTTOM = 67;
const PX = LETTER_HEIGHT / (LOGO_BOTTOM - LOGO_TOP);

const worldX = (x: number) => x * PX;
const worldY = (y: number) => (LOGO_BOTTOM - y) * PX;

type Box = { x0: number; x1: number; y0: number; y1: number };

function block(
  letter: Letter,
  course: number,
  box: Box,
  corner: Corner = "none",
  dot = false,
): BlockSpec {
  return {
    letter,
    dot,
    course,
    corner,
    rotation: 0,
    center: [worldX((box.x0 + box.x1) / 2), worldY((box.y0 + box.y1) / 2), 0],
    size: [
      (box.x1 - box.x0) * PX - BLOCK_GAP,
      (box.y1 - box.y0) * PX - BLOCK_GAP,
      BLOCK_DEPTH,
    ],
  };
}

// 세로로 count개 쌓는다. 아래 블록부터 firstCourse, firstCourse + 1 ...
function column(
  letter: Letter,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  count: number,
  firstCourse: number,
): BlockSpec[] {
  const step = (y1 - y0) / count;
  return Array.from({ length: count }, (_, index) => {
    const bottom = y1 - step * index;
    return block(letter, firstCourse + index, {
      x0,
      x1,
      y0: bottom - step,
      y1: bottom,
    });
  });
}

// 가로로 count개 늘어놓는다. 양 끝 블록에 둥근 모서리를 줄 수 있다.
function row(
  letter: Letter,
  course: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  count: number,
  ends: { first?: Corner; last?: Corner } = {},
): BlockSpec[] {
  const step = (x1 - x0) / count;
  return Array.from({ length: count }, (_, index) => {
    const corner =
      index === 0 ? ends.first : index === count - 1 ? ends.last : undefined;
    return block(
      letter,
      course,
      { x0: x0 + step * index, x1: x0 + step * (index + 1), y0, y1 },
      corner ?? "none",
    );
  });
}

// 두 점을 잇는 획을 count개의 기울인 블록으로 나눈다. 위쪽 블록일수록 단 번호가 크다.
function stroke(
  letter: Letter,
  from: [number, number],
  to: [number, number],
  thickness: number,
  count: number,
  topCourse: number,
): BlockSpec[] {
  const dx = worldX(to[0]) - worldX(from[0]);
  const dy = worldY(to[1]) - worldY(from[1]);
  const length = Math.hypot(dx, dy);
  const rotation = Math.atan2(dy, dx);
  return Array.from({ length: count }, (_, index): BlockSpec => {
    const t = (index + 0.5) / count;
    return {
      letter,
      dot: false,
      course: topCourse - index,
      corner: "none",
      rotation,
      center: [worldX(from[0]) + dx * t, worldY(from[1]) + dy * t, 0],
      size: [
        length / count - BLOCK_GAP,
        thickness * PX - BLOCK_GAP,
        BLOCK_DEPTH,
      ],
    };
  });
}

export function blockBounds(spec: BlockSpec): { min: Vec3; max: Vec3 } {
  const [cx, cy, cz] = spec.center;
  const [width, height, depth] = spec.size;
  const cos = Math.cos(spec.rotation);
  const sin = Math.sin(spec.rotation);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const x = (sx * width) / 2;
    const y = (sy * height) / 2;
    xs.push(cx + x * cos - y * sin);
    ys.push(cy + x * sin + y * cos);
  }
  return {
    min: [Math.min(...xs), Math.min(...ys), cz - depth / 2],
    max: [Math.max(...xs), Math.max(...ys), cz + depth / 2],
  };
}

export function buildIsuLayout(): BlockSpec[] {
  const blocks: BlockSpec[] = [
    // I: 기둥 5단과, 기둥 윗부분 왼쪽 위에 모서리가 맞닿는 초록 큐브
    ...column("i", 15, 30, LOGO_TOP, LOGO_BOTTOM, 5, 0),
    block(
      "i",
      5,
      { x0: 0, x1: 15, y0: LOGO_TOP - 15, y1: LOGO_TOP },
      "none",
      true,
    ),
    // S: 윗막대(왼쪽 위 둥금), 대각선 획, 아랫막대(오른쪽 아래 둥금)
    ...row("s", 4, 42, 76, 14, 28, 3, { first: "tl" }),
    ...stroke("s", [51, 32], [66.5, 50.5], 16, 3, 3),
    ...row("s", 0, 42, 77, 53, 67, 3, { last: "br" }),
    // U: 두 기둥과 양쪽 아래가 둥근 바닥
    ...column("u", 88, 103, LOGO_TOP, 51, 4, 1),
    ...column("u", 112, 127, LOGO_TOP, 51, 4, 1),
    ...row("u", 0, 88, 127, 51, 67, 3, { first: "bl", last: "br" }),
  ];
  const bounds = blocks.map(blockBounds);
  const shift =
    -(
      Math.min(...bounds.map((value) => value.min[0])) +
      Math.max(...bounds.map((value) => value.max[0]))
    ) / 2;
  return blocks.map(
    (spec): BlockSpec => ({
      ...spec,
      center: [spec.center[0] + shift, spec.center[1], spec.center[2]],
    }),
  );
}
