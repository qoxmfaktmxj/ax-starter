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
  /** 폭, 높이, 두께 */
  size: Vec3;
  /** 로고에서 크게 둥근 바깥 모서리 */
  corner: Corner;
  /** 블록 중심 기준 앞면 윤곽(월드 좌표, 반시계 방향). 없으면 size 직사각형이다. */
  outline?: [number, number][];
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

// 로고 윤곽을 따라 옆면을 비스듬히 깎은 단을 쌓는다. edges는 로고 좌표의
// [y, 왼쪽 x, 오른쪽 x] 목록이고, 이웃한 두 줄마다 블록 하나를 만든다(단 번호는
// 위에서부터 내림차순). 블록의 center와 size는 윤곽의 외접 직사각형을 틈 BLOCK_GAP / 2만큼
// 안쪽으로 줄인 뒤의 값이고, outline도 같은 만큼 줄인 네 점(왼쪽 아래, 오른쪽 아래,
// 오른쪽 위, 왼쪽 위, 반시계 방향)이다.
function slants(
  letter: Letter,
  edges: [number, number, number][],
): BlockSpec[] {
  const half = BLOCK_GAP / 2;
  const count = edges.length - 1;
  return Array.from({ length: count }, (_, index): BlockSpec => {
    const [topY, topLeftX, topRightX] = edges[index];
    const [bottomY, bottomLeftX, bottomRightX] = edges[index + 1];
    const corners: [number, number][] = [
      [worldX(bottomLeftX) + half, worldY(bottomY) + half], // bottom left
      [worldX(bottomRightX) - half, worldY(bottomY) + half], // bottom right
      [worldX(topRightX) - half, worldY(topY) - half], // top right
      [worldX(topLeftX) + half, worldY(topY) - half], // top left
    ];
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const center: Vec3 = [(minX + maxX) / 2, (minY + maxY) / 2, 0];
    return {
      letter,
      dot: false,
      course: count - index,
      corner: "none",
      center,
      size: [maxX - minX, maxY - minY, BLOCK_DEPTH],
      outline: corners.map(([x, y]) => [x - center[0], y - center[1]]),
    };
  });
}

// 회전이 없으니 center와 size만으로 계산한다.
export function blockBounds(spec: BlockSpec): { min: Vec3; max: Vec3 } {
  const [cx, cy, cz] = spec.center;
  const [width, height, depth] = spec.size;
  return {
    min: [cx - width / 2, cy - height / 2, cz - depth / 2],
    max: [cx + width / 2, cy + height / 2, cz + depth / 2],
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
    // S: 윗막대(왼쪽 위 둥금), 로고 윤곽을 따라 옆면을 비스듬히 깎은 4단, 아랫막대(오른쪽 아래 둥금)
    ...row("s", 5, 42, 75, 14, 28, 3, { first: "tl" }),
    ...slants("s", [
      [28, 42, 58.5],
      [34.25, 43.3, 63.3],
      [40.5, 48.5, 70.5],
      [46.75, 55.8, 74.8],
      [53, 59, 75],
    ]),
    ...row("s", 0, 42, 75, 53, 67, 3, { last: "br" }),
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
