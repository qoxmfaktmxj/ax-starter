import { describe, expect, it } from "vitest";
import {
  createLoginMotion,
  SHAKE_SECONDS,
  SHARE_SECONDS,
  shareIntensity,
} from "../../apps/web/app/login/login-motion";

describe("login motion", () => {
  it("eases calm toward the target and back", () => {
    const motion = createLoginMotion();
    motion.calm(true);
    let frame = motion.update(0.1);
    expect(frame.calm).toBeGreaterThan(0);
    expect(frame.calm).toBeLessThan(1);
    for (let step = 0; step < 60; step++) frame = motion.update(0.05);
    expect(frame.calm).toBeGreaterThan(0.99);
    motion.calm(false);
    for (let step = 0; step < 60; step++) frame = motion.update(0.05);
    expect(frame.calm).toBeLessThan(0.01);
  });

  it("shakes for 0.3 seconds then stops", () => {
    const motion = createLoginMotion();
    expect(motion.update(0.01).shake).toBe(0);
    motion.shake();
    expect(Math.abs(motion.update(0.01).shake)).toBeGreaterThan(0.1);
    expect(motion.update(SHAKE_SECONDS).shake).toBe(0);
  });

  it("spreads the share light over 1.2 seconds and keeps it lit", () => {
    const motion = createLoginMotion();
    expect(motion.update(0.5).share).toBe(0);
    motion.share();
    expect(motion.update(SHARE_SECONDS / 2).share).toBeCloseTo(0.5, 5);
    expect(motion.update(SHARE_SECONDS).share).toBe(1);
    expect(motion.update(1).share).toBe(1);
  });

  it("lights near blocks first and every block by the end", () => {
    expect(shareIntensity(0.1, 0, 6)).toBeGreaterThan(0);
    expect(shareIntensity(0.1, 6, 6)).toBe(0);
    expect(shareIntensity(1, 6, 6)).toBe(1);
  });
});
