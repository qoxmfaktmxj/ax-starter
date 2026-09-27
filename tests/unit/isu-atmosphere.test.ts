import { describe, expect, it } from "vitest";
import {
  ATMOSPHERE_GLSL,
  luminance,
  skyRadiance,
  sunTransmittance,
} from "../../apps/web/app/login/isu-atmosphere";

const sunAtElevation = (degrees: number) => {
  const radians = (degrees * Math.PI) / 180;
  return { x: 0, y: Math.sin(radians), z: -Math.cos(radians) };
};
const up = { x: 0, y: 1, z: 0 };

describe("login atmosphere", () => {
  it("paints a blue zenith at midday", () => {
    const [red, green, blue] = skyRadiance(up, sunAtElevation(60));
    expect(blue).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(red);
  });

  it("reddens low sunlight and the sky toward the setting sun", () => {
    const [red, green, blue] = sunTransmittance(sunAtElevation(3));
    expect(red).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(blue);
    expect(red / blue).toBeGreaterThan(3);
    const [skyRed, skyGreen, skyBlue] = skyRadiance(
      { x: 0, y: 0.02, z: -1 },
      sunAtElevation(3),
    );
    expect(skyRed).toBeGreaterThan(skyGreen);
    expect(skyGreen).toBeGreaterThan(skyBlue);
  });

  it("blocks direct sunlight below the horizon and fades to the night floor", () => {
    expect(sunTransmittance(sunAtElevation(-2))).toEqual([0, 0, 0]);
    const noon = luminance(skyRadiance(up, sunAtElevation(60)));
    const night = skyRadiance(up, sunAtElevation(-20));
    expect(luminance(night)).toBeLessThan(noon * 0.04);
    expect(night[2]).toBeGreaterThan(night[0]);
  });

  it("shares its constants with the sky shader", () => {
    expect(ATMOSPHERE_GLSL).toContain("vec3 atmosphereRadiance(");
    expect(ATMOSPHERE_GLSL).toContain("0.005802");
    expect(ATMOSPHERE_GLSL).not.toContain("NaN");
  });
});
