# ISU 로그인 그래픽 고도화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 3D 장면을 로고 실측 대문자 ISU, 파랑 얼음돌 블록, 틈새 빛, 후처리, HUD로 다시 만들어 igloo.inc 대비 80점 이상 분위기를 낸다.

**Architecture:** 장면 파일 `isu-scene.ts`가 커지지 않도록 역할별 모듈로 나눈다. `isu-layout.ts`(로고 실측 배치, 순수), `login-motion.ts`(움직임 계수와 착지 곡선, 순수), `isu-blocks.ts`(블록 형태와 재질), `isu-glow.ts`(틈새 심과 바닥 빛), `isu-post.ts`(후처리와 높이 안개), `isu-hud.ts`(HUD 선택과 그리기). 순수 모듈은 Vitest로, 화면은 e2e와 캡처로 검증한다. 마지막 Task는 igloo.inc와 나란히 채점하며 조정한다.

**Tech Stack:** three 0.183.2 (EffectComposer, GTAOPass, UnrealBloomPass, ShaderPass, OutputPass), Next.js 16, React 19, Vitest 5, Playwright 1.63, Docker Compose.

**설계 문서:** [docs/superpowers/specs/2026-09-25-isu-login-visual-uplift-design.md](../specs/2026-09-25-isu-login-visual-uplift-design.md)

## Global Constraints

- 문서, 응답, 코드 주석에 U+00B7, U+2014, U+2013을 쓰지 않는다. 사용자 문구는 한국어.
- 화면 CSS의 색은 역할 토큰만 쓴다. 3D 장면 색은 `isu-scene.ts`의 `TUNE`과 각 모듈 상수에 둔다.
- 새 npm 의존성을 추가하지 않는다. three의 addons만 쓴다.
- igloo.inc의 모델, 텍스처, 코드 파일을 가져오지 않는다. 채점용 캡처는 `output/`(Git 제외)에만 둔다.
- ISU 파랑 #0090D0, 연두 #A0C840. 블록 틈 0.06, 블록 두께 0.7, 글자 높이 3.1, 블록 26개.
- 맨 아래 단 움직임 폭 0.5. 블록 편차 크기 +-6%, 회전 +-3도.
- Share 슬로건 불투명도 평소 0.35, 로그인 성공 시 1.
- 목표: 7항목 평균 80점 이상, 실제 GPU 브라우저 1440x900에서 50fps 이상.
- 기존 테스트를 지우거나 약하게 만들지 않는다. 모션 감소와 WebGL 실패 대체 화면을 유지한다.
- AGENTS.md 8번: 일회성 Docker 검사는 고유 `-p` 프로젝트 이름으로 돌리고 끝나면 그 프로젝트만 정리한다. 기본 `ax-starter` 프로젝트의 local volume은 보존한다.

## 실행 방식 (사용자 지정)

- 각 Task는 새 구현 subagent(**model: sonnet**)가 수행하고, 메인 세션이 diff와 실제 명령 출력을 보고 100점 만점으로 채점한다(스펙 30, 동작과 테스트 30, 코드 품질 20, 검증 증거 20). 85점 이상이고 차단 이슈 0개면 통과, 미달이면 재작업.
- Task 7의 채점은 메인 세션과 독립 리뷰 에이전트(**model: opus**)가 한다.
- 커밋은 승인되어 있다. 메시지 마지막 줄은 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 다른 세션이 같은 저장소에서 작업할 수 있다. 자기 Task 파일만 stage한다.

## 명령 모음

