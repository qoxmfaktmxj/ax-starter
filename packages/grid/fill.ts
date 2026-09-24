import Decimal from "decimal.js";

type FillKind = "text" | "date" | "status" | "decimal";

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function fillDateSeries(values: string[], index: number): string {
  const dates = values.map(parseDate);
  if (dates.some((date) => date === null))
    return values[index % values.length] ?? "";

  const day = 24 * 60 * 60 * 1000;
  const timestamps = dates.map((date) => date?.getTime() ?? 0);
  const step = timestamps.length === 1 ? day : timestamps[1]! - timestamps[0]!;
  if (
    timestamps.some(
      (timestamp, position) =>
        position > 0 && timestamp - timestamps[position - 1]! !== step,
    )
  ) {
    return values[index % values.length] ?? "";
  }

  const result = new Date(
    timestamps.at(-1)! + step * (index - values.length + 1),
  );
  return Number.isNaN(result.getTime())
    ? (values[index % values.length] ?? "")
    : result.toISOString().slice(0, 10);
}

function fillDecimalSeries(values: string[], index: number): string {
  try {
    const precision =
      Math.max(20, ...values.map((value) => value.replace(/\D/g, "").length)) +
      String(index).length +
      2;
    const ExactDecimal = Decimal.clone({ precision });
    const decimals = values.map((value) => new ExactDecimal(value));
    if (decimals.length === 1) return values[0]!;

    const step = decimals[1]!.minus(decimals[0]!);
    if (
      decimals.some(
        (value, position) =>
          position > 0 && !value.minus(decimals[position - 1]!).eq(step),
      )
    ) {
      return values[index % values.length] ?? "";
    }

    return decimals
      .at(-1)!
      .plus(step.mul(index - values.length + 1))
      .toString();
  } catch {
    return values[index % values.length] ?? "";
  }
}

export function fillGridSeries(
  values: string[],
  index: number,
  kind: FillKind,
): string {
  if (index < values.length) return values[index] ?? "";
  if (values.length === 0) return "";
  if (kind === "date") return fillDateSeries(values, index);
  if (kind === "decimal") return fillDecimalSeries(values, index);
  return values[index % values.length] ?? "";
}
