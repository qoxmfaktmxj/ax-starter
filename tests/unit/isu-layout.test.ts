import { describe, expect, it } from "vitest";
import {
  blockBounds,
  buildIsuLayout,
  LETTER_HEIGHT,
  type ArcBlock,
  type Letter,
} from "../../apps/web/app/login/isu-layout";

describe("ISU block layout", () => {
  const blocks = buildIsuLayout();

  it("uses 30 to 40 blocks with exactly one dot on the i", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(30);
    expect(blocks.length).toBeLessThanOrEqual(40);
    const dots = blocks.filter((block) => block.dot);
    expect(dots).toHaveLength(1);
    expect(dots[0].letter).toBe("i");
    expect(dots[0].center[1]).toBe(
      Math.max(...blocks.map((block) => block.center[1])),
    );
  });

  it("orders the letters i, s, u from left to right without overlap", () => {
    const span = (letter: Letter) => {
      const bounds = blocks
        .filter((block) => block.letter === letter)
        .map(blockBounds);
      return [
        Math.min(...bounds.map((value) => value.min[0])),
        Math.max(...bounds.map((value) => value.max[0])),
      ];
    };
    const [i, s, u] = (["i", "s", "u"] as const).map(span);
    expect(i[1]).toBeLessThan(s[0]);
    expect(s[1]).toBeLessThan(u[0]);
  });

  it("is centered on x=0 and stands on y=0", () => {
    const bounds = blocks.map(blockBounds);
    const minX = Math.min(...bounds.map((value) => value.min[0]));
    const maxX = Math.max(...bounds.map((value) => value.max[0]));
    expect(Math.abs(minX + maxX)).toBeLessThan(1e-6);
    expect(
      Math.min(...bounds.map((value) => value.min[1])),
    ).toBeGreaterThanOrEqual(-1e-6);
    const letterTop = Math.max(
      ...blocks
        .filter((block) => !block.dot)
        .map((block) => blockBounds(block).max[1]),
    );
    expect(letterTop).toBeLessThanOrEqual(LETTER_HEIGHT + 1e-6);
  });

  it("leaves a gap between neighboring blocks of the same arc", () => {
    const groups = new Map<string, ArcBlock[]>();
    for (const block of blocks) {
      if (block.kind !== "arc") continue;
      const key = block.origin.join(",");
      groups.set(key, [...(groups.get(key) ?? []), block]);
    }
    expect(groups.size).toBe(3);
    for (const group of groups.values()) {
      const sorted = [...group].sort((a, b) => a.angles[0] - b.angles[0]);
      for (let index = 1; index < sorted.length; index++)
        expect(sorted[index].angles[0]).toBeGreaterThan(
          sorted[index - 1].angles[1],
        );
    }
  });
});