호스트(Windows, Node 22, pnpm 10.33):

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm architecture
pnpm test
```

포맷: `pnpm exec prettier --write <파일들>`

Docker e2e(고유 프로젝트 이름 `isu-visual`):

```bash
docker compose -p isu-visual --profile test build
docker compose -p isu-visual --profile test up -d --force-recreate test-setup-e2e test-web test-worker
docker compose -p isu-visual --profile test run --rm test pnpm e2e
# 파일 하나: docker compose -p isu-visual --profile test run --rm test pnpm e2e tests/e2e/login-scene.spec.ts
# 리뷰 캡처: docker compose -p isu-visual --profile test run --rm -e CAPTURE_REVIEW_OUT=/app/test-results/login test pnpm exec tsx scripts/capture-login-still.ts
# 정리(모든 Task가 끝난 뒤 한 번): docker compose -p isu-visual --profile test down --volumes --remove-orphans
```

리뷰 캡처 PNG는 호스트 `output/playwright-test/login/`에 생긴다. e2e를 다시 돌리면 지워지므로 캡처는 e2e 뒤에 한다.

## File Structure

| 파일 | 책임 | Task |
| --- | --- | --- |
| `apps/web/app/login/isu-layout.ts` | 로고 실측 블록 배치(순수) | 1 |
| `apps/web/app/login/login-motion.ts` | `courseFactor`, `landing`, `LANDING_SPAN` 추가 | 1 |
| `tests/unit/isu-layout.test.ts`, `tests/unit/login-motion.test.ts` | 단위 테스트 | 1 |
| `apps/web/app/login/login.css` | Share 옅게, 장면 캔버스 클래스, HUD 캔버스 | 2, 6 |
| `tests/e2e/login-scene.spec.ts` | 슬로건 상태, HUD | 2, 6 |
| `scripts/export-isu-layout.ts`, `tools/blender/*` | 블렌더 입력 JSON과 블록 생성 스크립트 | 3A |
| `apps/web/public/models/*`, `apps/web/public/draco/*` | 블렌더 산출 GLB, 출처, Draco 해독기 | 3A, 3B |
| `apps/web/app/login/isu-blocks.ts` | GLB 불러오기, 얼음돌 재질, 초록 큐브 | 3B |
| `apps/web/app/login/isu-glow.ts` | 틈새 심, 바닥 빛 | 4 |
| `apps/web/app/login/isu-post.ts` | 후처리 체인, 높이 안개 | 5 |
| `apps/web/app/login/isu-hud.ts`, `tests/unit/isu-hud.test.ts` | HUD 점 선택, 그리기 | 6 |
| `apps/web/app/login/isu-scene.ts` | 위 모듈을 조립 | 1, 3, 4, 5, 6 |
| `apps/web/app/login/LoginScene.tsx` | HUD 캔버스 전달 | 6 |
| `scripts/capture-login-still.ts` | 캔버스 선택자, 포인터 캡처 | 6, 7 |
| `apps/web/public/images/login/login-still-*.webp` | 정지 이미지 재캡처 | 7 |
| `docs/PROGRESS.md` | 점수와 검증 기록 | 7 |

---

### Task 1: 로고 실측 배치와 움직임 도우미

**Files:**
- Modify: `apps/web/app/login/isu-layout.ts` (전체 교체)
- Modify: `apps/web/app/login/login-motion.ts` (추가)
- Modify: `apps/web/app/login/isu-scene.ts` (새 배치에 맞춘 최소 변경)
- Modify: `tests/unit/isu-layout.test.ts` (전체 교체)
- Modify: `tests/unit/login-motion.test.ts` (추가)

**Interfaces:**
- Produces:
  - `type Letter = "i" | "s" | "u"`, `type Corner = "none" | "tl" | "tr" | "bl" | "br"`, `type Vec3 = [number, number, number]`
  - `type BlockSpec = { letter: Letter; dot: boolean; course: number; center: Vec3; size: Vec3; rotation: number; corner: Corner }`
  - `const LETTER_HEIGHT = 3.1`, `const BLOCK_DEPTH = 0.7`, `const BLOCK_GAP = 0.06`
  - `function buildIsuLayout(): BlockSpec[]`, `function blockBounds(spec: BlockSpec): { min: Vec3; max: Vec3 }`
  - `function courseFactor(course: number): number`, `const LANDING_SPAN = 0.45`, `function landing(progress: number, delay: number): number`

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`tests/unit/isu-layout.test.ts` 전체:

```ts
import { describe, expect, it } from "vitest";
import {
  BLOCK_GAP,
  blockBounds,
  buildIsuLayout,
  LETTER_HEIGHT,
  type Letter,
} from "../../apps/web/app/login/isu-layout";

describe("ISU block layout measured from the logo", () => {
  const blocks = buildIsuLayout();
  const byLetter = (letter: Letter) =>
    blocks.filter((block) => block.letter === letter);
  const span = (letter: Letter, axis: 0 | 1) => {
    const bounds = byLetter(letter)
      .filter((block) => !block.dot)
      .map(blockBounds);
    return [
      Math.min(...bounds.map((value) => value.min[axis])),
      Math.max(...bounds.map((value) => value.max[axis])),
    ];
  };

  it("uses 26 blocks: I 5 plus the green dot, S 9, U 11", () => {
    expect(blocks).toHaveLength(26);
    expect(byLetter("i")).toHaveLength(6);
    expect(byLetter("s")).toHaveLength(9);
    expect(byLetter("u")).toHaveLength(11);
  });

  it("puts the green dot diagonally at the upper left of the I stem", () => {
    const dots = blocks.filter((block) => block.dot);
    expect(dots).toHaveLength(1);
    const dot = blockBounds(dots[0]);
    const [stemLeft] = span("i", 0);
    const [, stemTop] = span("i", 1);
    expect(Math.abs(stemLeft - dot.max[0])).toBeLessThanOrEqual(
      BLOCK_GAP + 1e-6,
    );
    expect(Math.abs(dot.min[1] - stemTop)).toBeLessThanOrEqual(
      BLOCK_GAP + 1e-6,
    );
    const others = blocks
      .filter((block) => !block.dot)
      .map((block) => blockBounds(block).max[1]);
    expect(dot.min[1]).toBeGreaterThan(Math.max(...others));
  });

  it("orders I, S, U with gaps close to the logo", () => {
    const [, iRight] = span("i", 0);
    const [sLeft, sRight] = span("s", 0);
    const [uLeft] = span("u", 0);
    expect(sLeft - iRight).toBeGreaterThan(0.5);
    expect(sLeft - iRight).toBeLessThan(1);
    expect(uLeft - sRight).toBeGreaterThan(0.5);
    expect(uLeft - sRight).toBeLessThan(1);
  });

  it("is centered on x=0, stands on y=0 and stays under the letter height", () => {
    const bounds = blocks.map(blockBounds);
    const minX = Math.min(...bounds.map((value) => value.min[0]));
    const maxX = Math.max(...bounds.map((value) => value.max[0]));
    expect(Math.abs(minX + maxX)).toBeLessThan(1e-6);
    expect(Math.min(...bounds.map((value) => value.min[1]))).toBeCloseTo(
      BLOCK_GAP / 2,
      6,
    );
    const letterTop = Math.max(
      ...blocks
        .filter((block) => !block.dot)
        .map((block) => blockBounds(block).max[1]),
    );
    expect(letterTop).toBeLessThanOrEqual(LETTER_HEIGHT);
  });

  it("rounds only the four corners that are round in the logo", () => {
    const corners = blocks
      .filter((block) => block.corner !== "none")
      .map((block) => `${block.letter}:${block.corner}`)
      .sort();
    expect(corners).toEqual(["s:br", "s:tl", "u:bl", "u:br"]);
  });

  it("marks the bottom course and tilts the S spine", () => {
    const bottom = blocks.filter((block) => block.course === 0);
    expect(bottom).toHaveLength(7);
    for (const block of bottom)
      expect(blockBounds(block).min[1]).toBeCloseTo(BLOCK_GAP / 2, 6);
    const tilted = blocks.filter((block) => block.rotation !== 0);
    expect(tilted).toHaveLength(3);
    for (const block of tilted) {
      expect(block.letter).toBe("s");
      expect(block.rotation).toBeGreaterThan((-60 * Math.PI) / 180);
      expect(block.rotation).toBeLessThan((-40 * Math.PI) / 180);
    }
  });
});
```

`tests/unit/login-motion.test.ts`의 import를 다음으로 바꾸고 파일 끝의 `});` 바로 위에 두 테스트를 추가한다:

```ts
import {
  courseFactor,
  createLoginMotion,
  landing,
  LANDING_SPAN,
  SHAKE_SECONDS,
  SHARE_SECONDS,
  shareIntensity,
} from "../../apps/web/app/login/login-motion";
```

```ts

  it("halves the reach of the bottom course", () => {
    expect(courseFactor(0)).toBe(0.5);
    expect(courseFactor(1)).toBe(1);
    expect(courseFactor(5)).toBe(1);
  });

  it("lands each block after its delay with a small overshoot", () => {
    expect(landing(0.1, 0.2)).toBe(0);
    expect(landing(0.2 + LANDING_SPAN, 0.2)).toBeCloseTo(1, 6);
    let peak = 0;
    for (let progress = 0.2; progress <= 0.2 + LANDING_SPAN; progress += 0.01)
      peak = Math.max(peak, landing(progress, 0.2));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.12);
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test`
Expected: FAIL. `BLOCK_GAP`, `courseFactor`, `landing` 등을 찾지 못하고 기존 배치 테스트의 개수 단언이 실패한다.

- [ ] **Step 3: 배치 모듈 교체**

`apps/web/app/login/isu-layout.ts` 전체:

```ts
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
      size: [length / count - BLOCK_GAP, thickness * PX - BLOCK_GAP, BLOCK_DEPTH],
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
    block("i", 5, { x0: 0, x1: 15, y0: LOGO_TOP - 15, y1: LOGO_TOP }, "none", true),
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
```

- [ ] **Step 4: 움직임 도우미 추가**

`apps/web/app/login/login-motion.ts` 끝에 추가:

```ts

// 맨 아래 단 블록은 바닥에 붙어 있으므로 절반만 움직인다.
export function courseFactor(course: number) {
  return course === 0 ? 0.5 : 1;
}

// 등장 때 블록 하나가 날아와 앉는 곡선. delay 뒤 LANDING_SPAN 동안 0에서 1로 가며 끝에서 살짝 튄다.
export const LANDING_SPAN = 0.45;

export function landing(progress: number, delay: number) {
  const t = Math.min(1, Math.max(0, (progress - delay) / LANDING_SPAN));
  if (t === 0) return 0;
  const overshoot = 1.70158;
  return (
    1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2
  );
}
```

- [ ] **Step 5: 장면을 새 배치에 맞추기(최소 변경)**

`apps/web/app/login/isu-scene.ts`에서:

1. import 두 줄을 바꾼다:

```ts
import { buildIsuLayout, type BlockSpec } from "./isu-layout";
import { courseFactor, createLoginMotion, shareIntensity } from "./login-motion";
```

2. `function boxGeometry(spec: BoxBlock) {`부터 `function arcGeometry(spec: ArcBlock) { ... }`의 끝까지 두 함수를 지우고 다음 하나로 바꾼다(Task 3B에서 다시 교체한다):

```ts
function blockGeometry(spec: BlockSpec) {
  const geometry = roundedFrostBox();
  geometry.setAttribute("frostUv", frostUvOf(geometry));
  geometry.scale(spec.size[0], spec.size[1], spec.size[2]);
  geometry.computeVertexNormals();
  return geometry;
}
```

3. 블록 생성의

```ts
    const mesh = new THREE.Mesh(
      spec.kind === "box" ? boxGeometry(spec) : arcGeometry(spec),
      material,
    );
```

를 `const mesh = new THREE.Mesh(blockGeometry(spec), material);`로 바꾸고, `mesh.position.copy(base);` 다음 줄에 `mesh.rotation.z = spec.rotation;`를 넣는다. 같은 return 객체에서 `dot: spec.dot,` 바로 위에 다음 두 줄을 넣는다:

```ts
      rotation: spec.rotation,
      reach: courseFactor(spec.course),
```

4. 렌더 루프의 `const heightGate = THREE.MathUtils.smoothstep(block.base.y, 0.45, 1.0);`를 `const heightGate = block.reach;`로 바꾼다.

5. 렌더 루프의 `block.mesh.rotation.set(` 세 번째 인자 `spread * Math.sin(block.id * 0.7) * 0.4,`를 `block.rotation + spread * Math.sin(block.id * 0.7) * 0.4,`로 바꾼다.

- [ ] **Step 6: 통과 확인과 빠른 검사**

Run: `pnpm exec prettier --write apps/web/app/login/isu-layout.ts apps/web/app/login/login-motion.ts apps/web/app/login/isu-scene.ts tests/unit` 후 `pnpm test` `pnpm format:check` `pnpm lint` `pnpm typecheck` `pnpm architecture`
Expected: 모두 exit 0. 단위 테스트는 isu-layout 6개, login-motion 6개를 포함해 전부 PASS.

- [ ] **Step 7: 장면 e2e 확인**

Run: 명령 모음의 e2e 빌드와 기동 후 `docker compose -p isu-visual --profile test run --rm test pnpm e2e tests/e2e/login-scene.spec.ts`
Expected: 전부 PASS. 이어서 리뷰 캡처를 한 번 만들고 `output/playwright-test/login/login-1440x900.png`를 열어 대문자 ISU로 읽히는지, 초록 큐브가 I 왼쪽 위에 있는지 보고한다.

- [ ] **Step 8: 커밋**

```bash
git add apps/web/app/login/isu-layout.ts apps/web/app/login/login-motion.ts apps/web/app/login/isu-scene.ts tests/unit/isu-layout.test.ts tests/unit/login-motion.test.ts
git commit -m "feat(login): logo-accurate uppercase ISU layout and bottom-course motion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Share 슬로건 옅게 표시

**Files:**
- Modify: `apps/web/app/login/login.css`
- Modify: `tests/e2e/login-scene.spec.ts`

**Interfaces:**
- Consumes: 기존 `main.loginPage[data-shared]`, canvas `data-preview`, `data-intro`.
- Produces: `.loginSloganShare` 계산 불투명도 평소 `"0.35"`, 성공 시 `"1"`.

- [ ] **Step 1: 실패하는 e2e로 바꾸기**

`tests/e2e/login-scene.spec.ts`에서:

1. "a static scene shows both slogan lines from the start" 테스트의 `expect(await opacity(page, ".loginSloganShare")).toBe("1");`를 `expect(await opacity(page, ".loginSloganShare")).toBe("0.35");`로 바꾸고, 테스트 이름을 `"a static scene shows Challenge fully and Share faintly"`로 바꾼다.
2. "slogan lines, calm and share follow the scene and the sign-in" 테스트의 `expect(await opacity(page, ".loginSloganShare")).toBe("0");`를 다음으로 바꾼다:

```ts
  await expect
    .poll(() => opacity(page, ".loginSloganShare"))
    .toBe("0.35");
```

3. 같은 테스트의 `await expect(page.locator(".loginPage")).toHaveAttribute("data-shared", "true");` 문장 바로 다음에 추가한다:

```ts
  // 성공하면 Share가 진해진다. 이동은 최대 1.2초 뒤라 그 전에 확인한다.
  await expect
    .poll(() => opacity(page, ".loginSloganShare"), {
      timeout: 1_100,
      intervals: [50],
    })
    .toBe("1");
```

- [ ] **Step 2: 실패 확인**

Run: e2e 빌드와 기동 후 `docker compose -p isu-visual --profile test run --rm test pnpm e2e tests/e2e/login-scene.spec.ts`
Expected: static 테스트가 `Expected "0.35" Received "1"`로 FAIL.

- [ ] **Step 3: CSS 수정**

`apps/web/app/login/login.css`의 다음 블록

```css
.loginSloganShare {
  color: var(--color-login-slogan-share);
}
```

을 다음으로 바꾼다:

```css
.loginSloganShare {
  color: var(--color-login-slogan-share);
  opacity: 0.35;
}
```

그리고 다음 두 규칙

```css
.loginPage:has(canvas[data-preview="true"]) .loginSloganChallenge,
.loginPage:has(canvas[data-preview="true"]) .loginSloganShare {
  opacity: 0;
  transform: translateY(6px);
}

.loginPage:has(canvas[data-intro="complete"]) .loginSloganChallenge,
.loginPage[data-shared="true"]:has(canvas) .loginSloganShare {
  opacity: 1;
  transform: none;
}
```

을 다음으로 바꾼다:

```css
/* 장면이 살아 있으면 등장이 끝날 때 Challenge는 선명하게, Share는 옅게 보인다. 로그인 성공 때 Share가 진해진다. */
.loginPage:has(canvas[data-preview="true"]) .loginSloganChallenge,
.loginPage:has(canvas[data-preview="true"]) .loginSloganShare {
  opacity: 0;
  transform: translateY(6px);
}

