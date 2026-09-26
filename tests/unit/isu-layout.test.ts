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

  it("uses 27 blocks: I 6, S 10, U 11", () => {
    expect(blocks).toHaveLength(27);
    expect(byLetter("i")).toHaveLength(6);
    expect(byLetter("s")).toHaveLength(10);
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

  it("marks the bottom course", () => {
    const bottom = blocks.filter((block) => block.course === 0);
    expect(bottom).toHaveLength(7);
    for (const block of bottom)
      expect(blockBounds(block).min[1]).toBeCloseTo(BLOCK_GAP / 2, 6);
  });

  it("S middle courses are slanted slabs that follow the logo", () => {
    for (const block of blocks) expect("rotation" in block).toBe(false);

    const slanted = blocks.filter((block) => block.outline);
    expect(slanted).toHaveLength(4);
    for (const block of slanted) expect(block.letter).toBe("s");

    // world-space outline points; BlockSpec stores outline relative to center.
    const worldPoints = (block: (typeof blocks)[number]) =>
      block.outline!.map(
        ([x, y]) => [x + block.center[0], y + block.center[1]] as const,
      );
    const courses = slanted
      .map((block) => {
        const points = worldPoints(block);
        const ys = points.map(([, y]) => y);
        const topY = Math.max(...ys);
        const bottomY = Math.min(...ys);
        const top = points.filter(([, y]) => y === topY);
        const bottom = points.filter(([, y]) => y === bottomY);
        return { top, bottom, topY, bottomY };
      })
      // top to bottom: the highest course has the largest world y.
      .sort((a, b) => b.topY - a.topY);

    for (const { top, bottom } of courses) {
      expect(top).toHaveLength(2);
      expect(bottom).toHaveLength(2);
      expect(top[0][1]).toBeCloseTo(top[1][1], 6);
      expect(bottom[0][1]).toBeCloseTo(bottom[1][1], 6);
    }
    for (let index = 0; index < courses.length - 1; index++) {
      const gap = courses[index].bottomY - courses[index + 1].topY;
      expect(gap).toBeCloseTo(BLOCK_GAP, 6);
    }
    // within each course the slanted side moves right from top to bottom,
    // and that rightward drift keeps going from one course's bottom edge to the next's.
    const bottomLeftX = (course: (typeof courses)[number]) =>
      Math.min(...course.bottom.map(([x]) => x));
    const bottomRightX = (course: (typeof courses)[number]) =>
      Math.max(...course.bottom.map(([x]) => x));
    for (const course of courses) {
      const topLeftX = Math.min(...course.top.map(([x]) => x));
      const topRightX = Math.max(...course.top.map(([x]) => x));
      expect(bottomLeftX(course)).toBeGreaterThan(topLeftX);
      expect(bottomRightX(course)).toBeGreaterThan(topRightX);
    }
    for (let index = 0; index < courses.length - 1; index++) {
      expect(bottomLeftX(courses[index + 1])).toBeGreaterThan(
        bottomLeftX(courses[index]),
      );
      expect(bottomRightX(courses[index + 1])).toBeGreaterThan(
        bottomRightX(courses[index]),
      );
    }
  });
});
