# ISU 로그인 연속 하루와 수면 질감 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 배경의 고정 장면 6개를 해 위치로 계산하는 2분 연속 하루로 바꾸고, 대기 산란 하늘, 잔물결 법선과 반사율을 쓰는 수면, 작은 파동 계산 호버 물결로 교체한다.

**Architecture:** 순수 함수 두 개(`isu-day-cycle.ts`는 시각에서 해 방향, `isu-atmosphere.ts`는 해 방향에서 하늘과 햇빛 색)가 모든 색의 근원이다. GPU 쪽은 하늘 LUT와 돔(`isu-sky.ts`), 파동 계산(`isu-ripples.ts`), 수면 셰이더(`isu-water.ts`)로 나누고 `isu-water-scene.ts`가 매 프레임 순서대로 갱신한 뒤 EffectComposer(빛 번짐, 출력 변환, 디더링)로 그린다. 잔물결 법선 지도는 Blender Ocean 모디파이어 스크립트로 굽는다.

**Tech Stack:** three 0.183.2(Reflector, EffectComposer, UnrealBloomPass, OutputPass, ShaderPass, FullScreenQuad), Next 16, Vitest 5, Playwright 1.63(Docker SwiftShader), Blender 5.2.1 Python, numpy(Blender 내장).

**Spec:** [docs/superpowers/specs/2026-09-27-login-daylight-water-design.md](../specs/2026-09-27-login-daylight-water-design.md)

## Global Constraints

- 사용자에게 보이는 문구, 문서, 주석에 U+00B7, U+2013, U+2014 문자를 쓰지 않는다.
- 새 npm 의존성을 추가하지 않는다. three 0.183.2의 addon만 쓴다. 외부 CDN, 외부 AI, 텔레메트리를 연결하지 않는다.
- 다른 작업 소유 파일 다섯 개(`apps/web/app/login/login-motion.ts`, `apps/web/next-env.d.ts`, `tests/unit/grid-clipboard.test.ts`, `tests/unit/grid-fill.test.ts`, `.claude/launch.json`)를 stage, 수정, 삭제하지 않는다. Task 1에서 백업과 SHA-256을 남기고 마지막에 대조한다.
- 커밋과 푸시는 사용자가 요청할 때만 한다. 이 계획의 작업은 커밋 단계 없이 검사로 끝난다.
- 블록 기준색 `#008FD4`, `#99CA3C`, 슬로건, 로그인 카드, 인증 코드, `LoginScene.tsx`를 바꾸지 않는다. 톤 매핑은 ACES를 유지한다.
- 하루 주기 120초, 첫 시각만 무작위, 완전한 밤 15초 ±1초, 새벽과 노을 구간(고도 +10도에서 -8도) 각각 11.5초 ±1초, 입력 중(calm) 해 진행 정지.
- 카메라는 서쪽(-z)을 본다. +z 동쪽, +x 북쪽, +y 위. 해는 +z 쪽에서 떠서 -z 쪽으로 진다.
- 호버 물결의 반사 좌표 흔들림은 0.004 이하다. 블록, 로그인 카드, 링크, 버튼, 입력 위에서는 물결을 넣지 않는다.
- 일회성 Docker 검사는 프로젝트 이름 `ax-daylight-water-20260927`만 쓰고 끝나면 AGENTS.md 8번 규칙으로 정리한다. `ax-water-demo-20260926`의 DB와 파일 volume을 보존한다. 전역 `docker system prune`을 실행하지 않는다.
- `docs/PROGRESS.md`에는 실제로 실행한 명령과 결과만 적는다.
- `tee`로 로그를 남기는 명령은 같은 셸에서 먼저 `set -o pipefail`을 실행해 앞 명령의 종료 코드를 보존한다.

## 설계와 다른 점 (사용자에게 알린다)

- 하늘은 처음부터 256x128 LUT로 계산한다. 설계는 "픽셀마다 계산 후 50fps 미만이면 캐시"였다. e2e와 캡처가 Docker SwiftShader에서 초당 1프레임 안팎으로 돌아 픽셀마다 계산하면 검사가 불안정해지고, 수면의 수평선 안개가 하늘과 같은 색을 읽어야 이음새가 사라지기 때문이다.
- 법선 지도는 `texturesReady`가 아니라 렌더러를 만들기 전에 블록 모델과 함께 불러온다. 실패하면 장면 생성이 실패해 기존과 같은 정지 이미지 대체(`data-ready="false"`)로 간다. 비동기 상태를 하나 줄이는 선택이다.
- 정지 대체 이미지는 해 고도 -3도의 황혼(시각 107.74초)으로 찍는다. -6도보다 ISU가 잘 보이고 위쪽 하늘은 충분히 어둡다.
- 수면 반사율은 Schlick 식의 5제곱 대신 3제곱을 쓴다(F0 0.02는 같다). 물리값은 ISU 반사 구간(시선 약 75도)에서 약 0.24라 참고 사진 1의 거울 느낌이 약하다. Task 9 캡처에서 조정한다.
- `data-ripple-energy`는 GPU 파동 텍스처를 읽지 않고, 넣은 눌림 세기를 벽시계 시간(0.35초 시상수)으로 줄인 값이다. GPU 값을 매 프레임 읽으면 렌더링이 멈추기 때문이다.

## Review Focus

1. 법선 지도(`water-normal.webp`) 요청이 실패하면 WebGL 장면 대신 정지 이미지와 입력 가능한 로그인 폼이 보여야 한다. Task 8의 `a missing water normal map falls back to the still image`가 고정한다.
2. 아이디 입력에 포커스가 있는 동안 해가 멈춰야 한다. 입력 중 배경이 크게 바뀌면 산만하다. Task 8의 calm 검사에 `data-day-time` 정지 확인을 더한다.
3. 휴대폰에서 수면을 짧게 탭해도 물결이 생겨야 한다. Task 8의 `tapping the water starts a small ripple`이 고정한다.
4. 로그인 카드 위에서 마우스를 움직이면 뒤의 수면이 흔들리지 않아야 한다. Task 8의 `pointer over the login card leaves the water still`이 고정한다.
5. 세로 모바일 화면에서는 일몰 해가 화면 밖에 있을 수 있다. Task 9의 `mobile-sunset` 캡처에서 빛길이나 노을이 화면 안에 보이는지 확인하고, 해가 안 보이면 사용자에게 그대로 보고한다(자동 수정하지 않는다).

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `apps/web/app/login/isu-day-cycle.ts` (신규) | 시각에서 해 방향, 고도, 방위, 시간대 이름. 순수 함수 |
| `apps/web/app/login/isu-atmosphere.ts` (신규) | 대기 상수, CPU용 `skyRadiance`/`sunTransmittance`, 같은 식의 `ATMOSPHERE_GLSL` |
| `apps/web/app/login/isu-sky.ts` (신규) | 하늘 LUT 렌더 타깃, 하늘 돔(해 원판, 별), `SKY_LUT_GLSL` |
| `apps/web/app/login/isu-ripples.ts` (신규) | 256x256 파동 방정식, 포인터 눌림, 에너지 값 |
| `apps/web/app/login/isu-water.ts` (교체) | Reflector 수면 셰이더 |
| `apps/web/app/login/isu-water-scene.ts` (수정) | 조명, 노출, 포인터, 합성 순서, 캔버스 속성 |
| `apps/web/app/login/isu-water-moods.ts` (삭제) | 고정 장면. Task 7에서 삭제 |
| `tools/blender/bake_water_normals.py` (신규) | Ocean 모디파이어로 법선 지도 굽기 |
| `apps/web/public/images/login/water-normal.webp`, `mobile/water-normal.webp` (신규) | 1024px, 512px 법선 지도 |
| `tests/unit/isu-day-cycle.test.ts`, `tests/unit/isu-atmosphere.test.ts` (신규) | 단위 검사 |
| `tests/unit/isu-water-moods.test.ts` (삭제) | Task 7에서 삭제 |
| `tests/e2e/login-water.spec.ts`, `tests/e2e/login-scene.spec.ts` (수정) | 시간대 seed, 호버 복귀, Review Focus 검사 |
| `output/daylight-water-20260927/` (Git 제외) | 캡처 스크립트, compose override, 로그, 보존 파일 백업 |

---

### Task 1: 하루 주기 모듈

**Files:**
- Create: `apps/web/app/login/isu-day-cycle.ts`
- Test: `tests/unit/isu-day-cycle.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `DAY_SECONDS: 120`
  - `type SunState = { x: number; y: number; z: number; elevation: number; azimuth: number; hourAngle: number }` (단위 벡터, 고도와 방위는 도, 방위는 북 0 동 90, 시간각은 라디안이며 정오 0, 오전 음수)
  - `type Daypart = "night" | "dawn" | "sunrise" | "morning" | "noon" | "afternoon" | "sunset" | "dusk"`
  - `hourAngleAt(time: number): number`, `sunAt(time: number): SunState`, `daypart(sun: SunState): Daypart`
  - `advanceDay(time: number, seconds: number): number`, `randomDayTime(random?: () => number): number`

- [ ] **Step 1: 브랜치와 보존 파일 백업**

```bash
git switch -c login-daylight-water
mkdir -p output/daylight-water-20260927/preserved
cp --parents apps/web/app/login/login-motion.ts apps/web/next-env.d.ts tests/unit/grid-clipboard.test.ts tests/unit/grid-fill.test.ts .claude/launch.json output/daylight-water-20260927/preserved/
sha256sum apps/web/app/login/login-motion.ts apps/web/next-env.d.ts tests/unit/grid-clipboard.test.ts tests/unit/grid-fill.test.ts .claude/launch.json > output/daylight-water-20260927/preserved-files.sha256
git status --short
```

Expected: 새 브랜치로 전환되고 `git status`에 기존 다섯 파일과 설계 문서, 이 계획서만 보인다.

- [ ] **Step 2: 실패하는 검사 작성**

`tests/unit/isu-day-cycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  advanceDay,
  DAY_SECONDS,
  daypart,
  hourAngleAt,
  randomDayTime,
  sunAt,
  type SunState,
} from "../../apps/web/app/login/isu-day-cycle";

const STEP = 0.01;
function secondsWhere(predicate: (time: number) => boolean) {
  let total = 0;
  for (let time = 0; time < DAY_SECONDS; time += STEP)
    if (predicate(time)) total += STEP;
  return total;
}
function firstTime(from: number, to: number, predicate: (time: number) => boolean) {
  for (let time = from; time < to; time += STEP) if (predicate(time)) return time;
  throw new Error("조건을 만족하는 시각이 없습니다");
}
const angle = (a: SunState, b: SunState) =>
  (Math.acos(Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)) * 180) / Math.PI;