.loginPage:has(canvas[data-intro="complete"]) .loginSloganChallenge {
  opacity: 1;
  transform: none;
}

.loginPage:has(canvas[data-intro="complete"]) .loginSloganShare {
  opacity: 0.35;
  transform: none;
}

.loginPage[data-shared="true"] .loginSloganShare,
.loginPage[data-shared="true"]:has(canvas) .loginSloganShare {
  opacity: 1;
  transform: none;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec prettier --write apps/web/app/login/login.css tests/e2e/login-scene.spec.ts` 후 `pnpm format:check` `pnpm lint` `pnpm typecheck`, e2e 이미지 재빌드와 기동 후 전체 `docker compose -p isu-visual --profile test run --rm test pnpm e2e`
Expected: 전체 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/login/login.css tests/e2e/login-scene.spec.ts
git commit -m "feat(login): show Share the Future faintly until sign-in succeeds" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3A: 블렌더 블록 에셋

설계 문서 8절(2026-09-25 결정)에 따라 블록 형태와 굽기를 블렌더로 만든다.

**Files:**
- Create: `scripts/export-isu-layout.ts`
- Create: `tools/blender/isu-layout.json` (스크립트 산출, 커밋)
- Create: `tools/blender/build_isu_blocks.py`
- Create: `tests/unit/isu-layout-export.test.ts`
- Create: `apps/web/public/models/isu-blocks.glb` (스크립트 산출, 커밋)
- Create: `apps/web/public/models/provenance.json`
- Modify: `docs/DEPENDENCIES.md`
- 산출(커밋하지 않음): `output/blender/isu-blocks-preview.png`

**Interfaces:**
- Consumes: Task 1 `buildIsuLayout(): BlockSpec[]`.
- Produces: `apps/web/public/models/isu-blocks.glb`. 메시 노드 이름 `block-00` ~ `block-25`(배치 순서, 두 자리). 각 메시는 원점이 블록 중심이고 회전이 없는 로컬 좌표(three 기준 x=폭, y=높이, z=두께)이며 속성 `position`, `normal`, `uv`, `color`(RGBA: R=AO, G=모서리 마모, B=블록별 색조, A=1)를 가진다. Draco 압축.

블렌더 실행 파일: `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` (5.2.1 LTS).

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`tests/unit/isu-layout-export.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIsuLayout } from "../../apps/web/app/login/isu-layout";

describe("Blender layout input", () => {
  it("matches buildIsuLayout() exactly", () => {
    const exported = JSON.parse(
      readFileSync("tools/blender/isu-layout.json", "utf8"),
    );
    expect(exported).toEqual(buildIsuLayout());
  });
});
```

Run: `pnpm test`
Expected: FAIL, `ENOENT: no such file or directory, open 'tools/blender/isu-layout.json'`.

- [ ] **Step 2: 배치 내보내기 스크립트**

`scripts/export-isu-layout.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { buildIsuLayout } from "../apps/web/app/login/isu-layout";

// 블렌더 블록 스크립트의 입력. 배치를 바꾸면 이 스크립트와 블렌더 스크립트를 다시 실행한다.
await mkdir("tools/blender", { recursive: true });
await writeFile(
  "tools/blender/isu-layout.json",
  `${JSON.stringify(buildIsuLayout(), null, 2)}\n`,
);
console.log("tools/blender/isu-layout.json written");
```

Run: `pnpm exec tsx scripts/export-isu-layout.ts` 후 `pnpm test`
Expected: 새 테스트 PASS, 전체 PASS.

- [ ] **Step 3: 블렌더 스크립트 작성**

`tools/blender/build_isu_blocks.py`:

```python
"""ISU 로그인 블록 모델을 만든다.

블렌더 5.2.1에서 화면 없이 실행한다.
  blender -b --factory-startup --python tools/blender/build_isu_blocks.py -- \
    --layout tools/blender/isu-layout.json \
    --out apps/web/public/models/isu-blocks.glb \
    --preview output/blender/isu-blocks-preview.png

좌표: three (x, y, z)를 블렌더 (x, -z, y)로 둔다. glTF 내보내기의 export_yup이 되돌린다.
정점 색 isu: R=AO, G=모서리 마모, B=블록별 색조 편차.
"""

import argparse
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector, noise

VOXEL = 0.028  # 리메시 해상도(월드 단위)
BEVEL = 0.05  # 작은 모서리 깎기
LUMP = 0.022  # 면의 울퉁불퉁한 정도
CRACK = 0.05  # 모서리 균열 깊이
WEAR_GAIN = 6.0  # 곡률을 마모 값으로 바꾸는 배율
CORNER_SIGN = {"tl": (-1, 1), "tr": (1, 1), "bl": (-1, -1), "br": (1, -1)}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--layout", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--preview")
    return parser.parse_args(argv)


def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def base_mesh(name, spec):
    width, height, depth = spec["size"]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vert in bm.verts:
        vert.co.x *= width
        vert.co.y *= depth
        vert.co.z *= height
    corner = spec["corner"]
    if corner != "none":
        # 로고에서 둥근 바깥 모서리: 두께 방향 모서리 하나를 블록 크기만큼 크게 깎는다.
        sx, sz = CORNER_SIGN[corner]
        edges = [
            edge
            for edge in bm.edges
            if all(
                abs(vert.co.x - sx * width / 2) < 1e-5
                and abs(vert.co.z - sz * height / 2) < 1e-5
                for vert in edge.verts
            )
        ]
        bmesh.ops.bevel(
            bm,
            geom=edges,
            offset=min(width, height) * 0.9,
            offset_type="OFFSET",
            segments=16,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=False,
        )
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return mesh


