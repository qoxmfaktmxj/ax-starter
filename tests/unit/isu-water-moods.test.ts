import { describe, expect, it } from "vitest";
import {
  advanceMood,
  HOLD_SECONDS,
  MOOD_ORDER,
  nextMood,
  randomMood,
  sunArc,
  TRANSITION_SECONDS,
  transitionStops,
} from "../../apps/web/app/login/isu-water-moods";

describe("water mood timeline", () => {
  it("randomizes only the first mood, then follows the approved order", () => {
    expect(randomMood(() => 0)).toBe("06");
    expect(randomMood(() => 0.999)).toBe("08");
    expect(MOOD_ORDER.map(nextMood)).toEqual([
      "10",
      "05",
      "04",
      "09",
      "08",
      "06",
    ]);
  });

  it("holds for 15 seconds, transitions for 5, and preserves elapsed wall time", () => {
    const start = { mood: "06" as const, phase: "hold" as const, elapsed: 0 };
    expect(advanceMood(start, HOLD_SECONDS - 1)).toEqual({
      ...start,
      elapsed: 14,
    });
    expect(advanceMood(start, HOLD_SECONDS)).toEqual({
      mood: "06",
      phase: "transition",
      elapsed: 0,
    });
    expect(advanceMood(start, HOLD_SECONDS + TRANSITION_SECONDS + 3)).toEqual({
      mood: "10",
      phase: "hold",
      elapsed: 3,
    });
  });

  it("returns from night directly to dawn", () => {
    expect(transitionStops("08", 0.25)).toEqual({
      from: "08",
      to: "06",
      mix: 0.15625,
    });
    expect(transitionStops("08", 0.5)).toEqual({
      from: "08",
      to: "06",
      mix: 0.5,
    });
    expect(transitionStops("08", 0.75)).toEqual({
      from: "08",
      to: "06",
      mix: 0.84375,
    });
  });

  it("raises the sun through dawn and lowers it below the horizon after sunset", () => {
    const at = (
      mood: "06" | "10" | "05" | "08",
      phase: "hold" | "transition",
      elapsed: number,
    ) => sunArc({ mood, phase, elapsed });
    expect(at("06", "hold", 0).height).toBeLessThan(0);
    expect(at("06", "hold", 14).height).toBeGreaterThan(0);
    expect(at("10", "hold", 7).height).toBeGreaterThan(
      at("06", "hold", 14).height,
    );
    expect(at("05", "hold", 14).height).toBeLessThan(0);
    expect(at("05", "transition", 5).strength).toBe(0);
    expect(at("08", "transition", 5).height).toBeCloseTo(
      at("06", "hold", 0).height,
    );
  });
});