describe("login day cycle", () => {
  it("runs one day every 120 seconds and randomizes only the start", () => {
    expect(DAY_SECONDS).toBe(120);
    expect(advanceDay(119, 2)).toBeCloseTo(1);
    expect(advanceDay(10, -5)).toBe(10);
    expect(randomDayTime(() => 0)).toBe(0);
    expect(randomDayTime(() => 0.5)).toBe(60);
    expect(hourAngleAt(0)).toBeCloseTo(-Math.PI);
    expect(hourAngleAt(60)).toBeCloseTo(0);
  });

  it("rises behind the camera in the east and sets ahead in the west", () => {
    const rise = sunAt(firstTime(0, 60, (time) => sunAt(time).elevation >= 0));
    const set = sunAt(firstTime(60, 120, (time) => sunAt(time).elevation < 0));
    const noon = sunAt(60);
    expect(rise.z).toBeGreaterThan(0.9);
    expect(set.z).toBeLessThan(-0.9);
    expect(set.x).toBeGreaterThan(0.3);
    expect(noon.elevation).toBeCloseTo(60, 0);
    expect(noon.x).toBeLessThan(-0.45);
  });

  it("moves without jumps, including across midnight", () => {
    for (let time = 0; time < DAY_SECONDS; time += 0.1)
      expect(angle(sunAt(time), sunAt(time + 0.1))).toBeLessThan(1);
    expect(angle(sunAt(119.95), sunAt(0.05))).toBeLessThan(1);
  });

  it("keeps the night short and gives dawn and sunset time to glow", () => {
    const night = secondsWhere((time) => sunAt(time).elevation < -12);
    const band = (time: number) =>
      sunAt(time).elevation < 10 && sunAt(time).elevation > -8;
    const dawn = secondsWhere((time) => time < 60 && band(time));
    const sunset = secondsWhere((time) => time >= 60 && band(time));
    expect(Math.abs(night - 15)).toBeLessThanOrEqual(1);
    expect(Math.abs(dawn - 11.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(sunset - 11.5)).toBeLessThanOrEqual(1);
  });

  it("names the time of day for tests and captures", () => {
    expect(daypart(sunAt(0))).toBe("night");
    expect(daypart(sunAt(11.59))).toBe("dawn");
    expect(daypart(sunAt(15.57))).toBe("sunrise");
    expect(daypart(sunAt(29.9))).toBe("morning");
    expect(daypart(sunAt(60))).toBe("noon");
    expect(daypart(sunAt(103.79))).toBe("sunset");
    expect(daypart(sunAt(107.74))).toBe("dusk");
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm exec vitest run tests/unit/isu-day-cycle.test.ts`
Expected: FAIL, `isu-day-cycle` 모듈을 찾을 수 없음.

- [ ] **Step 4: 구현**

`apps/web/app/login/isu-day-cycle.ts`:

```ts
// 로그인 배경의 하루 2분 주기. 카메라는 서쪽(-z)을 본다. +z는 동쪽(카메라 뒤), +x는 북쪽(오른쪽), +y는 위다.
// 해는 오른쪽 뒤(북동)에서 떠서 왼쪽 위(남쪽)를 지나 정면 약간 오른쪽(북서)으로 진다.
export const DAY_SECONDS = 120;

// 위도 45도, 적위 +15도에 해당하는 궤적. 적위를 바꾸면 일몰 위치가 좌우로 움직인다.
const LATITUDE = (45 * Math.PI) / 180;
const DECLINATION = (15 * Math.PI) / 180;
// 해 고도 -6도 아래에서 최대 1 + NIGHT_SPEEDUP 배로 빨라져 완전한 밤(-12도 미만)이 약 15초가 된다.
const NIGHT_SPEEDUP = 2.2;
const TABLE_SIZE = 2048;
const DEGREES = 180 / Math.PI;

export type SunState = {
  x: number;
  y: number;
  z: number;
  elevation: number;
  azimuth: number;
  hourAngle: number;
};

export type Daypart =
  | "night"
  | "dawn"
  | "sunrise"
  | "morning"
  | "noon"
  | "afternoon"
  | "sunset"
  | "dusk";

function directionAt(hourAngle: number) {
  const cosHour = Math.cos(hourAngle);
  return {
    x:
      Math.sin(DECLINATION) * Math.cos(LATITUDE) -
      Math.cos(DECLINATION) * Math.sin(LATITUDE) * cosHour,
    y:
      Math.sin(LATITUDE) * Math.sin(DECLINATION) +
      Math.cos(LATITUDE) * Math.cos(DECLINATION) * cosHour,
    z: -Math.cos(DECLINATION) * Math.sin(hourAngle),
  };
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

const elevationAt = (hourAngle: number) =>
  Math.asin(directionAt(hourAngle).y) * DEGREES;

// 시각 0은 자정(시간각 -π), 60초는 정오다. 시간각 속도 곡선을 적분한 표로 시각을 시간각으로 바꾼다.
const table = (() => {
  const hours = new Float64Array(TABLE_SIZE + 1);
  const times = new Float64Array(TABLE_SIZE + 1);
  const speed = (hourAngle: number) =>
    1 + NIGHT_SPEEDUP * smoothstep(-6, -14, elevationAt(hourAngle));
  for (let index = 0; index <= TABLE_SIZE; index++) {
    hours[index] = -Math.PI + (2 * Math.PI * index) / TABLE_SIZE;
    if (index > 0)
      times[index] =
        times[index - 1] +
        ((hours[index] - hours[index - 1]) * 2) /
          (speed(hours[index]) + speed(hours[index - 1]));
  }
  const scale = DAY_SECONDS / times[TABLE_SIZE];
  for (let index = 0; index <= TABLE_SIZE; index++) times[index] *= scale;
  return { hours, times };
})();

function wrap(time: number) {
  return ((time % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
}

export function hourAngleAt(time: number) {
  const target = wrap(time);
  let low = 0;
  let high = TABLE_SIZE;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (table.times[middle] <= target) low = middle;
    else high = middle;
  }
  const span = table.times[high] - table.times[low];
  return (
    table.hours[low] +
    ((table.hours[high] - table.hours[low]) * (target - table.times[low])) /
      span
  );
}

export function sunAt(time: number): SunState {
  const hourAngle = hourAngleAt(time);
  const direction = directionAt(hourAngle);
  return {
    ...direction,
    elevation: Math.asin(direction.y) * DEGREES,
    azimuth: (Math.atan2(direction.z, direction.x) * DEGREES + 360) % 360,
    hourAngle,
  };
}

// 검사와 캡처 식별용 이름. 렌더링은 이 이름으로 분기하지 않는다.
export function daypart(sun: SunState): Daypart {
  const morning = sun.hourAngle < 0;
  if (sun.elevation < -12) return "night";
  if (sun.elevation < -0.8) return morning ? "dawn" : "dusk";
  if (sun.elevation < 8) return morning ? "sunrise" : "sunset";
  if (sun.elevation < 40) return morning ? "morning" : "afternoon";
  return "noon";
}

export function advanceDay(time: number, seconds: number) {
  return wrap(time + Math.max(0, seconds));
}

export function randomDayTime(random = Math.random) {
  return wrap(random() * DAY_SECONDS);
}
```

- [ ] **Step 5: 통과 확인과 형식 검사**

Run: `pnpm exec vitest run tests/unit/isu-day-cycle.test.ts`
Expected: PASS, 5개 검사. 사전 계산 기준 밤 14.97초, 새벽과 노을 11.71초, 0.1초 최대 이동 0.713도.

Run: `pnpm exec prettier --write apps/web/app/login/isu-day-cycle.ts tests/unit/isu-day-cycle.test.ts && pnpm typecheck && pnpm lint`
Expected: exit 0.

---

### Task 2: 대기 산란 모듈

**Files:**
- Create: `apps/web/app/login/isu-atmosphere.ts`
- Test: `tests/unit/isu-atmosphere.test.ts`

**Interfaces:**
- Consumes: 없음(방향은 `{ x, y, z }` 구조로 받아 Task 1의 `SunState`를 그대로 넘길 수 있다)
- Produces:
  - `type Rgb = [number, number, number]`
  - `SUN_INTENSITY = 20`, `NIGHT_SKY: Rgb`
  - `skyRadiance(direction: { x: number; y: number; z: number }, sun: { x: number; y: number; z: number }, steps?: number): Rgb` (방향은 내부에서 정규화, 밤하늘 바닥값 포함)
  - `sunTransmittance(sun: { x: number; y: number; z: number }): Rgb` (해가 지평선 아래면 `[0, 0, 0]`)
  - `luminance(color: Rgb): number`
  - `ATMOSPHERE_GLSL: string` (GLSL 함수 `vec3 atmosphereRadiance(vec3 direction, vec3 sun)`, `vec3 atmosphereTransmittance(vec3 point, vec3 direction)`)

- [ ] **Step 1: 실패하는 검사 작성**

`tests/unit/isu-atmosphere.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ATMOSPHERE_GLSL,
  luminance,
  skyRadiance,
  sunTransmittance,
} from "../../apps/web/app/login/isu-atmosphere";

const sunAtElevation = (degrees: number) => {
  const radians = (degrees * Math.PI) / 180;
  return { x: 0, y: Math.sin(radians), z: -Math.cos(radians) };
};
const up = { x: 0, y: 1, z: 0 };

describe("login atmosphere", () => {
  it("paints a blue zenith at midday", () => {
    const [red, green, blue] = skyRadiance(up, sunAtElevation(60));
    expect(blue).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(red);
  });

  it("reddens low sunlight and the sky toward the setting sun", () => {
    const [red, green, blue] = sunTransmittance(sunAtElevation(3));
    expect(red).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(blue);
    expect(red / blue).toBeGreaterThan(3);
    const [skyRed, skyGreen, skyBlue] = skyRadiance(
      { x: 0, y: 0.02, z: -1 },
      sunAtElevation(3),
    );
    expect(skyRed).toBeGreaterThan(skyGreen);
    expect(skyGreen).toBeGreaterThan(skyBlue);
  });

  it("blocks direct sunlight below the horizon and fades to the night floor", () => {
    expect(sunTransmittance(sunAtElevation(-2))).toEqual([0, 0, 0]);
    const noon = luminance(skyRadiance(up, sunAtElevation(60)));
    const night = skyRadiance(up, sunAtElevation(-20));
    expect(luminance(night)).toBeLessThan(noon * 0.02);
    expect(night[2]).toBeGreaterThan(night[0]);
  });

  it("shares its constants with the sky shader", () => {
    expect(ATMOSPHERE_GLSL).toContain("vec3 atmosphereRadiance(");
    expect(ATMOSPHERE_GLSL).toContain("0.005802");
    expect(ATMOSPHERE_GLSL).not.toContain("NaN");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/unit/isu-atmosphere.test.ts`
Expected: FAIL, 모듈 없음.

- [ ] **Step 3: 구현**

`apps/web/app/login/isu-atmosphere.ts`:

```ts
// 단일 산란 대기(레일리, 미, 오존 흡수, 행성 그림자). 거리 단위는 km다.
// CPU 조명 계산(skyRadiance, sunTransmittance)과 하늘 LUT 셰이더(ATMOSPHERE_GLSL)가 같은 상수와 식을 쓴다.
// 한쪽 식을 바꾸면 다른 쪽도 같이 바꾼다.
export type Rgb = [number, number, number];
type Direction = { x: number; y: number; z: number };
type Point = [number, number, number];

const PLANET_RADIUS = 6360;
const ATMOSPHERE_RADIUS = 6420;
const VIEW_HEIGHT = 0.2;
const RAYLEIGH: Rgb = [5.802e-3, 13.558e-3, 33.1e-3];
const RAYLEIGH_HEIGHT = 8;
const MIE_SCATTERING = 3.996e-3;
const MIE_EXTINCTION = 4.4e-3;
const MIE_HEIGHT = 1.2;
const MIE_G = 0.8;
const OZONE: Rgb = [0.65e-3, 1.881e-3, 0.085e-3];
export const SUN_INTENSITY = 20;
// 단일 산란만으로는 해가 진 뒤 하늘이 너무 빨리 검어진다. 짙은 청색 밤하늘 바닥값을 더한다.
export const NIGHT_SKY: Rgb = [0.0007, 0.0021, 0.0056];

const VIEWER: Point = [0, PLANET_RADIUS + VIEW_HEIGHT, 0];

function unit(direction: Direction): Point {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return [direction.x / length, direction.y / length, direction.z / length];
}

function raySphere(origin: Point, direction: Point, radius: number) {
  const b =
    origin[0] * direction[0] + origin[1] * direction[1] + origin[2] * direction[2];
  const c = origin[0] ** 2 + origin[1] ** 2 + origin[2] ** 2 - radius * radius;
  const h = b * b - c;
  if (h < 0) return null;
  const root = Math.sqrt(h);
  return [-b - root, -b + root] as const;
}

const along = (origin: Point, direction: Point, distance: number): Point => [
  origin[0] + direction[0] * distance,
  origin[1] + direction[1] * distance,
  origin[2] + direction[2] * distance,
];
const heightOf = (point: Point) => Math.hypot(...point) - PLANET_RADIUS;

function extinction(height: number): Rgb {
  const rayleigh = Math.exp(-height / RAYLEIGH_HEIGHT);
  const mie = MIE_EXTINCTION * Math.exp(-height / MIE_HEIGHT);
  const ozone = Math.max(0, 1 - Math.abs(height - 25) / 15);
  return [0, 1, 2].map(
    (channel) => RAYLEIGH[channel] * rayleigh + mie + OZONE[channel] * ozone,
  ) as Rgb;
}

function transmittance(origin: Point, direction: Point, steps: number): Rgb {
  const ground = raySphere(origin, direction, PLANET_RADIUS);
  if (ground && ground[0] > 0) return [0, 0, 0];
  const top = raySphere(origin, direction, ATMOSPHERE_RADIUS);
  if (!top) return [1, 1, 1];
  const span = top[1] / steps;
  const depth: Rgb = [0, 0, 0];
  for (let step = 0; step < steps; step++) {
    const e = extinction(heightOf(along(origin, direction, span * (step + 0.5))));
    for (let channel = 0; channel < 3; channel++) depth[channel] += e[channel] * span;
  }
  return depth.map((value) => Math.exp(-value)) as Rgb;
}

export function sunTransmittance(sun: Direction) {
  return transmittance(VIEWER, unit(sun), 16);
}

export function skyRadiance(direction: Direction, sun: Direction, steps = 8): Rgb {
  const view = unit(direction);
  const light = unit(sun);
  let far = raySphere(VIEWER, view, ATMOSPHERE_RADIUS)![1];
  const ground = raySphere(VIEWER, view, PLANET_RADIUS);
  if (ground && ground[0] > 0) far = ground[0];
  const span = far / steps;
  const mu = view[0] * light[0] + view[1] * light[1] + view[2] * light[2];
  const rayleighPhase = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const g2 = MIE_G * MIE_G;
  const miePhase =
    ((3 / (8 * Math.PI)) * (1 - g2) * (1 + mu * mu)) /
    ((2 + g2) * Math.pow(1 + g2 - 2 * MIE_G * mu, 1.5));
  const through: Rgb = [1, 1, 1];
  const radiance: Rgb = [0, 0, 0];
  for (let step = 0; step < steps; step++) {
    const point = along(VIEWER, view, span * (step + 0.5));
    const height = heightOf(point);
    const e = extinction(height);
    const sunlight = transmittance(point, light, 4);
    const rayleigh = Math.exp(-height / RAYLEIGH_HEIGHT) * rayleighPhase;
    const mie = MIE_SCATTERING * Math.exp(-height / MIE_HEIGHT) * miePhase;
    for (let channel = 0; channel < 3; channel++) {
      const scattered = sunlight[channel] * (RAYLEIGH[channel] * rayleigh + mie);
      const stepThrough = Math.exp(-e[channel] * span);
      radiance[channel] +=
        (through[channel] * (scattered - scattered * stepThrough)) /
        Math.max(e[channel], 1e-7);
      through[channel] *= stepThrough;
    }
  }
  return radiance.map(
    (value, channel) => value * SUN_INTENSITY + NIGHT_SKY[channel],
  ) as Rgb;
}

export const luminance = (color: Rgb) =>
  0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];

const glslFloat = (value: number) =>
  Number.isInteger(value) ? value.toFixed(1) : String(value);
const glslVec3 = (value: Rgb) => `vec3(${value.map(glslFloat).join(", ")})`;

// 하늘 LUT 전용. 시야 16단계, 햇빛 6단계로 CPU(8, 4단계)보다 촘촘하다.
export const ATMOSPHERE_GLSL = `
const float PLANET_RADIUS = ${glslFloat(PLANET_RADIUS)};
const float ATMOSPHERE_RADIUS = ${glslFloat(ATMOSPHERE_RADIUS)};
const float VIEW_HEIGHT = ${glslFloat(VIEW_HEIGHT)};
const vec3 RAYLEIGH = ${glslVec3(RAYLEIGH)};
const float RAYLEIGH_HEIGHT = ${glslFloat(RAYLEIGH_HEIGHT)};
const float MIE_SCATTERING = ${glslFloat(MIE_SCATTERING)};
const float MIE_EXTINCTION = ${glslFloat(MIE_EXTINCTION)};
const float MIE_HEIGHT = ${glslFloat(MIE_HEIGHT)};
const float MIE_G = ${glslFloat(MIE_G)};
const vec3 OZONE = ${glslVec3(OZONE)};
const float SUN_INTENSITY = ${glslFloat(SUN_INTENSITY)};
const vec3 NIGHT_SKY = ${glslVec3(NIGHT_SKY)};
vec2 atmosphereRaySphere(vec3 origin, vec3 direction, float radius) {
  float b = dot(origin, direction);
  float c = dot(origin, origin) - radius * radius;
  float h = b * b - c;
  if (h < 0.) return vec2(-1.);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
vec3 atmosphereExtinction(float height) {
  return RAYLEIGH * exp(-height / RAYLEIGH_HEIGHT)
    + MIE_EXTINCTION * exp(-height / MIE_HEIGHT)
    + OZONE * max(0., 1. - abs(height - 25.) / 15.);
}
vec3 atmosphereTransmittance(vec3 point, vec3 direction) {
  if (atmosphereRaySphere(point, direction, PLANET_RADIUS).x > 0.) return vec3(0.);
  float span = atmosphereRaySphere(point, direction, ATMOSPHERE_RADIUS).y / 6.;
  vec3 depth = vec3(0.);
  for (int i = 0; i < 6; i++)
    depth += atmosphereExtinction(length(point + direction * span * (float(i) + .5)) - PLANET_RADIUS) * span;
  return exp(-depth);
}
vec3 atmosphereRadiance(vec3 direction, vec3 sun) {
  vec3 origin = vec3(0., PLANET_RADIUS + VIEW_HEIGHT, 0.);
  float far = atmosphereRaySphere(origin, direction, ATMOSPHERE_RADIUS).y;
  float ground = atmosphereRaySphere(origin, direction, PLANET_RADIUS).x;
  if (ground > 0.) far = ground;
  float span = far / 16.;
  float mu = dot(direction, sun);
  float rayleighPhase = .0596831 * (1. + mu * mu);
  float g2 = MIE_G * MIE_G;
  float miePhase = .1193662 * (1. - g2) * (1. + mu * mu) / ((2. + g2) * pow(1. + g2 - 2. * MIE_G * mu, 1.5));
  vec3 through = vec3(1.);
  vec3 light = vec3(0.);
  for (int i = 0; i < 16; i++) {
    vec3 point = origin + direction * span * (float(i) + .5);
    float height = length(point) - PLANET_RADIUS;
    vec3 extinction = atmosphereExtinction(height);
    vec3 scattered = atmosphereTransmittance(point, sun) * (RAYLEIGH * exp(-height / RAYLEIGH_HEIGHT) * rayleighPhase
      + MIE_SCATTERING * exp(-height / MIE_HEIGHT) * miePhase);
    vec3 stepThrough = exp(-extinction * span);
    light += through * (scattered - scattered * stepThrough) / max(extinction, vec3(1e-7));
    through *= stepThrough;
  }
  return light * SUN_INTENSITY + NIGHT_SKY;
}
`;
```

- [ ] **Step 4: 통과 확인과 형식 검사**

Run: `pnpm exec vitest run tests/unit/isu-atmosphere.test.ts`
Expected: PASS, 4개. 사전 계산 기준 정오 천정 약 (0.10, 0.20, 0.42), 고도 3도 투과 약 (0.43, 0.15, 0.02).

Run: `pnpm exec prettier --write apps/web/app/login/isu-atmosphere.ts tests/unit/isu-atmosphere.test.ts && pnpm typecheck && pnpm lint`
Expected: exit 0.

---

### Task 3: 잔물결 법선 지도 굽기

**Files:**
- Create: `tools/blender/bake_water_normals.py`
- Create: `apps/web/public/images/login/water-normal.webp`, `apps/web/public/images/login/mobile/water-normal.webp`
- Modify: `apps/web/public/images/login/provenance.json` (`water_normal` 항목 추가)

**Interfaces:**
- Consumes: 없음
- Produces: 이어 붙는 접선 공간(OpenGL +Y) 법선 WebP. 데스크톱 1024x1024, 모바일 512x512. Task 6이 `RepeatWrapping`, `NoColorSpace`로 읽는다.

사전 확인 사실(2026-09-27 이 PC): Blender 5.2의 `ocean_bake`는 백그라운드 작업이라 파일이 먼저 생기고 나중에 채워진다. `resolution=16`은 256px, `64`는 4096px였으므로 `32`는 1024px다. `choppiness=0`이면 `disp_0001.exr`의 G 채널에만 높이가 있다. Blender 이미지 저장은 WEBP를 지원한다.

- [ ] **Step 1: 스크립트 작성**

`tools/blender/bake_water_normals.py`:

```python
"""로그인 수면의 이어 붙일 수 있는 잔물결 법선 지도를 굽는다.

블렌더 5.2.1에서 화면 없이 실행한다.
  blender -b --factory-startup --python tools/blender/bake_water_normals.py -- \
    --cache output/daylight-water-20260927/ocean-cache \
    --out apps/web/public/images/login/water-normal.webp \
    --mobile apps/web/public/images/login/mobile/water-normal.webp \
    --preview output/daylight-water-20260927/water-normal-tiled.png

Ocean 모디파이어(Phillips 스펙트럼)의 높이 변위를 한 프레임 굽고, 주기 경계를 감싼 중앙 차분으로
접선 공간 법선(OpenGL +Y)을 계산한다. 굽는 범위가 스펙트럼의 공간 주기와 같아 결과가 이어 붙는다.
"""

import argparse
import os
import sys
import time

import bpy
import numpy as np


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--mobile", required=True)
    parser.add_argument("--preview", required=True)
    return parser.parse_args(argv)


def wait_for_file(path):
    # ocean_bake는 백그라운드 작업이다. 파일 크기가 1초 동안 그대로일 때까지 기다린다.
    last, stable = -1, 0
    for _ in range(240):
        size = os.path.getsize(path) if os.path.exists(path) else -1
        stable = stable + 1 if size > 0 and size == last else 0
        if stable >= 2:
            return
        last = size
        time.sleep(0.5)
    raise RuntimeError(f"ocean bake did not finish: {path}")


def bake_height(cache):
    os.makedirs(cache, exist_ok=True)
    for name in os.listdir(cache):
        os.remove(os.path.join(cache, name))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_plane_add(size=2)
    plane = bpy.context.active_object
    ocean = plane.modifiers.new("ocean", "OCEAN")
    ocean.geometry_mode = "GENERATE"
    ocean.resolution = 32  # 32 x 32 = 1024px
    ocean.spatial_size = 24  # 공간 주기(m). 셰이더가 세 배율로 다시 나눈다.
    ocean.wind_velocity = 7.0  # 잔잔한 바다. 기본 30m/s는 너울이 너무 크다.
    # 가장 작은 물결을 약 4텍셀로 둔다. 손실 WebP의 색차 2x2 압축에 뭉개지지 않는다.
    ocean.wave_scale_min = 0.1
    ocean.wave_alignment = 0.35  # 물마루가 한 방향으로 조금 정렬된다.
    ocean.wave_direction = 0.0
    ocean.choppiness = 0.0  # 수평 변위 없이 높이만 쓴다.
    ocean.random_seed = 7
    ocean.use_normals = False
    ocean.filepath = cache
    ocean.frame_start = 1
    ocean.frame_end = 1
    with bpy.context.temp_override(object=plane, active_object=plane):
        bpy.ops.object.ocean_bake(modifier="ocean")
    path = os.path.join(cache, "disp_0001.exr")
    wait_for_file(path)
    image = bpy.data.images.load(path)
    image.colorspace_settings.name = "Non-Color"
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    channel = int(np.argmax([pixels[..., index].std() for index in range(3)]))
    print(f"HEIGHT {width}x{height} channel={channel} std={pixels[..., channel].std():.4f}")
    if width != height or width < 512:
        raise RuntimeError(f"unexpected bake size {width}x{height}")
    return pixels[..., channel].astype(np.float64), ocean.spatial_size


def normals_from_height(heights, texel):
    dx = (np.roll(heights, -1, axis=1) - np.roll(heights, 1, axis=1)) / (2 * texel)
    dy = (np.roll(heights, -1, axis=0) - np.roll(heights, 1, axis=0)) / (2 * texel)
    # 기울기 99번째 백분위수를 0.9로 맞춘다. 셰이더가 겹별 세기를 다시 곱한다.
    scale = 0.9 / np.percentile(np.hypot(dx, dy), 99.0)
    normals = np.stack([-dx * scale, -dy * scale, np.ones_like(heights)], axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    return normals, scale


def save(path, rgb, quality):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    height, width, _ = rgb.shape
    image = bpy.data.images.new(os.path.basename(path), width, height, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    rgba = np.concatenate([rgb, np.ones((height, width, 1))], axis=-1)
    image.pixels.foreach_set(rgba.astype(np.float32).ravel())
    image.file_format = "WEBP" if path.endswith(".webp") else "PNG"
    image.save(filepath=os.path.abspath(path), quality=quality)
    reloaded = bpy.data.images.load(os.path.abspath(path))
    reloaded.colorspace_settings.name = "Non-Color"
    back = np.array(reloaded.pixels[:], dtype=np.float32).reshape(height, width, 4)[..., :3]
    error = float(np.abs(back - rgb).mean())
    print(f"SAVED {path} {width}x{height} {os.path.getsize(path)} bytes mean_error={error:.4f}")
    # 손실 WebP 오차는 허용하되, 채널 순서나 색 공간이 틀린 큰 오차는 막는다.
    if error > 0.03:
        raise RuntimeError(f"saved image differs from source: {path}")


def main():
    args = parse_args()
    heights, spatial = bake_height(args.cache)
    size = heights.shape[0]
    normals, scale = normals_from_height(heights, spatial / size)
    rgb = normals * 0.5 + 0.5
    seam = float(np.abs(rgb[:, 0] - rgb[:, -1]).mean())
    neighbor = float(np.abs(rgb[:, 1] - rgb[:, 0]).mean())
    print(f"NORMAL {size}px slope_scale={scale:.4f} seam={seam:.4f} neighbor={neighbor:.4f}")
    if seam > neighbor * 1.5:
        raise RuntimeError("normal map does not tile")
    save(args.out, rgb, 92)
    small = normals.reshape(size // 2, 2, size // 2, 2, 3).mean(axis=(1, 3))
    small /= np.linalg.norm(small, axis=-1, keepdims=True)
    save(args.mobile, small * 0.5 + 0.5, 92)
    save(args.preview, np.tile(rgb, (2, 2, 1)), 100)


main()
```

- [ ] **Step 2: 실행**

```bash
set -o pipefail
mkdir -p output/daylight-water-20260927
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python tools/blender/bake_water_normals.py -- --cache output/daylight-water-20260927/ocean-cache --out apps/web/public/images/login/water-normal.webp --mobile apps/web/public/images/login/mobile/water-normal.webp --preview output/daylight-water-20260927/water-normal-tiled.png 2>&1 | tee output/daylight-water-20260927/bake-normals.log
```

Expected: `HEIGHT 1024x1024 channel=1`, `NORMAL 1024px ... seam=... neighbor=...`에서 seam이 neighbor의 1.5배 이하, `SAVED` 세 줄의 `mean_error`가 0.03 이하, 종료 코드 0. 오차 기준에 걸리면 기준을 올리지 말고 채널, 색 공간, 저장 형식을 먼저 조사한다.

- [ ] **Step 3: 이음새 눈 검사**

`output/daylight-water-20260927/water-normal-tiled.png`를 Read 도구로 연다. 2x2로 붙인 가운데 십자선에서 이음새가 보이지 않고, 물결이 한 방향으로 조금 정렬된 잔물결이면 통과. 이음새가 보이면 스크립트의 seam 검사 기준이 느슨한 것이므로 멈추고 원인을 조사한다.

- [ ] **Step 4: 출처 기록**

`apps/web/public/images/login/provenance.json`의 최상위 객체에 다음 항목을 추가한다. 두 WebP의 SHA-256은 `sha256sum apps/web/public/images/login/water-normal.webp apps/web/public/images/login/mobile/water-normal.webp` 결과로 채운다.

```json
"water_normal": {
  "files": ["water-normal.webp", "mobile/water-normal.webp"],
  "generator": "tools/blender/bake_water_normals.py (Blender 5.2.1 Ocean modifier, Phillips spectrum, resolution 32, spatial size 24 m, wind 7 m/s, alignment 0.35, seed 7, choppiness 0)",
  "method": "One baked height frame converted to a tangent-space OpenGL (+Y) normal map with wrapped central differences, so the texture tiles. Desktop 1024px, mobile 512px box-downsampled from the same normals, WebP quality 92.",
  "external_assets": false,
  "sha256": {
    "water-normal.webp": "<sha256sum 결과>",
    "mobile/water-normal.webp": "<sha256sum 결과>"
  }
}
```

두 `<sha256sum 결과>` 자리는 실행 결과의 실제 해시로 바꾼다. 빈 문자열이나 이 표시를 남기지 않는다.

---

### Task 4: 하늘 LUT와 하늘 돔

**Files:**
- Create: `apps/web/app/login/isu-sky.ts`

**Interfaces:**
- Consumes: Task 2의 `ATMOSPHERE_GLSL`
- Produces:
  - `SKY_LUT_GLSL: string` (GLSL `vec2 skyLutUv(vec3 direction)`, 수평선 아래 방향은 고도 0 행)
  - `createIsuSky(scene: THREE.Scene): { lut: THREE.Texture; update(renderer: THREE.WebGLRenderer, sun: THREE.Vector3, disc: THREE.Color, stars: number, time: number): void; dispose(): void }`

- [ ] **Step 1: 구현**

`apps/web/app/login/isu-sky.ts`:

```ts
import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { ATMOSPHERE_GLSL } from "./isu-atmosphere";

// 하늘 LUT: 가로는 방위 atan(x, -z)라 이음새가 카메라 뒤(+z)에 있다. 세로는 고도의 제곱근이라
// 수평선 근처가 촘촘하다. 수평선 아래 방향은 고도 0 행을 읽어 수면 안개와 같은 색이 된다.
export const SKY_LUT_GLSL = `
vec2 skyLutUv(vec3 direction) {
  float elevation = asin(clamp(direction.y, 0., 1.));
  return vec2(atan(direction.x, -direction.z) * .1591549 + .5, sqrt(elevation * .6366198));
}`;

// 해 원판 각반지름 0.45도(라디안). 실제보다 조금 크게 둔다.
const SUN_RADIUS = 0.00785;

export function createIsuSky(scene: THREE.Scene) {
  const lut = new THREE.WebGLRenderTarget(256, 128, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
  const sunDirection = new THREE.Vector3(0, 1, 0);
  const sunRadiance = new THREE.Color(0, 0, 0);
  const lutMaterial = new THREE.ShaderMaterial({
    uniforms: { sunDirection: { value: sunDirection } },
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
    fragmentShader: `${ATMOSPHERE_GLSL}
      uniform vec3 sunDirection;
      varying vec2 vUv;
      void main() {
        float azimuth = (vUv.x - .5) * 6.2831853;
        float elevation = vUv.y * vUv.y * 1.5707963;
        vec3 direction = vec3(cos(elevation) * sin(azimuth), sin(elevation), -cos(elevation) * cos(azimuth));
        gl_FragColor = vec4(atmosphereRadiance(direction, sunDirection), 1.);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const lutQuad = new FullScreenQuad(lutMaterial);

  const domeGeometry = new THREE.SphereGeometry(180, 32, 16);
  const domeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      skyLut: { value: lut.texture },
      sunDirection: { value: sunDirection },
      sunRadiance: { value: sunRadiance },
      stars: { value: 0 },
      time: { value: 0 },
    },
    // 방향을 카메라 기준으로 구해 수면 반사용 가상 카메라에서도 맞는 하늘을 그린다.
    vertexShader: `varying vec3 vDirection;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.);
        vDirection = world.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `${SKY_LUT_GLSL}
      uniform sampler2D skyLut;
      uniform vec3 sunDirection, sunRadiance;
      uniform float stars, time;
      varying vec3 vDirection;
      float starHash(vec3 cell) { return fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 direction = normalize(vDirection);
        vec3 color = texture2D(skyLut, skyLutUv(direction)).rgb;
        // 해 원판과 가장자리 어두움. 수면 아래 가상 카메라(반사)에서는 그리지 않는다.
        // 물에 비친 해는 수면 셰이더의 반짝임이 맡는다.
        float radius = length(direction - sunDirection) / ${SUN_RADIUS};
        if (radius < 1. && cameraPosition.y > 0.) {
          float limb = 1. - .6 * (1. - sqrt(1. - radius * radius));
          color += sunRadiance * limb * smoothstep(1., .85, radius) * smoothstep(-.004, .003, direction.y);
        }
        // 밤의 별: 방향을 격자로 나눠 드물게 점을 찍고 천천히 깜박인다.
        if (stars > 0.) {
          vec3 grid = direction * 320.;
          float seed = starHash(floor(grid));
          float point = smoothstep(.32, 0., length(fract(grid) - .5)) * step(.9965, seed);
          float twinkle = .6 + .4 * sin(time * (1.5 + seed * 3.) + seed * 40.);
          color += vec3(.75, .85, 1.) * point * twinkle * stars * .02 * smoothstep(.02, .2, direction.y);
        }
        gl_FragColor = vec4(color, 1.);
      }`,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(domeGeometry, domeMaterial);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);

  return {
    lut: lut.texture,
    update(
      renderer: THREE.WebGLRenderer,
      sun: THREE.Vector3,
      disc: THREE.Color,
      starAmount: number,
      time: number,
    ) {
      sunDirection.copy(sun);
      sunRadiance.copy(disc);
      domeMaterial.uniforms.stars.value = starAmount;
      domeMaterial.uniforms.time.value = time;
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(lut);
      lutQuad.render(renderer);
      renderer.setRenderTarget(previous);
    },
    dispose() {
      scene.remove(dome);
      domeGeometry.dispose();
      domeMaterial.dispose();
      lutMaterial.dispose();
      lutQuad.dispose();
      lut.dispose();
    },
  };
}
```

- [ ] **Step 2: 형식과 타입 검사**

Run: `pnpm exec prettier --write apps/web/app/login/isu-sky.ts && pnpm typecheck && pnpm lint`
Expected: exit 0. GLSL 컴파일은 Task 7의 실제 화면에서 확인한다(이 모듈은 아직 장면에 연결되지 않는다).

---

### Task 5: 호버 파동 계산

**Files:**
- Create: `apps/web/app/login/isu-ripples.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `RIPPLE_AREA = { x: -16, z: -28, size: 36 }` (월드 xz 사각형의 최소 모서리와 한 변)
  - `RIPPLE_SIZE = 256`
  - `createIsuRipples(): { readonly texture: THREE.Texture; readonly energy: number; disturb(fromX: number, fromZ: number, toX: number, toZ: number, strength: number): void; update(renderer: THREE.WebGLRenderer, seconds: number): void; dispose(): void }`
  - 텍스처 R 채널이 높이다. uv (0, 0)은 `(RIPPLE_AREA.x, RIPPLE_AREA.z)`, u는 +x, v는 +z 방향이다.

- [ ] **Step 1: 구현**

`apps/web/app/login/isu-ripples.ts`:

```ts
import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

// 포인터 물결: ISU 앞쪽 수면의 작은 파동 방정식. R=높이, G=속도. 한 텍셀은 36 / 256 = 0.14 단위다.
// 카메라(z 11.8)가 보는 앞쪽 수면을 덮도록 z 쪽으로 치우쳐 둔다.
export const RIPPLE_AREA = { x: -16, z: -28, size: 36 };
export const RIPPLE_SIZE = 256;
const STEP_SECONDS = 1 / 60;
const MAX_STEPS = 3;
// 파동 속도 약 1.8 단위/초. 감쇠로 물결이 약 1.5초 안에 사라지고 멈춘 뒤의 고리는 1초 안에 흐려진다.
const WAVE_SPEED = 0.18;
const DAMPING = 0.955;
const DROP_RADIUS = 0.25 / RIPPLE_AREA.size;
// data-ripple-energy용 에너지 값의 감쇠 시간(초). 넣은 세기를 벽시계 시간으로 줄인다.
const ENERGY_SECONDS = 0.35;
const MAX_PENDING = 0.35;

const SIMULATION_GLSL = `
uniform sampler2D state;
uniform vec4 drop;
uniform float strength;
varying vec2 vUv;
float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0., 1.);
  return length(p - a - ab * t);
}
void main() {
  const float texel = 1. / ${RIPPLE_SIZE.toFixed(1)};
  vec4 cell = texture2D(state, vUv);
  float average = (texture2D(state, vUv + vec2(texel, 0.)).r + texture2D(state, vUv - vec2(texel, 0.)).r
    + texture2D(state, vUv + vec2(0., texel)).r + texture2D(state, vUv - vec2(0., texel)).r) * .25;
  cell.g = (cell.g + (average - cell.r) * ${WAVE_SPEED}) * ${DAMPING};
  cell.r = (cell.r + cell.g) * .995;
  float distance = segmentDistance(vUv, drop.xy, drop.zw) / ${DROP_RADIUS};
  cell.r -= strength * exp(-distance * distance);
  gl_FragColor = cell;
}`;

export function createIsuRipples() {
  const options = {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  };
  const targets = [
    new THREE.WebGLRenderTarget(RIPPLE_SIZE, RIPPLE_SIZE, options),
    new THREE.WebGLRenderTarget(RIPPLE_SIZE, RIPPLE_SIZE, options),
  ];
  const drop = new THREE.Vector4(-1, -1, -1, -1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      state: { value: targets[0].texture },
      drop: { value: drop },
      strength: { value: 0 },
    },
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
    fragmentShader: SIMULATION_GLSL,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(material);
  const toUv = (x: number, z: number) => [
    (x - RIPPLE_AREA.x) / RIPPLE_AREA.size,
    (z - RIPPLE_AREA.z) / RIPPLE_AREA.size,
  ];
  let current = 0;
  let pending = 0;
  let accumulator = 0;
  let energy = 0;

  return {
    get texture() {
      return targets[current].texture;
    },
    get energy() {
      return energy;
    },
    // 이전 점에서 현재 점까지의 선분을 한 번의 눌림으로 넣는다. strength는 높이 단위다.
    disturb(fromX: number, fromZ: number, toX: number, toZ: number, strength: number) {
      const [ax, az] = toUv(fromX, fromZ);
      const [bx, bz] = toUv(toX, toZ);
      drop.set(ax, az, bx, bz);
      pending = Math.min(MAX_PENDING, pending + strength);
      energy += strength;
    },
    update(renderer: THREE.WebGLRenderer, seconds: number) {
      const elapsed = Math.max(0, seconds);
      energy *= Math.exp(-elapsed / ENERGY_SECONDS);
      accumulator = Math.min(accumulator + elapsed, STEP_SECONDS * MAX_STEPS);
      const previous = renderer.getRenderTarget();
      while (accumulator >= STEP_SECONDS) {
        accumulator -= STEP_SECONDS;
        material.uniforms.state.value = targets[current].texture;
        material.uniforms.strength.value = pending;
        pending = 0;
        current = 1 - current;
        renderer.setRenderTarget(targets[current]);
        quad.render(renderer);
      }
      renderer.setRenderTarget(previous);
    },
    dispose() {
      material.dispose();
      quad.dispose();
      targets.forEach((target) => target.dispose());
    },
  };
}
```

- [ ] **Step 2: 형식과 타입 검사**

Run: `pnpm exec prettier --write apps/web/app/login/isu-ripples.ts && pnpm typecheck && pnpm lint`
Expected: exit 0.

---

### Task 6: 수면 셰이더

**Files:**
- Modify (전체 교체): `apps/web/app/login/isu-water.ts`

**Interfaces:**
- Consumes: Task 4의 `SKY_LUT_GLSL`, Task 5의 `RIPPLE_AREA`, `RIPPLE_SIZE`
- Produces: `createIsuWater(scene: THREE.Scene, options: { normalMap: THREE.Texture; skyLut: THREE.Texture }): { update(time: number, rippleMap: THREE.Texture, sunDirection: THREE.Vector3, sunIrradiance: THREE.Color, waterColor: THREE.Color): void; resize(width: number, height: number): void; dispose(): void }`

Reflector는 `UniformsUtils.clone`으로 uniform을 복제하고 렌더 타깃 텍스처는 복제하지 않고 null로 바꾼다. 그래서 텍스처 uniform은 생성 후 `material.uniforms`에 넣는다. `color`, `tDiffuse`, `textureMatrix` uniform은 Reflector가 값을 넣으므로 반드시 정의한다.

- [ ] **Step 1: 구현**

`apps/web/app/login/isu-water.ts` 전체:

```ts
import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { RIPPLE_AREA, RIPPLE_SIZE } from "./isu-ripples";
import { SKY_LUT_GLSL } from "./isu-sky";

// 수면: 거울 반사(Reflector), Blender에서 구운 잔물결 법선 세 겹, 각도별 반사율, 햇빛 반짝임, 수평선 안개.
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
      vec2 waveSlope(vec2 p, float scale, vec2 flow) {
        vec3 n = texture2D(normalMap, p * scale + flow * time).xyz * 2. - 1.;
        return n.xy / max(n.z, .25);
      }
      void main() {
        vec2 p = vWorld.xz;
        float distance = length(cameraPosition.xz - p);
        // x 방향으로 늘여 가로로 긴 물마루를 만든다. 참고 사진 1처럼 반사가 가로로 끊긴다.
        vec2 q = p * vec2(.55, 1.);
        vec2 wave = waveSlope(q, .045, vec2(.0035, .010)) * .5
          + waveSlope(mat2(.8, -.6, .6, .8) * q, .13, vec2(-.008, .014)) * .32
          + waveSlope(mat2(.6, .8, -.8, .6) * q, .41, vec2(.011, .019)) * .2;
        vec2 rippleUv = (p - vec2(${RIPPLE_AREA.x.toFixed(1)}, ${RIPPLE_AREA.z.toFixed(1)})) / ${RIPPLE_AREA.size.toFixed(1)};
        float edge = smoothstep(0., .06, min(min(rippleUv.x, 1. - rippleUv.x), min(rippleUv.y, 1. - rippleUv.y)));
        const float texel = 1. / ${RIPPLE_SIZE.toFixed(1)};
        vec2 ripple = vec2(
          texture2D(rippleMap, rippleUv + vec2(texel, 0.)).r - texture2D(rippleMap, rippleUv - vec2(texel, 0.)).r,
          texture2D(rippleMap, rippleUv + vec2(0., texel)).r - texture2D(rippleMap, rippleUv - vec2(0., texel)).r) * edge;
        vec2 slope = wave + ripple * 2.5;
        vec3 normal = normalize(vec3(-slope.x, 1., -slope.y));
        vec3 view = normalize(cameraPosition - vWorld);
        float facing = clamp(dot(normal, view), 0., 1.);
        // 물리값(5제곱)보다 반사를 조금 강하게 둔 연출값.
        float fresnel = .02 + .98 * pow(1. - facing, 3.);
        // 물결은 반사를 세로로 더 흔든다. 호버 물결의 흔들림은 0.004 안으로 제한한다.
        vec2 wobble = clamp(vec2(wave.x * .4, wave.y) * .016, vec2(-.018), vec2(.018))
          + clamp(ripple * .05, vec2(-.004), vec2(.004));
        vec3 reflection = texture2D(tDiffuse, vMirror.xy / vMirror.w + wobble).rgb;
        vec3 color = mix(waterColor, reflection, fresnel);
        // 햇빛 반짝임(GGX, Kelemen 가시성). 멀수록 거칠게 해 넓은 빛길이 된다.
        vec3 halfway = normalize(sunDirection + view);
        float roughness = clamp(.07 + distance * .0022, .07, .3);
        float alpha2 = roughness * roughness * roughness * roughness;
        float nh = max(dot(normal, halfway), 0.);
        float denominator = nh * nh * (alpha2 - 1.) + 1.;
        float distribution = alpha2 / (3.1415927 * denominator * denominator);
        float lh = max(dot(sunDirection, halfway), .1);
        float sunFresnel = .02 + .98 * pow(1. - lh, 5.);
        float nl = max(dot(normal, sunDirection), 0.);
        color += sunIrradiance * distribution * sunFresnel * nl / (4. * lh * lh);
        // 수평선 안개: 시선 방향 수평선의 하늘색으로 녹이되 끝까지 조금 남겨 수평선 한 줄을 살린다.
        vec3 horizon = texture2D(skyLut, skyLutUv(normalize(vec3(-view.x, 0., -view.z)))).rgb;
        color = mix(color, horizon, min(.85, 1. - exp(-distance * .0025)));
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
      normalMap.dispose();
    },
  };
}
```

- [ ] **Step 2: 형식 검사**

Run: `pnpm exec prettier --write apps/web/app/login/isu-water.ts`
Expected: exit 0. `pnpm typecheck`는 `isu-water-scene.ts`가 옛 API(`setConditions`, `setSun`, `addRipple`, `color`, `rippleEnergy`)를 쓰고 있어 실패한다. Task 7에서 함께 고친다. Task 6과 7은 같은 검토 단위로 넘긴다.

---

### Task 7: 장면 통합

**Files:**
- Modify: `apps/web/app/login/isu-water-scene.ts`
- Delete: `apps/web/app/login/isu-water-moods.ts`, `tests/unit/isu-water-moods.test.ts`

**Interfaces:**
- Consumes: Task 1 `advanceDay`, `daypart`, `randomDayTime`, `sunAt`; Task 2 `luminance`, `skyRadiance`, `SUN_INTENSITY`, `sunTransmittance`; Task 4 `createIsuSky`; Task 5 `createIsuRipples`, `RIPPLE_AREA`; Task 6 `createIsuWater`
- Produces: 기존 `createIsuWaterScene(canvas, signal)` 반환 형태 유지(`resize`, `render`, `texturesReady`, `pointer`, `pointerLeave`, `calm`, `shake`, `share`, `dispose`). 캔버스 속성 `data-day-time`, `data-daypart`, `data-sun-elevation`, `data-sun-azimuth` 추가. `data-mood`, `data-next-mood`, `data-phase`, `data-transitioning`, `data-elapsed`, `data-sun-x`, `data-sun-height`, `data-sun-strength` 제거. 나머지 속성 유지.

- [ ] **Step 1: 옛 장면 모듈과 검사 삭제**

```bash
rm apps/web/app/login/isu-water-moods.ts tests/unit/isu-water-moods.test.ts
```

index는 건드리지 않는다. 사용자가 커밋을 요청하면 그때 이 삭제를 함께 stage한다.

- [ ] **Step 2: `isu-water-scene.ts` 교체**

파일 전체를 다음으로 바꾼다. 블록 재질, 호버 빛, 등장, calm, share 부분은 기존 코드 그대로다.

```ts
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import {
  luminance,
  skyRadiance,
  SUN_INTENSITY,
  sunTransmittance,
  type Rgb,
} from "./isu-atmosphere";
import { loadBlockMeshes } from "./isu-blocks";
import { advanceDay, daypart, randomDayTime, sunAt } from "./isu-day-cycle";
import { buildIsuLayout } from "./isu-layout";
import { createIsuRipples, RIPPLE_AREA } from "./isu-ripples";
import { createIsuSky } from "./isu-sky";
import { createIsuWater } from "./isu-water";
import { createLoginMotion } from "./login-motion";

// 조명과 노출 상수. Task 9 캡처에서 이 표의 값만 조정한다.
const LIGHT = {
  sun: 2.2, // 햇빛 방향광 = sun x 투과 휘도
  sky: 1.8, // 반구광 = sky x 하늘 평균 휘도
  rim: 0.45, // 뒤쪽 푸른 윤곽광
  moon: 0.35, // 밤의 푸른 방향광
  nightFill: 0.35, // 밤 반구광 바닥값
  disc: 40, // 해 원판 HDR 밝기. 색은 투과를 정규화한다.
  exposureKey: 0.95, // 노출 = key / sqrt(하늘 평균 휘도)
  exposureMin: 0.8,
  exposureMax: 3,
  water: [0.01, 0.06, 0.12] as Rgb, // 물속 색 = 하늘 평균 x 이 값
  bloomStrength: 0.35,
  bloomRadius: 0.55,
  bloomThreshold: 8, // 노출 전 선형값. 해, 반짝임만 번진다.
};

// 8비트 출력의 하늘 그라디언트 띠를 없애는 미세한 디더링. 출력 변환 뒤에 적용한다.
const DitherShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader:
    "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 color = texture2D(tDiffuse, vUv);
      float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5;
      gl_FragColor = vec4(color.rgb + noise / 255., color.a);
    }`,
};

const UP = { x: 0, y: 1, z: 0 };
const AHEAD = { x: 0, y: 0.05, z: -1 };
const BEHIND = { x: 0, y: 0.05, z: 1 };

export async function createIsuWaterScene(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
) {
  if (signal.aborted)
    throw new DOMException("Scene initialization cancelled", "AbortError");
  const layout = buildIsuLayout();
  const mobile = window.matchMedia("(pointer: coarse)").matches;
  const [modelBlocks, waterNormal] = await Promise.all([
    loadBlockMeshes(layout.length, signal),
    new THREE.TextureLoader().loadAsync(
      mobile
        ? "/images/login/mobile/water-normal.webp"
        : "/images/login/water-normal.webp",
    ),
  ]);
  const geometries = modelBlocks.map((block) => block.geometry);
  if (signal.aborted) {
    geometries.forEach((geometry) => geometry.dispose());
    waterNormal.dispose();
    throw new DOMException("Scene initialization cancelled", "AbortError");
  }

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
  } catch (error) {
    geometries.forEach((geometry) => geometry.dispose());
    waterNormal.dispose();
    throw error;
  }
  let shaderFailed = false;
  renderer.debug.onShaderError = () => {
    shaderFailed = true;
  };
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, mobile ? 1.2 : 1.5),
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  const studio = new RoomEnvironment();
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  const environment = environmentGenerator.fromScene(studio, 0.35);
  environmentGenerator.dispose();
  studio.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    if (Array.isArray(object.material))
      object.material.forEach((material) => material.dispose());
    else object.material.dispose();
  });
  const sky = createIsuSky(scene);

  const camera = new THREE.PerspectiveCamera(49, 1, 0.1, 2500);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x708999, 1.8);
  scene.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(sunLight);
  const moonLight = new THREE.DirectionalLight("#9fc4ff", 0);
  moonLight.position.set(-6, 10, -8);
  scene.add(moonLight);
  const rim = new THREE.DirectionalLight(0xc8efff, LIGHT.rim);
  rim.position.set(4, 4, -6);
  scene.add(rim);
  const hoverLight = new THREE.PointLight("#c8eaff", 0, 2.7, 2);
  scene.add(hoverLight);
  const ripples = createIsuRipples();
  const water = createIsuWater(scene, {
    normalMap: waterNormal,
    skyLut: sky.lut,
  });

  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: mobile ? 0 : 4,
    }),
  );
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      LIGHT.bloomStrength,
      LIGHT.bloomRadius,
      LIGHT.bloomThreshold,
    ),
  );
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(DitherShader));

  const logo = new THREE.Group();
  scene.add(logo);
  const blocks = layout.map((spec, index) => {
    const material = modelBlocks[index].material.clone();
    material.vertexColors = false;
    material.color.set(spec.dot ? "#99ca3c" : "#008fd4");
    material.transmission = spec.dot ? 0 : 0.68;
    material.thickness = spec.dot ? 0 : 0.4;
    if (spec.dot) {
      material.metalness = 0.04;
      material.roughness = 0.25;
      material.clearcoat = 0.38;
      material.clearcoatRoughness = 0.14;
    } else {
      material.roughness = 0.14;
      material.clearcoatRoughness = 0.12;
      material.envMap = environment.texture;
      material.envMapIntensity = 0.22;
    }
    material.attenuationColor = new THREE.Color(
      spec.dot ? "#99ca3c" : "#80c7ea",
    );
    material.attenuationDistance = 1.8;
    material.emissive = new THREE.Color(spec.dot ? "#2a3d00" : "#008fd4");
    material.emissiveIntensity = spec.dot ? 0.22 : 0.025;
    material.needsUpdate = true;
    const mesh = new THREE.Mesh(geometries[index], material);
    const base = new THREE.Vector3(
      spec.center[0],
      spec.center[1] + 0.02,
      spec.center[2],
    );
    mesh.position.copy(base);
    logo.add(mesh);
    return { mesh, material, base, spec, hover: 0 };
  });

  const motion = createLoginMotion();
  const pointer = new THREE.Vector2(2, 2);
  const raycaster = new THREE.Raycaster();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const waterHit = new THREE.Vector3();
  const previousHit = new THREE.Vector3();
  let hasPreviousHit = false;
  let dayTime = randomDayTime();
  const sunDirection = new THREE.Vector3(0, 1, 0);
  const sunIrradiance = new THREE.Color();
  const discColor = new THREE.Color();
  const waterColor = new THREE.Color();
  let frameCount = 0;
  let activeTime = 0;
  let introTime = 0;
  let hoverIndex = -1;
  let openAmount = 0;
  let pointerHits = 0;
  let blockHits = 0;
  let sharePending: (() => void) | null = null;
  let disposed = false;

  // 해 위치 하나에서 하늘, 햇빛, 주변광, 물속 색, 노출을 모두 정한다.
  const applyDaylight = () => {
    const sun = sunAt(dayTime);
    sunDirection.set(sun.x, sun.y, sun.z);
    const transmittance = sunTransmittance(sun);
    const zenith = skyRadiance(UP, sun);
    const ahead = skyRadiance(AHEAD, sun);
    const behind = skyRadiance(BEHIND, sun);
    const average = [0, 1, 2].map(
      (channel) => (zenith[channel] + ahead[channel] + behind[channel]) / 3,
    ) as Rgb;
    const skyLuminance = luminance(average);
    const night = THREE.MathUtils.smoothstep(-sun.y, 0.05, 0.25);
    const peak = Math.max(...transmittance, 1e-6);
    sunLight.color.setRGB(
      transmittance[0] / peak,
      transmittance[1] / peak,
      transmittance[2] / peak,
    );
    sunLight.intensity = LIGHT.sun * luminance(transmittance);
    sunLight.position.copy(sunDirection).multiplyScalar(20);
    moonLight.intensity = LIGHT.moon * night;
    const skyPeak = Math.max(...average, 1e-6);
    ambient.color.setRGB(
      average[0] / skyPeak,
      average[1] / skyPeak,
      average[2] / skyPeak,
    );
    ambient.intensity = LIGHT.sky * skyLuminance + LIGHT.nightFill * night;
    waterColor.setRGB(
      average[0] * LIGHT.water[0],
      average[1] * LIGHT.water[1],
      average[2] * LIGHT.water[2],
    );
    discColor
      .copy(sunLight.color)
      .multiplyScalar(
        LIGHT.disc * THREE.MathUtils.smoothstep(sun.y, -0.01, 0.02),
      );
    sunIrradiance
      .setRGB(transmittance[0], transmittance[1], transmittance[2])
      .multiplyScalar(SUN_INTENSITY);
    renderer.toneMappingExposure = THREE.MathUtils.clamp(
      LIGHT.exposureKey / Math.sqrt(skyLuminance + 0.0004),
      LIGHT.exposureMin,
      LIGHT.exposureMax,
    );
    canvas.dataset.dayTime = dayTime.toFixed(2);
    canvas.dataset.daypart = daypart(sun);
    canvas.dataset.sunElevation = sun.elevation.toFixed(2);
    canvas.dataset.sunAzimuth = sun.azimuth.toFixed(1);
    return night;
  };

  const insideRippleArea = (point: THREE.Vector3) =>
    point.x > RIPPLE_AREA.x &&
    point.x < RIPPLE_AREA.x + RIPPLE_AREA.size &&
    point.z > RIPPLE_AREA.z &&
    point.z < RIPPLE_AREA.z + RIPPLE_AREA.size;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    if (width < 700) {
      camera.fov = 56;
      camera.position.set(0, 3.2, 11.7);
      camera.lookAt(0, 1.35, 0);
    } else {
      camera.fov = 49;
      camera.position.set(0, 3.2, 11.8);
      const targetX = THREE.MathUtils.lerp(
        1.65,
        3.1,
        THREE.MathUtils.clamp((camera.aspect - 1.18) / 0.6, 0, 1),
      );
      camera.lookAt(targetX, 1.4, 0);
    }
    camera.updateProjectionMatrix();
    water.resize(width, height);
  };

  const render = (
    time: number,
    delta: number,
    assetsReady: boolean,
    wallDelta = delta,
  ) => {
    if (disposed) return;
    const frame = motion.update(delta);
    const activeDelta = Math.min(delta, 0.06) * (1 - frame.calm * 0.7);
    activeTime += Math.min(wallDelta, 0.25) * (1 - frame.calm * 0.7);
    introTime += wallDelta;
    // 입력 중(calm)에는 해가 멈춘다. 페이지 복귀 시 큰 시간 간격은 1초로 자른다.
    dayTime = advanceDay(dayTime, Math.min(wallDelta, 1) * (1 - frame.calm));
    const night = applyDaylight();

    hoverIndex = -1;
    if (pointer.x !== 2 && assetsReady) {
      raycaster.setFromCamera(pointer, camera);
      const blockHit = raycaster.intersectObjects(
        blocks.map((block) => block.mesh),
        false,
      )[0];
      if (blockHit) {
        hoverIndex = blocks.findIndex(
          (block) => block.mesh === blockHit.object,
        );
        if (hoverIndex >= 0) {
          hoverLight.position
            .copy(blockHit.point)
            .addScaledVector(raycaster.ray.direction, -0.65);
          hoverLight.color.set(
            blocks[hoverIndex].spec.dot ? "#f0fad4" : "#c8eaff",
          );
          if (blocks[hoverIndex].hover < 0.1) blockHits++;
        }
      } else if (
        raycaster.ray.intersectPlane(waterPlane, waterHit) &&
        insideRippleArea(waterHit)
      ) {
        // 처음 닿은 점(탭 포함)은 작은 눌림 하나, 이후에는 움직인 거리에 비례한 선분 눌림.
        const moved = hasPreviousHit ? waterHit.distanceTo(previousHit) : 0;
        if (!hasPreviousHit || moved > 0.02) {
          ripples.disturb(
            hasPreviousHit ? previousHit.x : waterHit.x,
            hasPreviousHit ? previousHit.z : waterHit.z,
            waterHit.x,
            waterHit.z,
            hasPreviousHit ? Math.min(0.12, moved * 0.08) : 0.06,
          );
          previousHit.copy(waterHit);
          hasPreviousHit = true;
          pointerHits++;
        }
      }
    }

    const intro = THREE.MathUtils.smoothstep(introTime, 0, 2.2);
    hoverLight.intensity +=
      ((hoverIndex >= 0 ? 1.6 * (1 - frame.calm * 0.8) : 0) -
        hoverLight.intensity) *
      (1 - Math.exp(-activeDelta * 9));
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      const target = hoverIndex === index ? 1 : 0;
      block.hover += (target - block.hover) * (1 - Math.exp(-activeDelta * 7));
      const spread = block.hover * (1 - frame.calm * 0.8);
      const x = Math.sign(block.base.x) * (0.04 + (index % 3) * 0.014) * spread;
      block.mesh.position.set(
        block.base.x + x + frame.shake * 0.045,
        block.base.y +
          block.spec.course * 0.014 * spread +
          (1 - intro) * (0.35 + (index % 4) * 0.12),
        block.base.z + 0.16 * spread,
      );
      block.material.emissiveIntensity = block.spec.dot
        ? 0.22 + Math.sin(time * 2) * 0.06 + frame.share * 0.45
        : 0.025 + 0.035 * spread + frame.share * 0.12;
    }
    openAmount +=
      ((hoverIndex >= 0 ? 1 : 0) - openAmount) *
      (1 - Math.exp(-activeDelta * 6));
    ripples.update(renderer, Math.min(wallDelta, 0.25));
    water.update(
      activeTime,
      ripples.texture,
      sunDirection,
      sunIrradiance,
      waterColor,
    );
    sky.update(renderer, sunDirection, discColor, night, time);
    composer.render(delta);
    if (shaderFailed) throw new Error("Water scene shader compilation failed");
    if (sharePending && frame.share >= 1) {
      sharePending();
      sharePending = null;
    }
    canvas.dataset.ready = assetsReady ? "true" : "loading";
    canvas.dataset.preview = "true";
    canvas.dataset.intro = introTime >= 2.2 ? "complete" : "running";
    canvas.dataset.calm = frame.calm.toFixed(2);
    canvas.dataset.share = frame.share.toFixed(2);
    canvas.dataset.frames = String(++frameCount);
    canvas.dataset.pointerHits = String(pointerHits);
    canvas.dataset.rippleEnergy = ripples.energy.toFixed(3);
    canvas.dataset.openAmount = openAmount.toFixed(3);
    canvas.dataset.blockHits = String(blockHits);
    canvas.dataset.blockLight = hoverLight.intensity.toFixed(2);
  };

  resize();
  applyDaylight();
  return {
    resize,
    render,
    texturesReady: Promise.resolve(true),
    pointer(x: number, y: number) {
      pointer.set(x, y);
    },
    pointerLeave() {
      pointer.set(2, 2);
      hasPreviousHit = false;
    },
    calm(on: boolean) {
      motion.calm(on);
    },
    shake() {
      motion.shake();
    },
    share() {
      motion.share();
      return new Promise<void>((resolve) => {
        sharePending?.();
        sharePending = resolve;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sharePending?.();
      sharePending = null;
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
      water.dispose();
      ripples.dispose();
      sky.dispose();
      environment.dispose();
      for (const block of blocks) block.material.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      renderer.dispose();
    },
  };
}
```

참고: 기존 `calmTarget` 변수는 분위기 전환 억제에만 쓰였으므로 없앤다. `calm(on)`은 `motion.calm(on)`만 호출한다. 해 정지는 `frame.calm`으로 부드럽게 일어난다.

- [ ] **Step 3: 전체 정적 검사와 단위 검사**

Run: `pnpm exec prettier --write apps/web/app/login/isu-water-scene.ts && pnpm check && pnpm test`
Expected: `pnpm check` exit 0. `pnpm test`는 기존 파일 수에서 옛 분위기 검사 1개 파일이 빠지고 새 파일 2개가 더해진 결과로 모두 통과.

- [ ] **Step 4: 실제 GPU로 첫 화면 확인**

1. 보존 파일 해시를 먼저 확인한다: `sha256sum -c output/daylight-water-20260927/preserved-files.sha256` (모두 OK).
2. `mcp__Claude_Browser__preview_start`에 `{ "name": "web-dev" }`로 dev 서버를 연다(`.claude/launch.json`은 읽기만 한다). `/login`으로 이동한다.
3. `read_console_messages`에 `onlyErrors: true`로 셰이더 오류와 예외가 없는지 확인한다.
4. `javascript_tool`로 `Object.assign({}, document.querySelector('.loginSceneCanvas').dataset)`를 읽어 `ready: "true"`, `daypart`, `dayTime`이 1초 뒤 증가하는지 확인한다.
5. 스크린샷 한 장을 찍어 하늘, 수면, ISU가 보이는지 확인한다.
6. dev 서버를 `preview_stop`으로 멈춘 뒤 `sha256sum -c output/daylight-water-20260927/preserved-files.sha256`를 다시 실행한다. `next-env.d.ts`가 달라졌으면 `cp output/daylight-water-20260927/preserved/apps/web/next-env.d.ts apps/web/next-env.d.ts`로 원래 바이트를 되돌리고 다시 대조한다.

dev 서버가 `/login`을 열지 못하면(환경 변수 등) 원인을 기록하고 Task 10의 Docker `test-web`(127.0.0.1:18776)을 먼저 빌드해 같은 확인을 한다.

---

### Task 8: e2e 검사 갱신

**Files:**
- Modify: `tests/e2e/login-water.spec.ts`
- Modify: `tests/e2e/login-scene.spec.ts`

**Interfaces:**
- Consumes: Task 7의 캔버스 속성 `data-daypart`, `data-day-time`, `data-ripple-energy`, `data-pointer-hits`, `data-calm`

- [ ] **Step 1: 시간대 seed로 교체 (`login-water.spec.ts`)**

`for (const [name, seed, id] of [...])` 블록의 목록과 단언을 바꾼다. 가상 RAF가 프레임마다 20ms씩 가므로 검사 동안 시각은 정오와 자정 근처에 머문다.

```ts
for (const [name, seed, part] of [
  ["day", 0.5, "noon"],
  ["night", 0, "night"],
] as const) {
```

같은 블록 안의 `await expect(canvas(page)).toHaveAttribute("data-mood", id);`를 다음으로 바꾼다.

```ts
      await expect(canvas(page)).toHaveAttribute("data-daypart", part);
```

- [ ] **Step 2: 호버 물결 복귀 검사 추가 (`login-water.spec.ts`)**

`water and ISU blocks respond to the pointer without shader errors` 검사에서 `ripple-energy`가 0보다 커지는 poll 바로 뒤에 넣는다.

```ts
  await page.mouse.move(0, 0);
  await expect
    .poll(() => metric(page, "ripple-energy"), { timeout: 3_000 })
    .toBeLessThan(0.02);
```

- [ ] **Step 3: 로그인 카드 위 포인터 검사 추가 (`login-water.spec.ts`, Review Focus 4)**

`visible slogan sits 24 to 32 pixels above the desktop login card` 검사 앞에 추가한다.

```ts
test("pointer over the login card leaves the water still", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await expect(canvas(page)).toHaveAttribute("data-intro", "complete", {
    timeout: 90_000,
  });
  const panel = await page.locator(".loginPanel").boundingBox();
  if (!panel) throw new Error("login card is missing");
  const before = await metric(page, "pointer-hits");
  for (const [x, y] of [
    [0.2, 0.3],
    [0.5, 0.6],
    [0.8, 0.9],
  ])
    await page.mouse.move(panel.x + panel.width * x, panel.y + panel.height * y);
  await page.waitForTimeout(1_500);
  expect(await metric(page, "pointer-hits")).toBe(before);
  expect(await metric(page, "ripple-energy")).toBe(0);
});
```

- [ ] **Step 4: 수면 탭 검사 추가 (`login-water.spec.ts`, Review Focus 3)**

`test.describe("touch input", ...)` 안의 `touching an ISU block briefly lights it` 뒤에 추가한다. 캔버스 아래쪽 10%는 카메라 앞 수면이다.

```ts
  test("tapping the water starts a small ripple", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await expect(canvas(page)).toHaveAttribute("data-intro", "complete", {
      timeout: 90_000,
    });
    const box = await canvas(page).boundingBox();
    if (!box) throw new Error("scene canvas is missing");
    const observed = page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const surface =
            document.querySelector<HTMLElement>(".loginSceneCanvas")!;
          let energy = 0;
          const observer = new MutationObserver(() => {
            energy = Math.max(energy, Number(surface.dataset.rippleEnergy));
          });
          observer.observe(surface, {
            attributes: true,
            attributeFilter: ["data-ripple-energy"],
          });
          window.setTimeout(() => {
            observer.disconnect();
            resolve(energy);
          }, 12000);
        }),
    );
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.9);
    expect(await observed).toBeGreaterThan(0);
  });
