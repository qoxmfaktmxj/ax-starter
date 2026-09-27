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
function firstTime(
  from: number,
  to: number,
  predicate: (time: number) => boolean,
) {
  for (let time = from; time < to; time += STEP)
    if (predicate(time)) return time;
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
    expect(noon.elevation).toBeCloseTo(61, 0);
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
