import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIsuLayout } from "../../apps/web/app/login/isu-layout";

describe("Blender layout input", () => {
  it("matches buildIsuLayout() exactly", () => {
    const exported = JSON.parse(
      readFileSync("tools/blender/isu-layout.json", "utf8"),
    );
    expect(exported).toEqual(buildIsuLayout());
  });
});
