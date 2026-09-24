import Decimal from "decimal.js";

export type RoundingMode = "HALF_UP" | "DOWN" | "UP" | "HALF_EVEN";
export type NegativeRounding = "SAME" | "TOWARD_ZERO" | "AWAY_FROM_ZERO";
export type RoundingApplyAt = "intermediate" | "final";

export interface RoundingPolicy {
  id: string;
  target: string;
  effectiveFrom: string;
  unit: string;
  mode: RoundingMode;
  negative: NegativeRounding;
  applyAt: RoundingApplyAt;
  version: number;
}

const modeToDecimalRounding: Record<RoundingMode, Decimal.Rounding> = {
  HALF_UP: Decimal.ROUND_HALF_UP,
  DOWN: Decimal.ROUND_DOWN,
  UP: Decimal.ROUND_UP,
  HALF_EVEN: Decimal.ROUND_HALF_EVEN,
};

export function selectRoundingPolicy(
  policies: RoundingPolicy[],
  target: string,
  asOf: string,
): RoundingPolicy | undefined {
  return policies
    .filter(
      (policy) => policy.target === target && policy.effectiveFrom <= asOf,
    )
    .sort(
      (a, b) =>
        b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version,
    )[0];
}

export function roundToUnit(value: string, policy: RoundingPolicy): string {
  const PolicyDecimal = Decimal.clone({
    rounding: modeToDecimalRounding[policy.mode],
  });
  const amount = new PolicyDecimal(value);
  const unit = new PolicyDecimal(policy.unit);

  let rounding = modeToDecimalRounding[policy.mode];
  if (amount.isNegative() && policy.negative === "TOWARD_ZERO") {
    rounding = Decimal.ROUND_DOWN;
  } else if (amount.isNegative() && policy.negative === "AWAY_FROM_ZERO") {
    rounding = Decimal.ROUND_UP;
  }

  return amount
    .dividedBy(unit)
    .toDecimalPlaces(0, rounding)
    .times(unit)
    .toString();
}
