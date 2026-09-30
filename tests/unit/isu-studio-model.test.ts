import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import seasons from "../../apps/web/app/login/login-seasons.json";
it("contains the studio camera, 26 logo meshes and seasonal decorations", () => {
  const bytes = readFileSync(
    "apps/web/public/login-scene/studio/isu-studio.glb",
  );
  expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
  const json = JSON.parse(
    bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)),
  ) as {
    cameras: unknown[];
    nodes: { name?: string; mesh?: number; extras?: { isuDot?: boolean } }[];
  };
  expect(json.cameras.length).toBeGreaterThan(0);
  expect(
    json.nodes.filter(
      (node) => node.name?.startsWith("ISU") && node.mesh !== undefined,
    ),
  ).toHaveLength(26);
  expect(json.nodes.some((node) => node.extras?.isuDot)).toBe(true);
  for (const season of Object.values(seasons)) {
    for (const decoration of season.decorations)
      expect(
        json.nodes.some((node) =>
          node.name?.replaceAll(" ", "_").startsWith(`Season_${decoration}`),
        ),
      ).toBe(true);
  }
});
