// 로그인 배경의 하루 2분 주기. 카메라는 서쪽(-z)을 본다. +z는 동쪽(카메라 뒤), +x는 북쪽(오른쪽), +y는 위다.
// 해는 오른쪽 뒤(북동)에서 떠서 왼쪽 위(남쪽)를 지나 정면 약간 오른쪽(북서)으로 진다.
export const DAY_SECONDS = 120;

// 위도 45도, 적위 +16도에 해당하는 궤적. 적위를 바꾸면 일몰 위치가 좌우로 움직인다.
// 16도면 데스크톱에서 해가 U와 로그인 카드 사이(화면 x 약 62%)로 진다.
const LATITUDE = (45 * Math.PI) / 180;
const DECLINATION = (16 * Math.PI) / 180;
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
