import { describe, expect, it } from "vitest";
import { hudLabel, pickHudPoints } from "../../apps/web/app/login/isu-hud";

describe("HUD point selection", () => {
  const points = [
    { id: 1, x: 10, y: 10, distance: 2.9 },
    { id: 2, x: 20, y: 20, distance: 0.4 },
    { id: 3, x: 30, y: 30, distance: 1.2 },
    { id: 4, x: 40, y: 40, distance: 0.8 },
  ];

  it("keeps points within reach, nearest first", () => {
    expect(pickHudPoints(points).map((point) => point.id)).toEqual([2, 4, 3]);
  });

  it("limits the number of points", () => {
    expect(pickHudPoints(points, 2)).toHaveLength(2);
  });

  it("labels blocks with stable two digit numbers", () => {
    for (const id of [1, 7, 26]) {
      expect(hudLabel(id)).toMatch(/^\d{2}$/);
      expect(hudLabel(id)).toBe(hudLabel(id));
    }
    expect(hudLabel(1)).not.toBe(hudLabel(2));
  });
});
