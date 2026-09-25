import { describe, expect, it } from "vitest";
import {
  BLOCK_GAP,
  blockBounds,
  buildIsuLayout,
  LETTER_HEIGHT,
  type Letter,
} from "../../apps/web/app/login/isu-layout";

describe("ISU block layout measured from the logo", () => {
  const blocks = buildIsuLayout();
  const byLetter = (letter: Letter) =>
    blocks.filter((block) => block.letter === letter);
  const span = (letter: Letter, axis: 0 | 1) => {
    const bounds = byLetter(letter)
      .filter((block) => !block.dot)
      .map(blockBounds);
    return [
      Math.min(...bounds.map((value) => value.min[axis])),
      Math.max(...bounds.map((value) => value.max[axis])),
    ];
  };

  it("uses 26 blocks: I 5 plus the green dot, S 9, U 11", () => {
    expect(blocks).toHaveLength(26);
    expect(byLetter("i")).toHaveLength(6);
    expect(byLetter("s")).toHaveLength(9);
    expect(byLetter("u")).toHaveLength(11);
  });

  it("puts the green dot diagonally at the upper left of the I stem", () => {
    const dots = blocks.filter((block) => block.dot);
    expect(dots).toHaveLength(1);
    const dot = blockBounds(dots[0]);
    const [stemLeft] = span("i", 0);
    const [, stemTop] = span("i", 1);
    expect(Math.abs(stemLeft - dot.max[0])).toBeLessThanOrEqual(
      BLOCK_GAP + 1e-6,
    );
    expect(Math.abs(dot.min[1] - stemTop)).toBeLessThanOrEqual(
      BLOCK_GAP + 1e-6,
    );
    const others = blocks
      .filter((block) => !block.dot)
      .map((block) => blockBounds(block).max[1]);
    expect(dot.min[1]).toBeGreaterThan(Math.max(...others));
  });

  it("orders I, S, U with gaps close to the logo", () => {
    const [, iRight] = span("i", 0);
    const [sLeft, sRight] = span("s", 0);
    const [uLeft] = span("u", 0);
    expect(sLeft - iRight).toBeGreaterThan(0.5);
    expect(sLeft - iRight).toBeLessThan(1);
    expect(uLeft - sRight).toBeGreaterThan(0.5);
    expect(uLeft - sRight).toBeLessThan(1);
  });

  it("is centered on x=0, stands on y=0 and stays under the letter height", () => {
    const bounds = blocks.map(blockBounds);
    const minX = Math.min(...bounds.map((value) => value.min[0]));
    const maxX = Math.max(...bounds.map((value) => value.max[0]));
    expect(Math.abs(minX + maxX)).toBeLessThan(1e-6);
    expect(Math.min(...bounds.map((value) => value.min[1]))).toBeCloseTo(
      BLOCK_GAP / 2,
      6,
    );
    const letterTop = Math.max(
      ...blocks
        .filter((block) => !block.dot)
        .map((block) => blockBounds(block).max[1]),
    );
    expect(letterTop).toBeLessThanOrEqual(LETTER_HEIGHT);
  });

  it("rounds only the four corners that are round in the logo", () => {
    const corners = blocks
      .filter((block) => block.corner !== "none")
      .map((block) => `${block.letter}:${block.corner}`)
      .sort();
    expect(corners).toEqual(["s:br", "s:tl", "u:bl", "u:br"]);
  });

  it("marks the bottom course and tilts the S spine", () => {
    const bottom = blocks.filter((block) => block.course === 0);
    expect(bottom).toHaveLength(7);
    for (const block of bottom)
      expect(blockBounds(block).min[1]).toBeCloseTo(BLOCK_GAP / 2, 6);
    const tilted = blocks.filter((block) => block.rotation !== 0);
    expect(tilted).toHaveLength(3);
    for (const block of tilted) {
      expect(block.letter).toBe("s");
      expect(block.rotation).toBeGreaterThan((-60 * Math.PI) / 180);
      expect(block.rotation).toBeLessThan((-40 * Math.PI) / 180);
    }
  });
});
