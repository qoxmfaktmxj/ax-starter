import { expect, test, type Page } from "@playwright/test";
import { fixturePassword } from "./login";

test.use({ reducedMotion: "no-preference" });

const canvas = (page: Page) => page.locator(".loginSceneCanvas");
const metric = async (page: Page, name: string) =>
  Number(await canvas(page).getAttribute(`data-${name}`));
const bounds = async (page: Page, line: "challenge" | "share") => {
  const raw = await canvas(page).getAttribute(`data-slogan-${line}-bounds`);
  if (!raw) throw new Error(`${line} projection is unavailable`);
  const values = JSON.parse(raw) as number[];
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value)))
    throw new Error(`${line} projection is invalid: ${raw}`);
  return values as [number, number, number, number];
};

async function inspectInk(
  page: Page,
  png: Buffer,
  box: [number, number, number, number],
  cssSize: { width: number; height: number },
  fill: [number, number, number],
) {
  return page.evaluate(
    async ({ base64, box, cssSize, fill }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const surface = document.createElement("canvas");
      surface.width = image.width;
      surface.height = image.height;
      const context = surface.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, image.width, image.height).data;
      const scaleX = image.width / cssSize.width;
      const scaleY = image.height / cssSize.height;
      const left = Math.max(0, Math.floor(box[0] * scaleX));
      const top = Math.max(0, Math.floor(box[1] * scaleY));
      const right = Math.min(
        image.width,
        Math.ceil((box[0] + box[2]) * scaleX),
      );
      const bottom = Math.min(
        image.height,
        Math.ceil((box[1] + box[3]) * scaleY),
      );
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (r: number, g: number, b: number) =>
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      const at = (x: number, y: number) => (y * image.width + x) * 4;
      const distance = (offset: number, rgb: number[]) =>
        Math.hypot(
          data[offset] - rgb[0],
          data[offset + 1] - rgb[1],
          data[offset + 2] - rgb[2],
        );
      const outline = [18, 43, 66];
      const ratios: number[] = [];
      let fillPixels = 0;
      let point: [number, number] | null = null;
      let pointDistance = Infinity;
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const offset = at(x, y);
          if (distance(offset, fill) > 48) continue;
          fillPixels++;
          const fromCenter = Math.hypot(
            x - (left + right) / 2,
            y - (top + bottom) / 2,
          );
          if (fromCenter < pointDistance) {
            pointDistance = fromCenter;
            point = [x / scaleX, y / scaleY];
          }
          const light = luminance(
            data[offset],
            data[offset + 1],
            data[offset + 2],
          );
          let dark = Infinity;
          for (let dy = -7; dy <= 7; dy++) {
            for (let dx = -7; dx <= 7; dx++) {
              if (dx * dx + dy * dy > 49) continue;
              const xx = x + dx,
                yy = y + dy;
              if (xx < 0 || xx >= image.width || yy < 0 || yy >= image.height)
                continue;
              const neighbor = at(xx, yy);
              if (distance(neighbor, outline) > 65) continue;
              dark = Math.min(
                dark,
                luminance(
                  data[neighbor],
                  data[neighbor + 1],
                  data[neighbor + 2],
                ),
              );
            }
          }
          if (Number.isFinite(dark))
            ratios.push((light + 0.05) / (dark + 0.05));
        }
      }
      ratios.sort((a, b) => a - b);
      return {
        fillPixels,
        pairedPixels: ratios.length,
        localContrast: ratios[Math.floor(ratios.length * 0.2)] ?? 0,
        point,
      };
    },
    { base64: png.toString("base64"), box, cssSize, fill },
  );
}

async function inspectCanvasLine(page: Page, line: "challenge" | "share") {
  const box = await bounds(page, line);
  const size = await canvas(page).evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
  }));
  expect(box[0]).toBeGreaterThanOrEqual(0);
  expect(box[1]).toBeGreaterThanOrEqual(0);
  expect(box[0] + box[2]).toBeLessThanOrEqual(size.width);
  expect(box[1] + box[3]).toBeLessThanOrEqual(size.height);
  const png = await canvas(page).screenshot();
  const fill: [number, number, number] =
    line === "challenge" ? [160, 200, 64] : [51, 169, 230];
  return inspectInk(page, png, box, size, fill);
}

function expectReadableInk(result: Awaited<ReturnType<typeof inspectInk>>) {
  expect(result.fillPixels).toBeGreaterThan(30);
  expect(result.pairedPixels).toBeGreaterThan(15);
  expect(result.localContrast).toBeGreaterThanOrEqual(3);
}

