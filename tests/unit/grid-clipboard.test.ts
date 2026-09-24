import { describe, expect, it } from "vitest";
import {
  parseGridClipboard,
  serializeGridClipboard,
} from "../../packages/grid/clipboard";

describe("grid clipboard", () => {
  it("roundtrips quoted tabs, newlines, and doubled quotes", () => {
    const rows = [
      ["one", "tab\there", "line one\nline two", 'a "quote"'],
      ["two", "", "three", "four"],
    ];

    expect(parseGridClipboard(serializeGridClipboard(rows))).toEqual(rows);
  });

  it("preserves trailing empty cells", () => {
    expect(parseGridClipboard("one\t\t\r\ntwo\t\t")).toEqual([
      ["one", "", ""],
      ["two", "", ""],
    ]);
  });

  it("rejects an unclosed quoted cell", () => {
    expect(() => parseGridClipboard('one\t"unfinished')).toThrow(
      "복사한 값의 따옴표가 닫히지 않았습니다.",
    );
  });

  it("rejects rows with different cell counts", () => {
    expect(() => parseGridClipboard("one\ttwo\r\nthree")).toThrow(
      "복사한 데이터의 열 수가 일정하지 않습니다.",
    );
    expect(() => serializeGridClipboard([["one", "two"], ["three"]])).toThrow(
      "복사한 데이터의 열 수가 일정하지 않습니다.",
    );
  });
});
