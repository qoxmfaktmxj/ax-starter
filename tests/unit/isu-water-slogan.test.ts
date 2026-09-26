import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createWaterSlogan } from "../../apps/web/app/login/isu-water-slogan";

const originalDocument = globalThis.document;
const originalFontFace = globalThis.FontFace;

class TestFontFace {
  async load() {
    return this;
  }
}

function installCanvas() {
  const fonts = { add: vi.fn(), delete: vi.fn() };
  const context = {
    measureText: () => ({ width: 56 }),
    strokeText: vi.fn(),
    fillText: vi.fn(),
  };
  vi.stubGlobal("FontFace", TestFontFace);
  vi.stubGlobal("document", {
    fonts,
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => context,
    }),
  });
  return fonts;
}

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.document = originalDocument;
  globalThis.FontFace = originalFontFace;
});

describe("water slogan", () => {
  it("keeps line opacity and returns scattered glyphs after repeated ripples", async () => {
    const fonts = installCanvas();
    const slogan = await createWaterSlogan();
    slogan.group.position.set(2, 4, 1);
    const meshes: THREE.Mesh[] = [];
    slogan.group.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    expect(
      meshes.filter((mesh) => mesh.name.startsWith("slogan-0-")).length,
    ).toBe(18);
    expect(
      meshes.filter((mesh) => mesh.name.startsWith("slogan-1-")).length,
    ).toBe(14);

    slogan.update(0, 0, 0, 0);
    expect((meshes.at(-1)?.material as THREE.MeshBasicMaterial).opacity).toBe(
      0.35,
    );
    slogan.pulse(new THREE.Vector3(2, 4.24, 1));
    let peak = 0;
    for (let frame = 1; frame <= 180; frame++) {
      if (frame === 30) slogan.pulse(new THREE.Vector3(2.5, 3.76, 1));
      slogan.update(frame / 60, 1 / 60, 1, 0);
      peak = Math.max(peak, slogan.group.userData.peakScatter as number);
    }
    expect(peak).toBeGreaterThan(0.025);
    expect(slogan.group.userData.peakScatter).toBeLessThan(0.002);
    expect((meshes.at(-1)?.material as THREE.MeshBasicMaterial).opacity).toBe(
      1,
    );
    expect(slogan.group.position.toArray()).toEqual([2, 4, 1]);

    slogan.dispose();
    expect(fonts.delete).toHaveBeenCalledOnce();
  });
});
