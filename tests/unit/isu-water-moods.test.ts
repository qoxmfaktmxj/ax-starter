import { describe, expect, it } from "vitest";
import {
  advanceMood,
  HOLD_SECONDS,
  MOOD_ORDER,
  nextMood,
  randomMood,
  TRANSITION_SECONDS,
  transitionStops,
} from "../../apps/web/app/login/isu-water-moods";

describe("water mood timeline", () => {
  it("randomizes only the first mood, then follows the approved order", () => {
    expect(randomMood(() => 0)).toBe("10");
    expect(randomMood(() => 0.999)).toBe("08");
    expect(MOOD_ORDER.map(nextMood)).toEqual([
      "06",
      "05",
      "04",
      "09",
      "08",
      "10",
    ]);
  });

  it("holds for 45 seconds, transitions for 15, and preserves elapsed wall time", () => {
    const start = { mood: "06" as const, phase: "hold" as const, elapsed: 0 };
    expect(advanceMood(start, HOLD_SECONDS - 1)).toEqual({
      ...start,
      elapsed: 44,
    });
    expect(advanceMood(start, HOLD_SECONDS)).toEqual({
      mood: "06",
      phase: "transition",
      elapsed: 0,
    });
    expect(advanceMood(start, HOLD_SECONDS + TRANSITION_SECONDS + 3)).toEqual({
      mood: "05",
      phase: "hold",
      elapsed: 3,
    });
  });

  it("passes through lavender dawn before returning from dark mirror to white", () => {
    expect(transitionStops("08", 0.25)).toEqual({
      from: "08",
      to: "04",
      mix: 0.5,
    });
    expect(transitionStops("08", 0.5)).toEqual({
      from: "04",
      to: "10",
      mix: 0,
    });
    expect(transitionStops("08", 0.75)).toEqual({
      from: "04",
      to: "10",
      mix: 0.5,
    });
  });
});
