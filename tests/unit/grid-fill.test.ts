import { describe, expect, it } from "vitest";
import { fillGridSeries } from "../../packages/grid/fill";

describe("fillGridSeries", () => {
  it("preserves existing values and repeats text and status seeds", () => {
    expect(fillGridSeries(["a", "b"], 1, "text")).toBe("b");
    expect(fillGridSeries(["a", "b"], 4, "text")).toBe("a");
    expect(fillGridSeries(["open", "closed"], 3, "status")).toBe("closed");
    expect(fillGridSeries([], 0, "text")).toBe("");
  });

  it("advances a single date seed by UTC days across leap day", () => {
    expect(fillGridSeries(["2024-02-28"], 1, "date")).toBe("2024-02-29");
    expect(fillGridSeries(["2024-02-28"], 2, "date")).toBe("2024-03-01");
  });

  it("extends constant date steps and repeats a non-series pattern", () => {
    expect(fillGridSeries(["2024-02-27", "2024-02-29"], 2, "date")).toBe(
      "2024-03-02",
    );
    expect(
      fillGridSeries(["2024-01-01", "2024-01-02", "2024-01-04"], 3, "date"),
    ).toBe("2024-01-01");
  });

  it("extends decimal series without losing large integer precision", () => {
    expect(
      fillGridSeries(
        ["900719925474099300000", "900719925474099300001"],
        2,
        "decimal",
      ),
    ).toBe("900719925474099300002");
    expect(fillGridSeries(["1.25", "1.50"], 3, "decimal")).toBe("2");
  });

  it("repeats one decimal seed and non-series decimal patterns", () => {
    expect(fillGridSeries(["1.00"], 4, "decimal")).toBe("1.00");
    expect(fillGridSeries(["12345678901234567890.01"], 4, "decimal")).toBe(
      "12345678901234567890.01",
    );
    expect(fillGridSeries(["1", "2", "4"], 4, "decimal")).toBe("2");
  });
});