```

- [ ] **Step 5: 입력 중 해 정지 검사 (`login-scene.spec.ts`, Review Focus 2)**

`slogan lines and calm survive sign-in`에서 `data-calm`이 0.9를 넘는 poll 바로 뒤에 넣는다.

```ts
  const calmStart = Number(await canvas(page).getAttribute("data-day-time"));
  await page.waitForTimeout(3_000);
  const calmEnd = Number(await canvas(page).getAttribute("data-day-time"));
  expect((calmEnd - calmStart + 120) % 120).toBeLessThan(0.4);
```

- [ ] **Step 6: 법선 지도 실패 대체 검사 (`login-scene.spec.ts`, Review Focus 1)**

`a missing block model falls back to the still image` 뒤에 추가한다.

```ts
test("a missing water normal map falls back to the still image", async ({
  page,
}) => {
  await page.route("**/images/login/water-normal.webp", (route) =>
    route.abort(),
  );
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

- [ ] **Step 7: 형식과 정적 검사**

Run: `pnpm exec prettier --write tests/e2e/login-water.spec.ts tests/e2e/login-scene.spec.ts && pnpm check`
Expected: exit 0. e2e 실행은 이 PC에 Playwright Chromium이 없어 Task 10의 Docker에서 한다.

---

### Task 9: 시각 조정, 캡처, 성능 측정, 사용자 확인

**Files:**
- Modify (필요한 경우 상수만): `apps/web/app/login/isu-water-scene.ts`의 `LIGHT`, `apps/web/app/login/isu-water.ts`의 셰이더 상수(반사율 지수, 흔들림, 거칠기, 안개), `apps/web/app/login/isu-ripples.ts`의 파동 상수, `pointer` 눌림 세기
- Create: `output/daylight-water-20260927/compose.test.yaml`, `output/daylight-water-20260927/capture_day.mjs`

**Interfaces:**
- Consumes: Task 7의 캔버스 속성과 Task 8까지의 코드

- [ ] **Step 1: 실제 GPU에서 한 바퀴 조정**

dev 서버(Task 7 Step 4와 같은 방법)로 `/login`을 열고 `resize_window`를 `{ width: 1440, height: 900 }`으로 맞춘다. 2분 주기이므로 `javascript_tool`로 `document.querySelector('.loginSceneCanvas').dataset.daypart`를 1초 간격으로 확인하며 각 시간대에 스크린샷을 찍는다. 아래 기준을 하나씩 본다.

| 시간대 | 통과 기준 |
| --- | --- |
| 새벽, 일출 | 정면 하늘 아래쪽에 분홍빛 띠, 그 아래 푸른 띠. ISU 앞면에 따뜻한 빛. 수면에 빛길 없음 |
| 아침, 한낮 | 위쪽 짙은 청색에서 수평선 쪽 밝은 하늘. 수평선은 한 줄이고 그 아래 회색 띠가 없음. ISU 반사가 가로 잔물결에 끊김 |
| 오후, 노을 | 해가 왼쪽 위에서 들어와 U와 카드 사이로 짐. 작은 해 원판과 광채, 카메라 쪽으로 뻗는 반짝이는 빛길. ISU 윤곽이 뒤에서 빛남 |
| 황혼, 밤 | 라벤더에서 짙은 청색으로 부드럽게 변함. 별이 서서히 나타남. ISU 윤곽이 보임 |
| 전 구간 | 하늘 그라디언트에 띠 무늬 없음. 전환이 한 번에 튀지 않음 |

기준에 못 미치면 위 Files의 상수만 바꾸고 HMR 화면으로 다시 본다. 수면 위로 마우스를 천천히, 빠르게 움직여 물결이 작고 1.5초 안에 사라지는지, 멈춘 뒤 고리가 1초 안에 흐려지는지 본다.

- [ ] **Step 2: 성능 측정**

같은 1440x900 창에서 `javascript_tool`로 10초 평균 fps를 잰다.

```js
await new Promise((resolve) => {
  let frames = 0;
  const start = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - start < 10000) requestAnimationFrame(tick);
    else resolve(frames / ((performance.now() - start) / 1000));
  };
  requestAnimationFrame(tick);
});
```

Expected: 50 이상. 측정값과 시간대를 그대로 기록한다. 50 미만이면 `LIGHT.bloom*`를 바꾸지 말고 먼저 원인(Reflector 해상도, 블룸, 투과 패스)을 `renderer.info`로 확인해 사용자에게 보고한다.

- [ ] **Step 3: 결정적 캡처 스크립트 작성**

`output/daylight-water-20260927/compose.test.yaml`:

```yaml
services:
  test-web:
    image: ax-daylight-water-runtime:20260927
    ports:
      - "127.0.0.1:18776:3000"
  test-worker:
    image: ax-daylight-water-runtime:20260927
  test:
    image: ax-daylight-water-tools:20260927
    volumes:
      - ./tests:/app/tests:ro
      - ./output/daylight-water-20260927:/captures
  test-setup-e2e:
    image: ax-daylight-water-tools:20260927
```

`output/daylight-water-20260927/capture_day.mjs`:

```js
import { chromium } from "/app/node_modules/playwright/index.mjs";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const requested = new Set((process.env.CAPTURE_NAMES || "").split(",").filter(Boolean));
// 가상 RAF 170ms 간격에서 등장(2.2초)이 끝나면 하루 시각이 약 2.21초 지난다.
const INTRO_SECONDS = 2.21;
const desktop = { width: 1440, height: 900 };
const seedFor = (target) => ((((target - INTRO_SECONDS) % 120) + 120) % 120) / 120;
const shots = [
  ["dawn", 11.59, desktop, false],
  ["sunrise", 15.57, desktop, false],
  ["morning", 29.9, desktop, false],
  ["noon", 60, desktop, false],
  ["sunset", 103.79, desktop, false],
  ["dusk", 107.74, desktop, false],
  ["night", 0, desktop, false],
  ["mobile-sunset", 103.79, { width: 390, height: 844 }, true],
  ["hover", 60, desktop, false],
];

async function open(seed, viewport, hasTouch) {
  const page = await browser.newPage({ viewport, hasTouch, reducedMotion: "no-preference" });
  await page.addInitScript((value) => {
    Math.random = () => value;
    const frame = window.requestAnimationFrame.bind(window);
    let sceneTime = 0;
    window.__sceneStep = 170;
    window.requestAnimationFrame = (callback) =>
      frame(() => {
        sceneTime += window.__sceneStep;
        callback(sceneTime);
      });
  }, seed);
  await page.goto("http://test-web:3000/login");
  await page.locator('.loginSceneCanvas[data-intro="complete"]').waitFor({ timeout: 180_000 });
  return page;
}

const state = (page) =>
  page.locator(".loginSceneCanvas").evaluate((element) => ({
    time: element.dataset.dayTime,
    part: element.dataset.daypart,
    elevation: element.dataset.sunElevation,
    azimuth: element.dataset.sunAzimuth,
    ripple: element.dataset.rippleEnergy,
  }));

const waitFrames = (page, count) =>
  page.evaluate(
    (frames) =>
      new Promise((resolve) => {
        const surface = document.querySelector(".loginSceneCanvas");
        const start = Number(surface.dataset.frames);
        const check = () =>
          Number(surface.dataset.frames) >= start + frames ? resolve() : setTimeout(check, 50);
        check();
      }),
    count,
  );

try {
  for (const [name, target, viewport, hasTouch] of shots) {
    if (requested.size > 0 && !requested.has(name)) continue;
    const page = await open(seedFor(target), viewport, hasTouch);
    if (name === "hover") {
      await page.evaluate(() => {
        window.__sceneStep = 1;
      });
      await page.screenshot({ path: "/captures/hover-before.png", fullPage: true, timeout: 180_000 });
      // 한 프레임에 파동 3단계(50ms)씩 진행하며 수면 앞쪽을 가로질러 움직인다.
      await page.evaluate(() => {
        window.__sceneStep = 50;
      });
      for (let step = 0; step <= 10; step++) {
        await page.mouse.move(260 + step * 40, 790 - step * 6);
        await waitFrames(page, 1);
      }
      await waitFrames(page, 4);
      await page.evaluate(() => {
        window.__sceneStep = 1;
      });
      await page.screenshot({ path: "/captures/hover-after.png", fullPage: true, timeout: 180_000 });
    } else {
      await page.evaluate(() => {
        window.__sceneStep = 1;
      });
      await page.waitForTimeout(100);
      await page.screenshot({ path: `/captures/${name}.png`, fullPage: true, timeout: 180_000 });
    }
    console.log(`CAPTURE ${name} ${JSON.stringify(await state(page))}`);
    await page.close();
  }
} finally {
  await browser.close();
}
```

- [ ] **Step 4: Docker 이미지 빌드와 캡처**

```bash
set -o pipefail
docker compose -p ax-daylight-water-20260927 -f compose.yaml -f output/daylight-water-20260927/compose.test.yaml --profile test build test-web test 2>&1 | tee output/daylight-water-20260927/build.log
docker compose -p ax-daylight-water-20260927 -f compose.yaml -f output/daylight-water-20260927/compose.test.yaml --profile test up -d test-web
docker compose -p ax-daylight-water-20260927 -f compose.yaml -f output/daylight-water-20260927/compose.test.yaml --profile test run --rm test node /captures/capture_day.mjs 2>&1 | tee output/daylight-water-20260927/capture.log
```

Expected: 빌드 exit 0. `CAPTURE` 줄 9개. 각 줄의 `part`가 이름과 맞는다(`dawn` 등, `mobile-sunset`은 `sunset`, `hover`는 `noon`). `hover` 줄의 `ripple`이 0보다 크다. 시각이 목표에서 1초 넘게 어긋나면 `INTRO_SECONDS`를 로그의 실제 차이만큼 고쳐 다시 찍는다.

- [ ] **Step 5: 캡처 검토**

`output/daylight-water-20260927/`의 PNG 10장을 Read 도구로 열어 Step 1 표의 기준과 참고 사진 3장(`C:/Users/sp20171217yw/Downloads/참고이미지/`)을 나란히 비교한다. `mobile-sunset.png`에서 해 또는 노을 빛길이 화면 안에 보이는지 따로 적는다(Review Focus 5). `hover-before.png`와 `hover-after.png`에서 ISU 반사가 크게 휘지 않고 앞쪽 수면에만 작은 일렁임이 보이는지 본다.

- [ ] **Step 6: 사용자 확인에서 멈춤**

캡처 10장(`SendUserFile`)과 fps 측정값, 기준별 결과, 조정한 상수 목록, Review Focus 5의 모바일 결과를 사용자에게 보낸다. 사용자가 확인하기 전에는 Task 10으로 넘어가지 않는다. 수정 요청이 오면 Step 1부터 반복한다.

---

### Task 10: 정지 이미지, Docker 검증, 데모 적용, 기록

**Files:**
- Create: `output/daylight-water-20260927/capture_stills.mjs`, `output/daylight-water-20260927/convert_stills.py`
- Modify: `apps/web/public/images/login/login-still-desktop.webp`, `login-still-mobile.webp`, `apps/web/public/images/login/provenance.json`(`stills`, `water_scene`)
- Modify: `docs/PROGRESS.md`, `docs/LOGIN_VISUAL_HANDOFF_2026-09-27.md`

- [ ] **Step 1: 정지 이미지 캡처 스크립트**

`output/daylight-water-20260927/capture_stills.mjs`:

```js
import { chromium } from "/app/node_modules/playwright/index.mjs";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
// 해 고도 -3도 황혼(107.74초). 등장 2.21초를 빼서 seed를 정한다.
const seed = (107.74 - 2.21) / 120;
try {
  for (const [name, viewport, scale, touch] of [
    ["desktop", { width: 1920, height: 1080 }, 1, false],
    ["mobile", { width: 390, height: 844 }, 2, true],
  ]) {
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor: scale,
      hasTouch: touch,
      reducedMotion: "no-preference",
    });
    await page.addInitScript((value) => {
      Math.random = () => value;
      const frame = window.requestAnimationFrame.bind(window);
      let sceneTime = 0;
      window.__sceneStep = 170;
      window.requestAnimationFrame = (callback) =>
        frame(() => {
          sceneTime += window.__sceneStep;
          callback(sceneTime);
        });
    }, seed);
    await page.goto("http://test-web:3000/login");
    await page.locator('.loginSceneCanvas[data-intro="complete"]').waitFor({ timeout: 180_000 });
    const canvas = page.locator(".loginSceneCanvas");
    await page.evaluate(() => {
      window.__sceneStep = 1;
    });
    const part = await canvas.getAttribute("data-daypart");
    if (part !== "dusk") throw new Error(`Expected dusk, received ${part}`);
    await page.addStyleTag({ content: ".loginCardColumn { visibility: hidden !important; }" });
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Scene canvas has no bounds");
    await page.screenshot({ path: `/captures/still-${name}.png`, clip: box, timeout: 180_000 });
    console.log(`STILL ${name} elevation=${await canvas.getAttribute("data-sun-elevation")}`);
    await page.close();
  }
} finally {
  await browser.close();
}
```

`output/daylight-water-20260927/convert_stills.py`:

```python
"""현재 WebGL 장면 캡처를 로그인 대체 WebP로 변환한다."""

from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
source = Path(__file__).resolve().parent
target = root / "apps/web/public/images/login"

for name in ("desktop", "mobile"):
    png = source / f"still-{name}.png"
    webp = target / f"login-still-{name}.webp"
    with Image.open(png) as image:
        image.convert("RGB").save(webp, "WEBP", quality=90, method=6)
    with Image.open(webp) as image:
        print(f"{webp} {image.width}x{image.height} {webp.stat().st_size} bytes")
```

- [ ] **Step 2: 정지 이미지 생성과 재빌드**

```bash
set -o pipefail
docker compose -p ax-daylight-water-20260927 -f compose.yaml -f output/daylight-water-20260927/compose.test.yaml --profile test run --rm test node /captures/capture_stills.mjs 2>&1 | tee output/daylight-water-20260927/stills.log
python output/daylight-water-20260927/convert_stills.py
docker compose -p ax-daylight-water-20260927 -f compose.yaml -f output/daylight-water-20260927/compose.test.yaml --profile test build test-web test 2>&1 | tee output/daylight-water-20260927/build-final.log
docker compose -p ax-daylight-water-20260927 -f compose.yaml -f output/daylight-water-20260927/compose.test.yaml --profile test up -d --force-recreate test-web
```

Expected: `STILL desktop`, `STILL mobile` 두 줄(고도 약 -3), WebP 두 파일의 크기 출력, 빌드 exit 0. 두 PNG를 Read 도구로 열어 폼과 HTML 문구가 없는지 확인한다.

- [ ] **Step 3: 로그인 e2e**

```bash
set -o pipefail
docker compose -p ax-daylight-water-20260927 -f compose.yaml -f output/daylight-water-20260927/compose.test.yaml --profile test run --rm test pnpm exec playwright test tests/e2e/login-scene.spec.ts tests/e2e/login-water.spec.ts 2>&1 | tee output/daylight-water-20260927/e2e.log
```

Expected: 19개 모두 통과, skip 0. 기존 16개에 새 검사 3개(카드 위 포인터, 수면 탭, 법선 지도 실패 대체)를 더한 수다. 입력 중 해 정지와 호버 복귀는 기존 검사 안에 추가한 단언이라 개수에 더하지 않는다. 실패하면 `output/playwright-test`의 결과를 보존하고 원인을 조사한 뒤 해당 검사만 재실행하고, 전체 재실행 여부를 기록에 구분해 적는다.

- [ ] **Step 4: 최종 정적 검사와 단위 검사**

Run: `set -o pipefail; pnpm check && pnpm test 2>&1 | tee output/daylight-water-20260927/unit.log`
Expected: exit 0.

- [ ] **Step 5: 확인용 데모 적용**

```bash
docker tag ax-daylight-water-runtime:20260927 ax-starter-water:local
docker tag ax-daylight-water-tools:20260927 ax-starter-water-tools:local
docker compose -p ax-water-demo-20260926 -f compose.yaml -f output/water-production/compose.demo.yaml --profile local up -d --no-build --force-recreate web worker
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18700/login
docker inspect --format "{{.Image}}" ax-water-demo-20260926-web-1
docker image inspect --format "{{.Id}}" ax-daylight-water-runtime:20260927
```

Expected: HTTP 200, 두 이미지 ID 일치. migrate/seed는 실행하지 않는다.

- [ ] **Step 6: 일회성 자원 정리**

```bash
docker compose -p ax-daylight-water-20260927 -f compose.yaml -f output/daylight-water-20260927/compose.test.yaml ps -a --format "{{.Name}} {{.Label \"com.docker.compose.project\"}}"
docker compose -p ax-daylight-water-20260927 -f compose.yaml -f output/daylight-water-20260927/compose.test.yaml --profile test down --volumes --remove-orphans
docker ps -a --filter ancestor=ax-daylight-water-tools:20260927 --format "{{.Names}}"
docker image rm ax-daylight-water-tools:20260927
```

첫 명령에서 모든 컨테이너의 프로젝트 라벨이 `ax-daylight-water-20260927`인지 확인한 뒤 정리한다. tools 태그는 참조 컨테이너가 없을 때만 지운다(`ax-starter-water-tools:local` 태그가 같은 이미지를 가리키므로 태그만 사라진다). 데모가 쓰는 runtime 이미지는 지우지 않는다.

- [ ] **Step 7: 출처와 문서 기록**

1. `provenance.json`의 두 값을 다음 문장으로 바꾼다.
   - `stills`: `"login-still-desktop.webp and login-still-mobile.webp were recaptured on 2026-09-27 from this project's WebGL scene at dusk in the continuous day cycle (sun elevation about -3 degrees, cycle time 107.74 s), using the 26-block Blender glass-material GLB and the baked water normal map. The real login card and HTML slogan were hidden during capture, so neither is baked into the images. Reproduction and WebP conversion: output/daylight-water-20260927/capture_stills.mjs and convert_stills.py."`
   - `water_scene`: `"apps/web/app/login/isu-water-scene.ts uses the authored Blender block model and its embedded blue-glass material. A 120-second continuous day cycle (isu-day-cycle.ts) moves the sun from behind the camera in the east, over the south, to the western horizon ahead. A single-scattering atmosphere (isu-atmosphere.ts, isu-sky.ts) derives the sky, sunlight, ambient light, water tint, and exposure from that sun direction. The water combines a local Three.js reflection with the baked normal map (water_normal), Fresnel reflectance, GGX sun glints, and horizon haze. Pointer motion over the water feeds a small wave-equation simulation (isu-ripples.ts), and a local point light briefly highlights the selected block. Bloom affects only the sun and glints. The three files in Downloads/참고이미지 were used for water, sun, and horizon visual guidance only; no pixels were copied into the app. The separate HTML slogan uses the local Geist font and an in-text pointer sheen."`
2. `docs/PROGRESS.md` 끝에 `## 2026-09-27 연속 하루와 수면 질감` 절을 추가한다. 성공 기준을 먼저 한 문단으로 적고, 실제로 실행한 명령과 결과(단위 검사 수, Blender 굽기 로그 값, fps 측정값, 캡처 경로, e2e 결과와 재실행 구분, 데모 이미지 ID, 정리 결과, 보존 파일 해시 대조)만 적는다. 설계와 다른 점 세 가지도 적는다.
3. `docs/LOGIN_VISUAL_HANDOFF_2026-09-27.md`를 고친다.
   - "수정할 때 찾을 파일" 표의 `| 장면 순서, 15초 및 5초, 해의 궤도 | ... isu-water-moods.ts ... |` 행을 다음 다섯 행으로 바꾼다.

     ```markdown
     | 하루 주기와 해 궤적(2분, 밤 가속) | `apps/web/app/login/isu-day-cycle.ts` |
     | 대기 산란 상수와 CPU 조명 색 | `apps/web/app/login/isu-atmosphere.ts` |
     | 하늘 LUT, 해 원판, 별 | `apps/web/app/login/isu-sky.ts` |
     | 호버 물결 파동 계산 | `apps/web/app/login/isu-ripples.ts` |
     | 수면 법선 지도 굽기 | `tools/blender/bake_water_normals.py`, `apps/web/public/images/login/water-normal.webp` |
     ```

   - 같은 표의 관련 검사 행에서 `tests/unit/isu-water-moods.test.ts`를 `tests/unit/isu-day-cycle.test.ts`, `tests/unit/isu-atmosphere.test.ts`로 바꾼다.
   - "현재 화면과 결정"에서 `장면은 첫 진입만 무작위다.`로 시작하는 항목을 다음으로 바꾼다: `- 장면은 2분 연속 하루다. 첫 진입 시각만 무작위다. 해는 카메라 뒤(북동)에서 떠서 왼쪽 위(남쪽)를 지나 U와 로그인 카드 사이 수평선(북서)으로 진다. 해가 떠 있는 동안 일정한 속도로 움직이고 완전한 밤은 약 15초로 빠르게 지나간다. 하늘, 햇빛, 주변광, 물속 색, 노출은 모두 해 위치에서 계산한다. 비 장면은 없다.`
   - `해는 일출에서 수평선 아래로부터`로 시작하는 항목을 다음으로 바꾼다: `- 수면은 Blender에서 구운 잔물결 법선 세 겹, 각도별 반사율, GGX 햇빛 반짝임, 수평선 안개를 쓴다. 해가 정면에 있을 때만 빛길이 생긴다. 수면 위 포인터와 탭은 작은 파동 계산 물결을 만들고 약 1.5초 안에 사라진다. 블록에 마우스를 올리거나 터치하면 해당 위치의 작은 빛이 반응한다.`
4. 금지 문자 검사: `LC_ALL=C.UTF-8 grep -rnP "[\x{00B7}\x{2013}\x{2014}]" apps/web/app/login tools/blender/bake_water_normals.py tests/unit/isu-day-cycle.test.ts tests/unit/isu-atmosphere.test.ts tests/e2e/login-water.spec.ts tests/e2e/login-scene.spec.ts docs/PROGRESS.md docs/LOGIN_VISUAL_HANDOFF_2026-09-27.md docs/superpowers/specs/2026-09-27-login-daylight-water-design.md docs/superpowers/plans/2026-09-27-login-daylight-water.md apps/web/public/images/login/provenance.json` 결과 없음(exit 1).
5. `git diff --check` exit 0, `sha256sum -c output/daylight-water-20260927/preserved-files.sha256` 모두 OK.

- [ ] **Step 8: 완료 보고**

변경 파일 목록, 검사 결과, 데모 주소(`http://127.0.0.1:18700/login`), 남은 제한(실제 사용자 GPU별 fps 미측정 범위, 모바일 일몰 구도)을 보고한다. 커밋과 푸시는 사용자가 요청할 때만 한다.