def apply_modifiers(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    old = obj.data
    obj.modifiers.clear()
    obj.data = mesh
    bpy.data.meshes.remove(old)


def sculpt(obj, spec, seed):
    width, height, depth = spec["size"]
    bevel = obj.modifiers.new("bevel", "BEVEL")
    bevel.width = BEVEL
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(40)
    remesh = obj.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = VOXEL
    apply_modifiers(obj)

    half = Vector((width / 2, depth / 2, height / 2))
    offset = Vector((seed * 3.1, seed * 1.7, seed * 5.3))
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    moves = []
    for vert in bm.verts:
        p = vert.co
        # 두 축 이상이 끝에 가까운 곳을 모서리로 본다.
        edge = max(
            0.0,
            min(
                1.0,
                smoothstep(0.72, 1.0, abs(p.x) / half.x)
                + smoothstep(0.72, 1.0, abs(p.y) / half.y)
                + smoothstep(0.72, 1.0, abs(p.z) / half.z)
                - 1.0,
            ),
        )
        lump = max(-1.5, min(1.5, noise.fractal(p * 3.0 + offset, 0.9, 2.0, 4))) * LUMP
        distances, _ = noise.voronoi(p * 5.5 + offset, distance_metric="DISTANCE", exponent=2.5)
        crack = (1.0 - smoothstep(0.0, 0.28, distances[1] - distances[0])) * CRACK * edge
        moves.append((vert, vert.normal.copy() * (lump - crack)))
    for vert, move in moves:
        vert.co += move
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def unwrap(obj):
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")


def place(obj, spec):
    x, y, z = spec["center"]
    obj.location = (x, -z, y)
    obj.rotation_euler = (0.0, -spec["rotation"], 0.0)


def prepare_colors(obj):
    mesh = obj.data
    attribute = mesh.color_attributes.new(name="isu", type="FLOAT_COLOR", domain="POINT")
    index = list(mesh.color_attributes).index(attribute)
    mesh.color_attributes.active_color_index = index
    mesh.color_attributes.render_color_index = index


def bake_ambient_occlusion(blocks):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 64
    scene.world = bpy.data.worlds.new("ao")
    scene.world.light_settings.distance = 0.8
    # 바닥 접촉 그림자를 위해 바닥면을 잠시 둔다.
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    ground = bpy.context.active_object
    for obj in blocks:
        activate(obj)
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    bpy.data.objects.remove(ground, do_unlink=True)


def edge_wear(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    wear = [0.0] * len(bm.verts)
    for vert in bm.verts:
        total = 0.0
        for edge in vert.link_edges:
            direction = (edge.other_vert(vert).co - vert.co).normalized()
            # 볼록한 곳은 이웃이 법선 반대편에 있어 값이 커진다.
            total -= direction.dot(vert.normal)
        count = max(len(vert.link_edges), 1)
        wear[vert.index] = max(0.0, min(1.0, total / count * WEAR_GAIN))
    bm.free()
    return wear


def finalize_colors(obj, seed):
    mesh = obj.data
    wear = edge_wear(mesh)
    tint = random.Random(seed).random()
    for index, value in enumerate(mesh.color_attributes["isu"].data):
        value.color = (value.color[0], wear[index], tint, 1.0)


def export(blocks, path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in blocks:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_normals=True,
        export_texcoords=True,
        export_materials="NONE",
        export_vertex_color="ACTIVE",
        export_active_vertex_color_when_no_material=True,
        export_all_vertex_colors=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_draco_color_quantization=10,
    )


def render_preview(blocks, path):
    scene = bpy.context.scene
    material = bpy.data.materials.new("preview")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.6
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "isu"
    separate = nodes.new("ShaderNodeSeparateColor")
    shade = nodes.new("ShaderNodeMix")
    shade.data_type = "RGBA"
    shade.blend_type = "MULTIPLY"
    shade.inputs["Factor"].default_value = 1.0
    color_a = next(i for i in shade.inputs if i.identifier == "A_Color")
    color_b = next(i for i in shade.inputs if i.identifier == "B_Color")
    color_a.default_value = (0.0, 0.33, 0.62, 1.0)
    links.new(attribute.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Red"], color_b)
    links.new(next(o for o in shade.outputs if o.identifier == "Result_Color"), bsdf.inputs["Base Color"])
    for obj in blocks:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    camera_data = bpy.data.cameras.new("preview")
    camera = bpy.data.objects.new("preview", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (-2.5, -13.0, 2.2)
    camera.rotation_euler = (Vector((0.2, 0.0, 1.6)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (math.radians(50), 0.0, math.radians(-30))
    scene.collection.objects.link(sun)
    scene.world.color = (0.05, 0.08, 0.14)
    scene.cycles.samples = 48
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.filepath = os.path.abspath(path)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.render.render(write_still=True)


def main():
    args = parse_args()
    with open(args.layout, encoding="utf-8") as file:
        layout = json.load(file)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    blocks = []
    for index, spec in enumerate(layout):
        name = f"block-{index:02d}"
        obj = bpy.data.objects.new(name, base_mesh(name, spec))
        bpy.context.collection.objects.link(obj)
        sculpt(obj, spec, index + 1)
        unwrap(obj)
        place(obj, spec)
        prepare_colors(obj)
        blocks.append(obj)
    bake_ambient_occlusion(blocks)
    for index, obj in enumerate(blocks):
        finalize_colors(obj, index + 1)
    triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in blocks)
    print(f"ISU_BLOCKS blocks={len(blocks)} triangles={triangles}")
    export(blocks, args.out)
    print(f"ISU_BLOCKS glb={os.path.getsize(args.out)} bytes")
    if args.preview:
        render_preview(blocks, args.preview)
        print(f"ISU_BLOCKS preview={args.preview}")


main()
```

- [ ] **Step 4: 스크립트 실행**

PowerShell:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python tools/blender/build_isu_blocks.py -- --layout tools/blender/isu-layout.json --out apps/web/public/models/isu-blocks.glb --preview output/blender/isu-blocks-preview.png
```

Expected: `ISU_BLOCKS blocks=26 triangles=...`, `ISU_BLOCKS glb=... bytes`, `ISU_BLOCKS preview=...`가 출력된다.

블렌더 API 이름이 5.2.1과 다르면(예: `export_vertex_color` 값, `bmesh.ops.bevel` 인자, 굽기 조건) 다음으로 실제 이름을 확인하고 가장 작은 수정으로 맞춘다. 수정 내용과 이유를 보고한다.

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python-expr "import bpy; p = bpy.ops.export_scene.gltf.get_rna_type().properties; print([i.identifier for i in p['export_vertex_color'].enum_items])"
```

AO 굽기가 재질이 없다는 이유로 실패하면, 굽기 전에 블록마다 빈 재질 하나를 넣고 내보낼 때는 `export_materials="NONE"`로 재질을 빼는 방식으로 고친다.

- [ ] **Step 5: 결과 확인과 조정**

1. `output/blender/isu-blocks-preview.png`를 Read 도구로 열어 확인한다. 대문자 ISU로 읽히고, 블록마다 면이 다르게 울퉁불퉁하며, 모서리가 깨진 얼음돌처럼 보이고, S 왼쪽 위와 오른쪽 아래, U 아래 양쪽 모서리가 둥근지, 블록 틈과 바닥 접촉면에 AO가 들어갔는지 본다.
2. 삼각형 수는 전체 25만 이하, GLB는 4MB 이하를 목표로 한다. 넘으면 `VOXEL`을 0.004씩 키운다.
3. 형태가 밋밋하면 `LUMP`, `CRACK`을, 너무 거칠면 줄인다. 한 번에 한 값만 바꾸고 다시 실행한다. 최대 4회.
4. 최종 값과 삼각형 수, GLB 크기, 미리보기에서 본 내용을 보고한다.

- [ ] **Step 6: 출처와 의존성 기록**

`apps/web/public/models/provenance.json`:

```json
{
  "file": "isu-blocks.glb",
  "generator": "tools/blender/build_isu_blocks.py",
  "blender": "5.2.1 LTS",
  "input": "tools/blender/isu-layout.json (scripts/export-isu-layout.ts, buildIsuLayout())",
  "external_assets": false,
  "compression": "KHR_draco_mesh_compression",
  "attributes": "position, normal, uv, color (R=AO, G=edge wear, B=per-block tint)",
  "note": "Block shapes are generated procedurally by the script. No models, textures or code from third-party sites are included."
}
```

`docs/DEPENDENCIES.md` 표의 `| three |` 행 바로 아래에 추가:

```text
| Blender                      | 5.2.1 LTS (빌드 도구)                                        | 로그인 블록 모델을 `tools/blender/build_isu_blocks.py`로 생성. GPL-3.0-or-later 도구이며 저장소와 이미지에는 포함하지 않는다. 산출물 GLB는 스크립트의 결과물이다 |
```

- [ ] **Step 7: 빠른 검사와 커밋**

Run: `pnpm exec prettier --write scripts/export-isu-layout.ts tests/unit/isu-layout-export.test.ts apps/web/public/models/provenance.json` 후 `pnpm format:check` `pnpm lint` `pnpm typecheck` `pnpm architecture` `pnpm test`
Expected: 모두 exit 0.

```bash
git add scripts/export-isu-layout.ts tools/blender/isu-layout.json tools/blender/build_isu_blocks.py tests/unit/isu-layout-export.test.ts apps/web/public/models/isu-blocks.glb apps/web/public/models/provenance.json docs/DEPENDENCIES.md
git commit -m "feat(login): Blender-built ISU ice block models with baked AO" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3B: 블렌더 블록을 장면에 연결, 파랑 얼음돌 재질, 초록 큐브

**Files:**
- Create: `apps/web/app/login/isu-blocks.ts`
- Create: `apps/web/public/draco/draco_decoder.js`, `draco_decoder.wasm`, `draco_wasm_wrapper.js` (three에서 복사)
- Modify: `apps/web/app/login/isu-scene.ts`
- Modify: `tests/e2e/login-scene.spec.ts`

**Interfaces:**
- Consumes: Task 1 `BlockSpec`, `courseFactor`. Task 3A `isu-blocks.glb`(메시 `block-00` ~ `block-25`, 속성 `color` R=AO, G=마모, B=색조).
- Produces (`isu-blocks.ts`):
  - `loadBlockGeometries(count: number, signal: AbortSignal): Promise<THREE.BufferGeometry[]>`
  - `type IceShared = { reveal: { value: number }; glow: { value: THREE.Color }; snow: { value: THREE.Color } }`
  - `createIceMaterial(maps: { frost: THREE.Texture; bump: THREE.Texture }, shared: IceShared, color: THREE.Color): THREE.MeshStandardMaterial`
  - `createDotShellMaterial(maps, shared, color): THREE.MeshStandardMaterial`
  - `createDotCore(spec: BlockSpec, color: THREE.Color): { mesh: THREE.Mesh; setIntensity(value: number): void; dispose(): void }`
  - 장면 블록 레코드 필드(Task 4 이후가 쓴다): `mesh`, `material`, `base`, `outward`, `rotation`, `reach`, `dot`, `id`, `amount`, `target`, `idle`, `shareDistance`. 장면 지역 변수 `dotSpec`, `dotCore`, 렌더 함수 지역 변수 `breath`.

- [ ] **Step 1: 실패하는 e2e 추가**

`tests/e2e/login-scene.spec.ts` 끝에 추가:

```ts

test("a missing block model falls back to the still image", async ({
  page,
}) => {
  await page.route("**/models/isu-blocks.glb", (route) => route.abort());
  await page.goto("/login");
  await expect(canvas(page)).toHaveAttribute("data-ready", "false", {
    timeout: 30_000,
  });
  await expect
    .poll(() => sceneBackground(page))
    .toContain("login-still-desktop.webp");
  await expect(page.getByLabel("아이디")).toBeEditable();
});
```

Run: e2e 빌드와 기동 후 `docker compose -p isu-visual --profile test run --rm test pnpm e2e tests/e2e/login-scene.spec.ts`
Expected: 새 테스트 FAIL(장면이 모델을 쓰지 않으므로 `data-ready`가 "false"가 되지 않는다).

- [ ] **Step 2: Draco 해독기 복사**

```powershell
New-Item -ItemType Directory -Force apps\web\public\draco | Out-Null
foreach ($f in "draco_decoder.js","draco_decoder.wasm","draco_wasm_wrapper.js") { Copy-Item "node_modules\three\examples\jsm\libs\draco\gltf\$f" "apps\web\public\draco\$f" }
```

`apps/web/public/models/provenance.json`에 키를 추가한다: `"decoder": "apps/web/public/draco/* copied from three 0.183.2 examples/jsm/libs/draco/gltf (MIT via three)"`.

- [ ] **Step 3: 블록 모듈 작성**

`apps/web/app/login/isu-blocks.ts`:

```ts
import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { BlockSpec } from "./isu-layout";

// 블렌더(tools/blender/build_isu_blocks.py)로 만든 블록 형태를 불러오고 파랑 얼음돌 재질을 입힌다.
const BLOCK_MODEL_URL = "/models/isu-blocks.glb";

export async function loadBlockGeometries(count: number, signal: AbortSignal) {
  const draco = new DRACOLoader().setDecoderPath("/draco/");
  const loader = new GLTFLoader().setDRACOLoader(draco);
  try {
    const gltf = await loader.loadAsync(BLOCK_MODEL_URL);
    if (signal.aborted)
      throw new DOMException("Scene initialization cancelled", "AbortError");
    return Array.from({ length: count }, (_, index) => {
      const name = `block-${String(index).padStart(2, "0")}`;
      const node = gltf.scene.getObjectByName(name);
      if (!(node instanceof THREE.Mesh))
        throw new Error(`블록 모델에 ${name}이 없습니다.`);
      return node.geometry as THREE.BufferGeometry;
    });
  } finally {
    draco.dispose();
  }
}

type Shader = Parameters<THREE.MeshStandardMaterial["onBeforeCompile"]>[0];

export type IceShared = {
  reveal: { value: number };
  glow: { value: THREE.Color };
  snow: { value: THREE.Color };
};

type IceMaps = { frost: THREE.Texture; bump: THREE.Texture };

// 등장: 윤곽선만 보이다가 재질이 위에서 아래로 차오른다(랜딩 arctic-scene.ts와 같은 방식).
function addReveal(shader: Shader, reveal: { value: number }) {
  shader.uniforms.uIceReveal = reveal;
  shader.vertexShader = `varying vec2 vRevealUv; varying float vRevealY;\n${shader.vertexShader}`;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\nvRevealUv = uv; vRevealY = (modelMatrix * vec4(transformed, 1.)).y;",
  );
  shader.fragmentShader = `uniform float uIceReveal; varying vec2 vRevealUv; varying float vRevealY;\n${shader.fragmentShader}`;
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <tonemapping_fragment>",
    `
      if (uIceReveal < 1.) {
        float scanHeight = mix(4.5, -.8, uIceReveal);
        float solid = smoothstep(scanHeight - .12, scanHeight + .12, vRevealY);
        float border = min(min(vRevealUv.x, vRevealUv.y), min(1. - vRevealUv.x, 1. - vRevealUv.y));
        float outline = 1. - smoothstep(.0, max(fwidth(border) * 1.5, .008), border);
        if (solid < .01 && outline < .15) discard;
        vec3 wire = vec3(.85, 1., 1.1) * pow(outline, .3);
        gl_FragColor.rgb = mix(wire, gl_FragColor.rgb, solid);
        float scanLight = 1. - smoothstep(.02, .24, abs(vRevealY - scanHeight));
        gl_FragColor.rgb += vec3(.7, .85, 1.) * scanLight * .9;
      }
      #include <tonemapping_fragment>`,
  );
}

// 파랑 얼음돌: 굽기 AO로 틈을 어둡게, 깨진 모서리는 밝은 서리로, 위를 향한 면에는 눈을 얹는다.
function addIceSurface(shader: Shader, shared: IceShared) {
  shader.uniforms.uIceGlow = shared.glow;
  shader.uniforms.uSnow = shared.snow;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute vec4 color; varying vec4 vIceBake; varying vec3 vIceWorld; varying vec3 vIceNormal;",
    )
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvIceBake = color;")
    .replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvIceWorld = (modelMatrix * vec4(transformed, 1.)).xyz; vIceNormal = normalize(mat3(modelMatrix) * objectNormal);",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform vec3 uIceGlow; uniform vec3 uSnow; varying vec4 vIceBake; varying vec3 vIceWorld; varying vec3 vIceNormal;",
    )
    .replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float bakedAo = vIceBake.r;
      float wear = vIceBake.g;
      float tint = vIceBake.b;
      float frostGrain = texture2D(map, vMapUv * 2.0).r;
      float fineGrain = texture2D(map, vIceWorld.xy * .9 + vIceWorld.z * .37).g;
      vec3 blueDeep = diffuseColor.rgb * .45;
      vec3 blueLight = mix(diffuseColor.rgb, vec3(.72, .9, 1.), .3);
      vec3 stone = mix(blueDeep, blueLight, smoothstep(.2, .85, frostGrain * .6 + fineGrain * .25 + tint * .15));
      float snowCover = smoothstep(.5, .9, vIceNormal.y) * (.55 + .45 * fineGrain);
      stone = mix(stone, uSnow, snowCover);
      stone = mix(stone, vec3(.82, .94, 1.), smoothstep(.35, .9, wear) * .45);
      diffuseColor.rgb = stone * mix(.3, 1., bakedAo);`,
    )
    .replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = mix(.42, .82, clamp(frostGrain * .7 + snowCover * .4, 0., 1.));`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      float frostRim = pow(1. - max(0., dot(normalize(vNormal), normalize(vViewPosition))), 4.);
      totalEmissiveRadiance += uIceGlow * (frostRim * .16 * bakedAo + wear * wear * .12);`,
    );
}

export function createIceMaterial(
  maps: IceMaps,
  shared: IceShared,
  color: THREE.Color,
) {
  const material = new THREE.MeshStandardMaterial({
    color,
    map: maps.frost,
    normalMap: maps.bump,
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.6,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    addIceSurface(shader, shared);
    addReveal(shader, shared.reveal);
  };
  material.customProgramCacheKey = () => "isu-ice";
  return material;
}

// 초록 큐브의 반투명 껍질. 안쪽 코어(createDotCore)가 비쳐 보인다.
export function createDotShellMaterial(
  maps: IceMaps,
  shared: IceShared,
  color: THREE.Color,
) {
  const material = new THREE.MeshStandardMaterial({
    color,
    map: maps.frost,
    normalMap: maps.bump,
    normalScale: new THREE.Vector2(0.25, 0.25),
    roughness: 0.35,
    metalness: 0,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    emissive: color,
    emissiveIntensity: 0.35,
  });
  material.onBeforeCompile = (shader) => addReveal(shader, shared.reveal);
  material.customProgramCacheKey = () => "isu-dot";
  return material;
}

// 초록 큐브 안의 빛나는 코어. 톤 매핑을 받지 않아 빛 번짐이 잘 걸린다.
export function createDotCore(spec: BlockSpec, color: THREE.Color) {
  const geometry = new THREE.BoxGeometry(
    spec.size[0] * 0.55,
    spec.size[1] * 0.55,
    spec.size[2] * 0.55,
  );
  const material = new THREE.MeshBasicMaterial({
    color: color.clone(),
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  return {
    mesh,
    setIntensity(value: number) {
      material.color.copy(color).multiplyScalar(value);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
```

- [ ] **Step 4: 장면에 연결**

`apps/web/app/login/isu-scene.ts`에서:

1. import 추가:

```ts
import {
  createDotCore,
  createDotShellMaterial,
  createIceMaterial,
  loadBlockGeometries,
} from "./isu-blocks";
```

2. `TUNE`의 `iceColor: 0xc6dcf2,` 줄을 지우고 그 자리에 추가:

```ts
  isuBlue: new THREE.Color("#0090d0"),
  snow: new THREE.Color("#e6f2ff"),
```

3. 함수 `roundedFrostBox`, `frostUvOf`, `blockGeometry`를 지운다. `type Shader = ...;` 줄은 다른 곳에서 쓰지 않으면 지운다.

4. `// 등장: 윤곽선만 보이다가 재질이 위에서 아래로 차오른다.` 줄부터 `const makeIce = (isDot: boolean) => { ... };`의 끝까지를 지우고 다음으로 바꾼다:

```ts
  // 등장 진행과 블록 발광은 모든 블록 재질이 함께 쓰는 값이다.
  const reveal = { value: 1 };
  const iceShared = {
    reveal,
    glow: { value: TUNE.iceGlow.clone() },
    snow: { value: TUNE.snow.clone() },
  };
  const maps = { frost, bump };
```

5. `const layout = buildIsuLayout();` 다음 줄에 추가:

```ts
  // 블렌더로 만든 블록 형태. 불러오지 못하면 렌더러를 정리하고 정지 이미지로 넘어간다.
  let geometries: THREE.BufferGeometry[];
  try {
    geometries = await loadBlockGeometries(layout.length, signal);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
```

6. 블록 생성 `const blocks = layout.map((spec, index) => { ... });` 전체를 다음으로 바꾼다:

```ts
  const blocks = layout.map((spec, index) => {
    const material = spec.dot
      ? createDotShellMaterial(maps, iceShared, TUNE.lime)
      : createIceMaterial(maps, iceShared, TUNE.isuBlue);
    const mesh = new THREE.Mesh(geometries[index], material);
    const base = new THREE.Vector3(...spec.center);
    // 손으로 쌓은 느낌을 주려고 블록마다 크기 +-6%, 기울기 +-3도 편차를 준다.
    mesh.scale.setScalar(1 + (hash(index, 41) - 0.5) * 0.12);
    const rotation =
      spec.rotation + (hash(index, 53) - 0.5) * THREE.MathUtils.degToRad(6);
    mesh.position.copy(base);
    mesh.rotation.z = rotation;
    mesh.castShadow = mesh.receiveShadow = !spec.dot;
    letters.add(mesh);
    return {
      mesh,
      material,
      base,
      // 글자 가운데에서 조금 바깥으로, 주로 카메라 쪽으로 벌어진다.
      outward: base
        .clone()
        .sub(letterCenters.get(spec.letter)!)
        .multiplyScalar(0.35)
        .add(new THREE.Vector3(0, 0, 0.9)),
      rotation,
      reach: courseFactor(spec.course),
      dot: spec.dot,
      id: index + 1,
      amount: 0,
      target: 0,
      idle: 0,
      shareDistance: base.distanceTo(dotCenter),
    };
  });
  const dotSpec = layout.find((spec) => spec.dot)!;
  const dotCore = createDotCore(dotSpec, TUNE.lime);
  blocks.find((block) => block.dot)!.mesh.add(dotCore.mesh);
```

7. 렌더 함수에서 `const frame = motion.update(delta);` 다음 줄에 추가:

```ts
    // 초록 큐브는 약 3초 주기로 숨 쉬듯 밝아졌다 어두워진다.
    const breath = 0.5 + 0.5 * Math.sin((time * Math.PI * 2) / 3);
```

8. 렌더 루프의

```ts
      if (block.dot)
        block.material.emissive.copy(TUNE.lime).multiplyScalar(0.9 + lit * 0.8);
```

를 다음으로 바꾼다:

```ts
      if (block.dot)
        block.material.emissive
          .copy(TUNE.lime)
          .multiplyScalar(0.35 + breath * 0.25 + lit * 0.8);
```

9. 렌더 루프가 끝난 직후(`snowMaterial.uniforms.uTime.value = time;` 바로 위)에 추가:

```ts
    dotCore.setIntensity(1.6 + breath * 0.8 + frame.share * 1.2);
```

10. `dispose()` 안의 `for (const block of blocks) block.material.dispose();` 다음 줄에 `dotCore.dispose();`를 넣는다.

- [ ] **Step 5: 빠른 검사**

Run: `pnpm exec prettier --write apps/web/app/login tests/e2e/login-scene.spec.ts apps/web/public/models/provenance.json` 후 `pnpm format:check` `pnpm lint` `pnpm typecheck` `pnpm architecture` `pnpm test`
Expected: 모두 exit 0.

- [ ] **Step 6: e2e와 리뷰 캡처**

Run: e2e 빌드와 기동, 전체 `docker compose -p isu-visual --profile test run --rm test pnpm e2e`, 리뷰 캡처.
Expected: 전체 PASS(새 모델 없음 테스트 포함). `login-1440x900.png`를 열어 보고한다: 블록이 파랑 얼음돌로 보이는지, 블렌더에서 만든 울퉁불퉁한 면과 깨진 모서리가 보이는지, AO로 틈과 바닥이 어두운지, 윗면에 눈 빛이 있는지, 초록 큐브가 안에서 빛나는지, 면이 뒤집히거나 블록이 엉뚱한 곳에 있지 않은지. 블록 방향이 틀어져 보이면(두께와 높이가 바뀜) 3A의 좌표 변환을 의심하고 보고한다.

- [ ] **Step 7: 커밋**

```bash
git add apps/web/app/login/isu-blocks.ts apps/web/app/login/isu-scene.ts apps/web/public/draco apps/web/public/models/provenance.json tests/e2e/login-scene.spec.ts
git commit -m "feat(login): load Blender blocks with blue ice-stone shading and green core" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 틈새 빛, 바닥 빛, 날아와 쌓이는 등장

**Files:**
- Create: `apps/web/app/login/isu-glow.ts`
- Modify: `apps/web/app/login/isu-scene.ts`

**Interfaces:**
- Consumes: Task 1 `BlockSpec`, `BLOCK_GAP`, `landing`, `LANDING_SPAN`. Task 3B 블록 레코드(`block.mesh`, `block.base`, `block.rotation`, `block.reach`, `block.dot`, `block.id`), 렌더 함수의 `breath`.
- Produces (`isu-glow.ts`):
  - `createGlowCores(specs: BlockSpec[], color: THREE.Color): { mesh: THREE.InstancedMesh; setIntensity(value: number): void; dispose(): void }`
  - `createGroundGlow(width: number, depth: number, dotX: number, ice: THREE.Color, lime: THREE.Color): { mesh: THREE.Mesh; setIntensity(ice: number, lime: number): void; dispose(): void }`

- [ ] **Step 1: 빛 모듈 작성**

`apps/web/app/login/isu-glow.ts`:

```ts
import * as THREE from "three";
import { BLOCK_GAP, type BlockSpec } from "./isu-layout";

// 블록 뒤쪽 절반을 채우는 빛나는 심. 블록 틈으로 빛이 새고, 블록이 벌어지면 심이 드러나 더 밝게 보인다.
export function createGlowCores(specs: BlockSpec[], color: THREE.Color) {
  const cores = specs.filter((spec) => !spec.dot);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: color.clone(),
    toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, cores.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 0, 1);
  cores.forEach((spec, index) => {
    // 둥근 모서리 블록은 심이 모서리 밖으로 비치지 않게 작게 둔다.
    const cover = spec.corner === "none" ? BLOCK_GAP * 1.6 : -spec.size[1] * 0.2;
    position.set(
      spec.center[0],
      spec.center[1],
      spec.center[2] - spec.size[2] * 0.28,
    );
    rotation.setFromAxisAngle(axis, spec.rotation);
    scale.set(spec.size[0] + cover, spec.size[1] + cover, spec.size[2] * 0.4);
    mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
  });
  mesh.instanceMatrix.needsUpdate = true;
  return {
    mesh,
    setIntensity(value: number) {
      material.color.copy(color).multiplyScalar(value);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// 글자 아래 바닥에 번지는 빛. 가운데는 푸른 흰빛, 초록 큐브 아래는 연두 빛이다.
export function createGroundGlow(
  width: number,
  depth: number,
  dotX: number,
  ice: THREE.Color,
  lime: THREE.Color,
) {
  const uniforms = {
    uIce: { value: 0.35 },
    uLime: { value: 0.4 },
    uDotX: { value: dotX / (width / 2) },
    uIceColor: { value: ice.clone() },
    uLimeColor: { value: lime.clone() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader:
      "varying vec2 vGlowUv; void main(){ vGlowUv = uv * 2. - 1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: `uniform float uIce, uLime, uDotX; uniform vec3 uIceColor, uLimeColor; varying vec2 vGlowUv;
      void main(){
        float ice = exp(-(vGlowUv.x * vGlowUv.x * 2.4 + vGlowUv.y * vGlowUv.y * 7.));
        float dx = vGlowUv.x - uDotX;
        float lime = exp(-(dx * dx * 18. + vGlowUv.y * vGlowUv.y * 10.));
        gl_FragColor = vec4(uIceColor * ice * uIce + uLimeColor * lime * uLime, 1.);
      }`,
  });
  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return {
    mesh,
    setIntensity(iceValue: number, limeValue: number) {
      uniforms.uIce.value = iceValue;
      uniforms.uLime.value = limeValue;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
```

- [ ] **Step 2: 장면에 연결**

`apps/web/app/login/isu-scene.ts`에서:

1. import 수정과 추가:

```ts
import { createGlowCores, createGroundGlow } from "./isu-glow";
import {
  courseFactor,
  createLoginMotion,
  landing,
  LANDING_SPAN,
  shareIntensity,
} from "./login-motion";
```

(기존 `login-motion` import 줄은 위 줄로 교체한다.)

2. `TUNE`의 `pointerOrbit` 줄 위에 추가:

```ts
  glow: { core: 0.9, coreOpen: 2.2, ground: 0.35, groundOpen: 0.4, lime: 5 },
```

3. Task 3B에서 만든 블록 return 객체의 `shareDistance: base.distanceTo(dotCenter),` 다음 줄에 추가:

```ts
      course: spec.course,
      // 등장 때 흩어진 위치에서 날아와 앉는다.
      from: base
        .clone()
        .add(
          new THREE.Vector3(
            (hash(index, 61) - 0.5) * 3,
            0.8 + hash(index, 67) * 1.6,
            1 + hash(index, 71) * 2,
          ),
        ),
      spin: (hash(index, 73) - 0.5) * 1.2,
      delay: 0,
```

4. `blocks.find((block) => block.dot)!.mesh.add(dotCore.mesh);` 다음에 추가:

```ts
  // 아래 단부터, 같은 단은 왼쪽부터 차례로 날아와 앉는다. 마지막 블록이 진행 1에서 끝난다.
  [...blocks]
    .sort((a, b) => a.course - b.course || a.base.x - b.base.x)
    .forEach((block, rank, order) => {
      block.delay = (rank / (order.length - 1)) * (1 - LANDING_SPAN);
    });
  const cores = createGlowCores(layout, TUNE.iceGlow);
  letters.add(cores.mesh);
  const groundGlow = createGroundGlow(
    9,
    4,
    dotSpec.center[0],
    TUNE.iceGlow,
    TUNE.lime,
  );
  groundGlow.mesh.position.set(0, 0.02, 0.4);
  letters.add(groundGlow.mesh);
  const limeLight = new THREE.PointLight(TUNE.lime, 0, 3.5, 2);
  limeLight.position.set(
    dotSpec.center[0],
    dotSpec.center[1],
    dotSpec.center[2] + 0.45,
  );
  letters.add(limeLight);
```

5. 렌더 루프 직전의 `let hover = false;`를 다음으로 바꾼다:

```ts
    let hover = false;
    let opened = 0;
```

6. 렌더 루프 안의

```ts
      const spread =
        Math.max(block.amount, block.idle) +
        (1 - materialize) * 0.13 * heightGate;
      block.mesh.position
        .copy(block.base)
        .addScaledVector(block.outward, spread);
      block.mesh.rotation.set(
        spread * Math.sin(block.id) * 0.5,
        spread * Math.cos(block.id * 0.9) * 0.5,
        block.rotation + spread * Math.sin(block.id * 0.7) * 0.4,
      );
```

를 다음으로 바꾼다:

```ts
      const land = landing(introProgress, block.delay);
      const spread = Math.max(block.amount, block.idle);
      opened = Math.max(opened, spread);
      block.mesh.position
        .copy(block.from)
        .lerp(block.base, land)
        .addScaledVector(block.outward, spread);
      block.mesh.rotation.set(
        spread * Math.sin(block.id) * 0.5 + (1 - land) * block.spin,
        spread * Math.cos(block.id * 0.9) * 0.5,
        block.rotation +
          spread * Math.sin(block.id * 0.7) * 0.4 +
          (1 - land) * block.spin * 0.5,
      );
```

7. Task 3B에서 넣은 `dotCore.setIntensity(...)` 줄 다음에 추가:

```ts
    // 블록이 벌어질수록 심과 바닥 빛이 밝아진다.
    const openness = THREE.MathUtils.smoothstep(opened, 0.02, 0.25);
    cores.setIntensity(TUNE.glow.core + openness * TUNE.glow.coreOpen);
    groundGlow.setIntensity(
      TUNE.glow.ground + openness * TUNE.glow.groundOpen,
      (0.35 + breath * 0.25) * (1 + frame.share),
    );
    limeLight.intensity =
      TUNE.glow.lime * (0.7 + breath * 0.3) * (1 + frame.share);
```

8. `dispose()` 안의 `dotCore.dispose();` 다음 줄에 `cores.dispose();`, `groundGlow.dispose();`를 넣는다.

- [ ] **Step 3: 빠른 검사**

Run: `pnpm exec prettier --write apps/web/app/login` 후 `pnpm format:check` `pnpm lint` `pnpm typecheck` `pnpm architecture` `pnpm test`
Expected: 모두 exit 0.

- [ ] **Step 4: e2e와 리뷰 캡처**

Run: e2e 빌드와 기동, `docker compose -p isu-visual --profile test run --rm test pnpm e2e tests/e2e/login-scene.spec.ts`, 리뷰 캡처.
Expected: 전부 PASS. 캡처에서 블록 틈으로 푸른 흰빛이 새는지, 바닥에 빛이 번지는지, 초록 큐브 주변에 연두 빛이 있는지, 둥근 모서리 뒤로 네모난 빛이 튀어나오지 않는지 보고한다.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/login/isu-glow.ts apps/web/app/login/isu-scene.ts
git commit -m "feat(login): seam glow cores, ground glow and fly-in entrance" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 후처리 체인과 높이 안개

**Files:**
- Create: `apps/web/app/login/isu-post.ts`
- Modify: `apps/web/app/login/isu-scene.ts`

**Interfaces:**
- Produces (`isu-post.ts`):
  - `type PostSettings = { bloom: { strength: number; radius: number; threshold: number }; ao: { radius: number; intensity: number }; grade: { contrast: number; vignette: number; grain: number; aberration: number } }`
  - `createPostChain(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, settings: PostSettings, options: { mobile: boolean }): { setSize(width: number, height: number): void; render(time: number): void; dispose(): void }`
  - `type Haze = { color: { value: THREE.Color }; density: { value: number } }`
  - `applyHaze(shader: Parameters<THREE.MeshStandardMaterial["onBeforeCompile"]>[0], haze: Haze): void`

- [ ] **Step 1: 후처리 모듈 작성**

`apps/web/app/login/isu-post.ts`:

```ts
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
  grade: { contrast: number; vignette: number; grain: number; aberration: number };
};

// 색 보정, 비네트, 필름 그레인, 약한 색수차. 출력 변환 전 선형 색 공간에서 적용한다.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uContrast: { value: 1 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uAberration: { value: 0 },
  },
  vertexShader:
    "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uResolution;
    uniform float uTime, uContrast, uVignette, uGrain, uAberration;
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
      color *= 1. - uVignette * smoothstep(.35, .85, dist);
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
    const ao = new GTAOPass(scene, camera, 1, 1, undefined, {
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

export type Haze = { color: { value: THREE.Color }; density: { value: number } };

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
```

`GTAOPass` 생성자 여섯 번째 인자의 키(`radius`, `distanceExponent`, `thickness`, `scale`, `samples`)가 `node_modules/three/examples/jsm/postprocessing/GTAOPass.js`의 `updateGtaoMaterial`에서 처리되는지 확인하고, 처리되지 않는 키는 빼고 보고한다.

- [ ] **Step 2: 장면에 연결**

`apps/web/app/login/isu-scene.ts`에서:

1. `EffectComposer`, `OutputPass`, `RenderPass`, `UnrealBloomPass` import 네 줄을 지우고 추가:

```ts
import { applyHaze, createPostChain } from "./isu-post";
```

2. `TUNE`의 `bloom: { strength: 0.35, radius: 0.4, threshold: 0.72 },` 줄을 다음으로 바꾼다:

```ts
  post: {
    bloom: { strength: 0.55, radius: 0.45, threshold: 0.62 },
    ao: { radius: 0.35, intensity: 0.85 },
    grade: { contrast: 1.08, vignette: 0.32, grain: 0.035, aberration: 0.0025 },
  },
  haze: { color: new THREE.Color("#22324d"), density: 0.5 },
```

3. `terrainMaterial.onBeforeCompile = (shader) => {` 블록의 마지막 줄(닫는 `};` 바로 위)에 `applyHaze(shader, haze);`를 넣고, 그 `terrainMaterial` 선언 바로 위에 다음을 넣는다:

```ts
  const haze = {
    color: { value: TUNE.haze.color.clone() },
    density: { value: TUNE.haze.density },
  };
```

4. `const renderTarget = new THREE.WebGLRenderTarget(` 부터 `composer.addPass(new OutputPass());`까지를 지우고 다음 한 줄로 바꾼다:

```ts
  const post = createPostChain(renderer, scene, camera, TUNE.post, { mobile });
```

5. `resize`의 `composer.setSize(width, height);`를 `post.setSize(width, height);`로, 렌더 함수의 `composer.render();`를 `post.render(time);`로 바꾼다.

6. `dispose()`의 `composer.passes.forEach((pass) => pass.dispose());`와 `composer.dispose();` 두 줄을 `post.dispose();`로 바꾼다.

- [ ] **Step 3: 빠른 검사**

Run: `pnpm exec prettier --write apps/web/app/login` 후 `pnpm format:check` `pnpm lint` `pnpm typecheck` `pnpm architecture` `pnpm test`
Expected: 모두 exit 0.

- [ ] **Step 4: e2e와 리뷰 캡처**

Run: e2e 빌드와 기동, 전체 `docker compose -p isu-visual --profile test run --rm test pnpm e2e`, 리뷰 캡처.
Expected: 전체 PASS. 캡처에서 블록 틈과 바닥 접촉면이 어두워졌는지, 화면 가장자리가 은은하게 어두운지, 먼 땅이 안개로 흐려지는지, 빛 번짐이 과하지 않은지 보고한다. 슬로건 대비 테스트가 떨어지면 `TUNE.post.bloom.threshold`와 `TUNE.haze.density`만 조정한다.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/login/isu-post.ts apps/web/app/login/isu-scene.ts
git commit -m "feat(login): GTAO, grade pass and height haze" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: HUD 번호와 연결선

**Files:**
- Create: `apps/web/app/login/isu-hud.ts`
- Create: `tests/unit/isu-hud.test.ts`
- Modify: `apps/web/app/login/isu-scene.ts`
- Modify: `apps/web/app/login/LoginScene.tsx`
- Modify: `apps/web/app/login/login.css`
- Modify: `tests/e2e/login-scene.spec.ts`
- Modify: `scripts/capture-login-still.ts`

**Interfaces:**
- Produces:
  - `type HudPoint = { id: number; x: number; y: number; distance: number }`
  - `pickHudPoints(points: HudPoint[], limit?: number, reach?: number): HudPoint[]` (기본 6, 2.6)
  - `hudLabel(id: number): string`
  - `drawHud(context: CanvasRenderingContext2D, points: HudPoint[], alpha: number, scale: number): void`
  - `createIsuScene(canvas, signal, hudCanvas?: HTMLCanvasElement | null)`
  - HUD 캔버스 속성 `data-points`(보이는 점 수, 흐릴 때 "0")
  - 장면 캔버스 클래스 `loginSceneCanvas`, HUD 캔버스 클래스 `loginHud`

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`tests/unit/isu-hud.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hudLabel, pickHudPoints } from "../../apps/web/app/login/isu-hud";

describe("HUD point selection", () => {
  const points = [
    { id: 1, x: 10, y: 10, distance: 2.9 },
    { id: 2, x: 20, y: 20, distance: 0.4 },
    { id: 3, x: 30, y: 30, distance: 1.2 },
    { id: 4, x: 40, y: 40, distance: 0.8 },
  ];

  it("keeps points within reach, nearest first", () => {
    expect(pickHudPoints(points).map((point) => point.id)).toEqual([2, 4, 3]);
  });

  it("limits the number of points", () => {
    expect(pickHudPoints(points, 2)).toHaveLength(2);
  });

  it("labels blocks with stable two digit numbers", () => {
    for (const id of [1, 7, 26]) {
      expect(hudLabel(id)).toMatch(/^\d{2}$/);
      expect(hudLabel(id)).toBe(hudLabel(id));
    }
    expect(hudLabel(1)).not.toBe(hudLabel(2));
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test`
Expected: FAIL, `Cannot find module '../../apps/web/app/login/isu-hud'`.

- [ ] **Step 3: HUD 모듈 작성**

`apps/web/app/login/isu-hud.ts`:

```ts
// 포인터 근처 블록에 번호와 연결선을 그리는 HUD. 장면 위 2D 캔버스에 그린다.
export type HudPoint = { id: number; x: number; y: number; distance: number };

export function pickHudPoints(points: HudPoint[], limit = 6, reach = 2.6) {
  return points
    .filter((point) => point.distance < reach)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

export function hudLabel(id: number) {
  return String(((id * 37) % 90) + 10);
}

export function drawHud(
  context: CanvasRenderingContext2D,
  points: HudPoint[],
  alpha: number,
  scale: number,
) {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (alpha < 0.01 || points.length === 0) return;
  context.save();
  context.scale(scale, scale);
  context.lineWidth = 1;
  context.strokeStyle = `rgba(226, 238, 255, ${0.55 * alpha})`;
  context.fillStyle = `rgba(236, 244, 255, ${0.9 * alpha})`;
  context.font = "11px ui-monospace, SFMono-Regular, Consolas, monospace";
  context.beginPath();
  points.forEach((point, index) =>
    index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
  );
  context.stroke();
  for (const point of points) {
    context.beginPath();
    context.moveTo(point.x - 4, point.y);
    context.lineTo(point.x + 4, point.y);
    context.moveTo(point.x, point.y - 4);
    context.lineTo(point.x, point.y + 4);
    context.stroke();
    context.fillText(hudLabel(point.id), point.x - 18, point.y - 6);
  }
  context.restore();
}
```

- [ ] **Step 4: 장면에 HUD 연결**

`apps/web/app/login/isu-scene.ts`에서:

1. import 추가:

```ts
import { drawHud, pickHudPoints, type HudPoint } from "./isu-hud";
```

2. 함수 시그니처를 바꾼다:

```ts
export async function createIsuScene(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  hudCanvas: HTMLCanvasElement | null = null,
) {
```

3. `let frames = 0;` 다음에 추가:

```ts
  const hudContext = hudCanvas?.getContext("2d") ?? null;
  const hudScale = Math.min(window.devicePixelRatio, 2);
  const projected = new THREE.Vector3();
  let hudAlpha = 0;
```

4. `resize` 안의 `landscape.resize(canvas.width, canvas.height);` 다음에 추가:

```ts
    if (hudCanvas) {
      hudCanvas.width = Math.round(width * hudScale);
      hudCanvas.height = Math.round(height * hudScale);
    }
```

5. Task 4에서 넣은 `limeLight.intensity = ...;` 문장 다음에 추가:

```ts
    if (hudContext && hudCanvas) {
      hudAlpha = THREE.MathUtils.lerp(
        hudAlpha,
        pointer.x !== 2 && introFinished ? 1 : 0,
        1 - Math.exp(-delta * 4),
      );
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const candidates: HudPoint[] = blocks
        .filter((block) => !block.dot)
        .map((block) => {
          projected.copy(block.mesh.position);
          letters.localToWorld(projected);
          projected.project(camera);
          return {
            id: block.id,
            x: (projected.x * 0.5 + 0.5) * width,
            y: (-projected.y * 0.5 + 0.5) * height,
            distance: block.base.distanceTo(dampedCursor),
          };
        });
      const shown = pickHudPoints(candidates);
      drawHud(hudContext, shown, hudAlpha, hudScale);
      hudCanvas.dataset.points = String(hudAlpha > 0.5 ? shown.length : 0);
    }
```

6. `dispose()`의 첫 줄로 추가:

```ts
      hudContext?.clearRect(0, 0, hudCanvas!.width, hudCanvas!.height);
```

- [ ] **Step 5: LoginScene과 CSS**

`apps/web/app/login/LoginScene.tsx`에서:

1. `const canvasRef = useRef<HTMLCanvasElement>(null);` 다음 줄에 `const hudRef = useRef<HTMLCanvasElement>(null);`를 넣는다.
2. `.then((module) => module.createIsuScene(canvas, initialization.signal))`를 `.then((module) => module.createIsuScene(canvas, initialization.signal, hudRef.current))`로 바꾼다.
3. 반환 JSX를 다음으로 바꾼다:

```tsx
  return (
    <div className="loginScene" aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="loginSceneCanvas"
        data-ready="loading"
        data-preview="false"
      />
      <canvas ref={hudRef} className="loginHud" />
    </div>
  );
```

`apps/web/app/login/login.css`에서:

1. `.loginScene canvas {`를 `.loginSceneCanvas {`로, `.loginScene canvas[data-preview="true"] {`를 `.loginSceneCanvas[data-preview="true"] {`로 바꾼다.
2. 그 다음에 추가:

```css

.loginHud {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
```

- [ ] **Step 6: e2e와 캡처 스크립트의 캔버스 선택자**

`tests/e2e/login-scene.spec.ts`의 `const canvas = (page: Page) => page.locator(".loginScene canvas");`를 다음으로 바꾼다:

```ts
const canvas = (page: Page) => page.locator(".loginScene .loginSceneCanvas");
const hud = (page: Page) => page.locator(".loginScene .loginHud");
```

같은 파일 끝에 추가:

```ts

test("reduced motion never draws the HUD", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(canvas(page)).toHaveAttribute("data-ready", "static");
  expect(await hud(page).getAttribute("data-points")).toBeNull();
});

test("the HUD labels blocks near the pointer", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto("/login");
  test.skip(
    !(await hasWebGL2(page)),
    "이 브라우저에서 WebGL2를 쓸 수 없습니다",
  );
  await expect(canvas(page)).toHaveAttribute("data-intro", "complete", {
    timeout: 90_000,
  });
  // 데스크톱 배치에서 글자는 화면 왼쪽 약 30%, 세로 약 44%에 있다.
  await page.mouse.move(960 * 0.3, 540 * 0.44);
  await expect
    .poll(async () => Number(await hud(page).getAttribute("data-points")), {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(3);
});
```

`scripts/capture-login-still.ts`의 `".loginScene canvas"` 세 곳을 모두 `".loginScene .loginSceneCanvas"`로 바꾼다.

- [ ] **Step 7: 검사**

Run: `pnpm exec prettier --write apps/web/app/login tests scripts/capture-login-still.ts` 후 `pnpm format:check` `pnpm lint` `pnpm typecheck` `pnpm architecture` `pnpm test`, e2e 빌드와 기동 후 전체 `docker compose -p isu-visual --profile test run --rm test pnpm e2e`
Expected: 모두 통과. HUD 테스트가 3 미만이면 `page.mouse.move` 좌표를 리뷰 캡처에서 글자가 있는 위치로 맞추고, 그 좌표를 보고한다.

- [ ] **Step 8: 커밋**

```bash
git add apps/web/app/login/isu-hud.ts tests/unit/isu-hud.test.ts apps/web/app/login/isu-scene.ts apps/web/app/login/LoginScene.tsx apps/web/app/login/login.css tests/e2e/login-scene.spec.ts scripts/capture-login-still.ts
git commit -m "feat(login): HUD numbers and links near the pointer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: igloo.inc 대비 채점과 조정, 정지 이미지, 기록

이 Task는 메인 세션이 이끈다. 구현 subagent는 메인 세션이 지시한 단계(캡처 스크립트 수정, 조정, 정지 이미지, 기록)만 수행한다.

**Files:**
- Modify: `scripts/capture-login-still.ts`
- Modify: `apps/web/app/login/isu-scene.ts` (조정 라운드에서 `TUNE`과 셰이더 수치)
- Modify: `apps/web/public/images/login/login-still-desktop.webp`, `login-still-mobile.webp`
- Modify: `docs/PROGRESS.md`
- 산출(커밋하지 않음): `output/score/*.png`, `output/playwright-test/login/*.png`

- [ ] **Step 1: 캡처 스크립트에 포인터 캡처 추가 (subagent)**

`scripts/capture-login-still.ts`의 리뷰 캡처 반복문에서 `await page.screenshot({ path: join(reviewDir, \`login-${width}x${height}.png\`) ... });` 문장 다음에 추가:

```ts
        // 포인터를 글자 위에 올린 상태도 남긴다. 좁은 화면은 글자가 위쪽 가운데에 있다.
        const [px, py] = width < 768 ? [0.5, 0.22] : [0.3, 0.44];
        await page.mouse.move(width * px, height * py);
        await page.waitForTimeout(3_000);
        await page.screenshot({
          path: join(reviewDir, `login-${width}x${height}-hover.png`),
          timeout: 180_000,
        });
```

prettier, lint, typecheck 후 커밋: `git add scripts/capture-login-still.ts` / `git commit -m "chore(login): capture pointer-over review shots" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

- [ ] **Step 2: 기준 캡처 (메인 세션)**

`output/capture-reference.ts`(Git 제외 폴더)를 만든다:

```ts
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

// 채점용 igloo.inc 기준 캡처. output/에만 저장하고 저장소에 넣지 않는다.
await mkdir("output/score", { recursive: true });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("https://www.igloo.inc/", { waitUntil: "load", timeout: 180_000 });
  await page.waitForTimeout(25_000);
  await page.screenshot({ path: "output/score/igloo-1440x900.png", timeout: 180_000 });
  await page.mouse.move(720, 400);
  await page.waitForTimeout(6_000);
  await page.screenshot({ path: "output/score/igloo-1440x900-hover.png", timeout: 180_000 });
} finally {
  await browser.close();
}
```

Run: `docker compose -p isu-visual --profile test run --rm test pnpm exec tsx output/capture-reference.ts` 그리고 리뷰 캡처 명령.
컨테이너에서 igloo.inc에 접속하지 못하면 메인 세션이 브라우저 패널(1440x900)로 igloo.inc를 열어 직접 보고, 독립 리뷰어에게는 우리 캡처와 함께 메인 세션의 igloo.inc 관찰 기록을 파일로 넘긴다.

- [ ] **Step 3: 채점 (메인 세션 + opus 리뷰어)**

독립 리뷰어(model: opus)에게 넘길 내용: `output/score/igloo-1440x900.png`, `igloo-1440x900-hover.png`, `output/playwright-test/login/login-1440x900.png`, `login-1440x900-hover.png`, `login-390x844.png` 경로와 다음 기준.

| 항목 | 만점 100 기준 |
| --- | --- |
| 블록 형태 | 손으로 쌓은 듯 불규칙하고, 조각된 면과 깨진 모서리가 설득력 있다 |
| 재질 디테일 | 표면 결이 여러 크기로 살아 있고 반복 무늬가 보이지 않는다 |
| 빛과 틈새 발광 | 틈으로 새는 빛, 벌어질 때 밝아지는 안쪽, 바닥 번짐이 igloo.inc만큼 강렬하다 |
| 분위기 | 안개와 먼 산의 깊이, 색 조화 |
| 후처리와 색감 | 그레인, 비네트, 빛 번짐, 톤이 영화적이다 |
| 움직임과 반응 | 포인터 반응과 벌어짐이 생동감 있다(캡처 두 장의 차이로 판단) |
| HUD와 타이포 | 번호와 연결선, 글꼴이 세련되게 장면에 붙는다 |

리뷰어는 항목별 점수, 근거, 점수를 가장 많이 올릴 구체적 수정 3개(수치나 기법 수준)를 `.superpowers/sdd/score-round-N.md`에 쓴다. 메인 세션도 같은 기준으로 채점하고 두 평균을 낸다. 7항목 평균이 80 이상이면 Step 5로 간다.

- [ ] **Step 4: 조정 라운드 (최대 3회)**

평균 80 미만이면 메인 세션이 리뷰어의 수정안을 골라 구현 subagent(sonnet)에게 보낸다. 조정 범위는 `TUNE`, 셰이더 수치, 후처리 설정, 조명 위치다. 구조 변경이 필요하면 메인 세션이 먼저 사용자에게 알린다. 매 라운드는 빠른 검사, 전체 e2e, 리뷰 캡처, 재채점 순서다. 3회 후에도 80 미만이면 멈추고 설계 문서 8절(블렌더 전환) 계획을 따로 세운다.

- [ ] **Step 5: 실제 GPU 성능 (메인 세션)**

로컬 스택을 최신 코드로 다시 빌드하고 띄운 뒤(README 절차), 브라우저 패널을 1440x900으로 맞추고 `http://host.docker.internal:3000/login`에서 등장이 끝난 뒤 캔버스 `data-frames`를 5초 간격으로 두 번 읽어 fps를 계산한다. 50fps 미만이면 `TUNE.post.ao.intensity`를 0으로(또는 GTAO 제거), 블록 분할 수를 줄이는 순서로 조정하고 다시 채점한다.

- [ ] **Step 6: 정지 이미지 재캡처 (subagent)**

Run: `docker compose -p isu-visual --profile test run --rm -v "${PWD}/apps/web/public/images/login:/out" -e CAPTURE_OUT=/out test pnpm exec tsx scripts/capture-login-still.ts`
Expected: 두 WebP 크기가 출력된다. 열어서 패널과 슬로건 없이 새 장면만 담겼는지 확인한다.

- [ ] **Step 7: 최종 검증과 기록 (subagent)**

```bash
docker compose --profile local build tools
docker compose --profile local run --rm tools pnpm check
docker compose --profile local run --rm tools pnpm test
docker compose -p isu-visual --profile test build
docker compose -p isu-visual --profile test up -d --force-recreate test-db test-oidc test-setup-e2e test-web test-worker
docker compose -p isu-visual --profile test run --rm test pnpm test:integration
docker compose -p isu-visual --profile test run --rm test pnpm e2e
docker compose --profile local run --rm tools pnpm build
```

Expected: 모두 exit 0. `docs/PROGRESS.md`의 `## 구현 중 확인해 해결한 문제` 바로 위에 `## ISU 로그인 그래픽 고도화 (2026-09-25)` 절을 추가한다. 내용: 라운드별 점수(메인, 리뷰어, 평균), 최종 점수, 실제 GPU fps, 각 명령의 마지막 결과, 캡처 경로, 블렌더 전환 여부. 다른 세션의 PROGRESS 수정이 작업 트리에 있으면 이전 계획처럼 자기 절만 index에 올려 커밋한다.

```bash
git add apps/web/public/images/login/login-still-desktop.webp apps/web/public/images/login/login-still-mobile.webp
git commit -m "chore(login): recapture scene stills" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Docker 정리 (메인 세션)**

```bash
docker compose -p isu-visual --profile test ps -a
docker compose -p isu-visual --profile test down --volumes --remove-orphans
```

`isu-visual` 프로젝트 전용 자원인지 확인한 뒤 실행한다. 기본 `ax-starter` 프로젝트는 건드리지 않는다.
