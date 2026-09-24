import { describe, expect, it } from "vitest";
import {
  roundToUnit,
  selectRoundingPolicy,
  type RoundingPolicy,
} from "../../packages/core/decimal";

const policy: RoundingPolicy = {
  id: "demo",
  target: "demo-amount",
  effectiveFrom: "2026-01-01",
  unit: "0.1",
  mode: "HALF_UP",
  negative: "SAME",
  applyAt: "final",
  version: 1,
};

describe("roundToUnit", () => {
  it("rounds positive and negative values with the selected mode", () => {
    expect(roundToUnit("1.25", policy)).toBe("1.3");
    expect(roundToUnit("-1.25", policy)).toBe("-1.3");
  });

  it("applies toward-zero and away-from-zero rules to negative values", () => {
    expect(roundToUnit("-1.26", { ...policy, negative: "TOWARD_ZERO" })).toBe(
      "-1.2",
    );
    expect(
      roundToUnit("-1.21", { ...policy, negative: "AWAY_FROM_ZERO" }),
    ).toBe("-1.3");
  });

  it("supports the configured decimal rounding modes", () => {
    expect(roundToUnit("1.25", { ...policy, mode: "HALF_EVEN" })).toBe("1.2");
    expect(roundToUnit("1.21", { ...policy, mode: "UP" })).toBe("1.3");
    expect(roundToUnit("1.29", { ...policy, mode: "DOWN" })).toBe("1.2");
  });
});

describe("selectRoundingPolicy", () => {
  const earlier = { ...policy, id: "earlier" };
  const effective = { ...policy, id: "effective", effectiveFrom: "2026-04-01" };
  const sameDateNewerVersion = { ...effective, id: "v2", version: 2 };

  it("uses an inclusive effective date and the highest version on a tie", () => {
    expect(
      selectRoundingPolicy(
        [earlier, effective, sameDateNewerVersion],
        "demo-amount",
        "2026-04-01",
      )?.id,
    ).toBe("v2");
  });

  it("keeps the previous policy effective before the boundary", () => {
    expect(
      selectRoundingPolicy([earlier, effective], "demo-amount", "2026-03-31")
        ?.id,
    ).toBe("earlier");
  });
});