test("water, blocks and floating slogan respond to the pointer and settle", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 960, height: 540 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      /shader error|WebGLProgram/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.goto("/login");
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
  await expect(canvas(page)).toHaveAttribute("data-intro", "complete", {
    timeout: 90_000,
  });
  await expect(canvas(page)).toHaveAttribute("data-preview", "true");
  const first = await metric(page, "pointer-hits");
  await page.mouse.move(160, 410);
  await page.mouse.move(300, 445);
  await expect
    .poll(() => metric(page, "pointer-hits"), { timeout: 30_000 })
    .toBeGreaterThan(first);
  await expect
    .poll(() => metric(page, "ripple-energy"), { timeout: 30_000 })
    .toBeGreaterThan(0);

  const blue = await page.evaluate(
    async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const surface = document.createElement("canvas");
      surface.width = image.width;
      surface.height = image.height;
      const context = surface.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, image.width, image.height).data;
      let best: [number, number] | null = null;
      let brightness = -1;
      for (
        let y = Math.floor(image.height * 0.18);
        y < image.height * 0.65;
        y++
      ) {
        for (
          let x = Math.floor(image.width * 0.08);
          x < image.width * 0.55;
          x++
        ) {
          const i = (y * image.width + x) * 4;
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2];
          if (
            r < 115 &&
            g > 80 &&
            b > 145 &&
            b > g + 20 &&
            g > r + 35 &&
            g > brightness
          ) {
            brightness = g;
            best = [x, y];
          }
        }
      }
      return best;
    },
    (await canvas(page).screenshot()).toString("base64"),
  );
  expect(blue).not.toBeNull();
  const blockBox = await canvas(page).boundingBox();
  if (!blue || !blockBox)
    throw new Error("visible blue ISU block was not found");
  const blocksBefore = await metric(page, "block-hits");
  await page.mouse.move(blockBox.x + blue[0], blockBox.y + blue[1]);
  await expect
    .poll(() => metric(page, "block-hits"), { timeout: 30_000 })
    .toBeGreaterThan(blocksBefore);
  await expect
    .poll(() => metric(page, "open-amount"), { timeout: 30_000 })
    .toBeGreaterThan(0.05);

  const ink = await inspectCanvasLine(page, "challenge");
  expectReadableInk(ink);
  if (!ink.point) throw new Error("Challenge glyph interior was not found");
  const sloganBefore = await metric(page, "slogan-hits");
  await page.mouse.move(blockBox.x + ink.point[0], blockBox.y + ink.point[1]);
  await expect
    .poll(() => metric(page, "slogan-hits"), { timeout: 30_000 })
    .toBeGreaterThan(sloganBefore);
  await expect
    .poll(() => metric(page, "slogan-scatter"), { timeout: 30_000 })
    .toBeGreaterThan(0.01);
  await page.mouse.move(940, 15);
  await expect
    .poll(() => metric(page, "slogan-scatter"), { timeout: 90_000 })
    .toBeLessThan(0.02);
  expect(errors).toEqual([]);
});

for (const [name, seed, id] of [
  ["white", 0, "10"],
  ["obsidian", 0.99, "08"],
] as const) {
  test(`3D Challenge and successful Share keep local 3:1 contrast in ${name}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((value) => {
      Math.random = () => value;
    }, seed);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/employees**", async (route) => {
      await gate;
      await route.continue();
    });
    try {
      await page.goto("/login");
      await expect(canvas(page)).toHaveAttribute("data-ready", "true", {
        timeout: 60_000,
      });
      await expect(canvas(page)).toHaveAttribute("data-mood", id);
      await expect(canvas(page)).toHaveAttribute("data-intro", "complete", {
        timeout: 90_000,
      });
      expectReadableInk(await inspectCanvasLine(page, "challenge"));
      await page.getByLabel("아이디").fill("hr-admin");
      await page.getByLabel("비밀번호").fill(fixturePassword());
      await page.getByRole("button", { name: "로그인", exact: true }).click();
      await expect(page.locator(".loginPage")).toHaveAttribute(
        "data-shared",
        "true",
      );
      await expect
        .poll(() => metric(page, "share"), { timeout: 60_000 })
        .toBeGreaterThan(0.95);
      expectReadableInk(await inspectCanvasLine(page, "share"));
    } finally {
      release();
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
    await page.waitForURL("**/employees", { timeout: 15_000 });
  });
}

test("static slogan outline remains readable on a bright fallback surface", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(canvas(page)).toHaveAttribute("data-ready", "static");
  await page.addStyleTag({
    content: ".loginScene { background: #f0e6e0 !important; }",
  });
  const label = page.locator(".loginSloganChallenge");
  const box = await label.boundingBox();
  if (!box) throw new Error("fallback Challenge line is not visible");
  const ink = await inspectInk(
    page,
    await label.screenshot(),
    [0, 0, box.width, box.height],
    { width: box.width, height: box.height },
    [160, 200, 64],
  );
  expectReadableInk(ink);
});
