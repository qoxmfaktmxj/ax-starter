import { expect, test, type Page } from "@playwright/test";
import { fixturePassword } from "./login";

test.use({ reducedMotion: "no-preference" });

const canvas = (page: Page) => page.locator(".loginSceneCanvas");
const slogan = (page: Page) => page.locator(".loginSlogan");
const metric = async (page: Page, name: string) =>
  Number(await canvas(page).getAttribute(`data-${name}`));
const lineSelector = (line: "Challenge" | "Share") =>
  line === "Challenge"
    ? ".loginSloganChallenge .loginSloganLetters"
    : ".loginSloganShare .loginSloganLetters";
async function sloganColor(page: Page, line: "Challenge" | "Share") {
  return page.locator(lineSelector(line)).evaluate((node) => {
    const channels = getComputedStyle(node).color.match(/\d+(?:\.\d+)?/g);
    if (!channels || channels.length < 3)
      throw new Error("slogan color is unavailable");
    return channels.slice(0, 3).map(Number);
  });
}

async function inspectInk(page: Page, line: "Challenge" | "Share") {
  const element = page.locator(lineSelector(line));
  const fill = await sloganColor(page, line);
  const png = await element.screenshot();
  return page.evaluate(
    async ({ base64, fill }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const surface = document.createElement("canvas");
      surface.width = image.width;
      surface.height = image.height;
      const context = surface.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, image.width, image.height).data;
      const at = (x: number, y: number) => (y * image.width + x) * 4;
      const distance = (offset: number, rgb: number[]) =>
        Math.hypot(
          data[offset] - rgb[0],
          data[offset + 1] - rgb[1],
          data[offset + 2] - rgb[2],
        );
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (offset: number) =>
        0.2126 * channel(data[offset]) +
        0.7152 * channel(data[offset + 1]) +
        0.0722 * channel(data[offset + 2]);
      let fillPixels = 0;
      const ratios: number[] = [];
      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const offset = at(x, y);
          if (distance(offset, fill) > 48) continue;
          fillPixels++;
          const neighbors: number[] = [];
          for (let dy = -7; dy <= 7; dy++) {
            for (let dx = -7; dx <= 7; dx++) {
              const radius = dx * dx + dy * dy;
              if (radius < 16 || radius > 49) continue;
              const xx = x + dx;
              const yy = y + dy;
              if (xx < 0 || xx >= image.width || yy < 0 || yy >= image.height)
                continue;
              const neighbor = at(xx, yy);
              if (distance(neighbor, fill) < 48) continue;
              const light = luminance(offset);
              const backdrop = luminance(neighbor);
              neighbors.push(
                (Math.max(light, backdrop) + 0.05) /
                  (Math.min(light, backdrop) + 0.05),
              );
            }
          }
          if (neighbors.length >= 4) {
            neighbors.sort((a, b) => a - b);
            ratios.push(neighbors[Math.floor(neighbors.length * 0.75)]);
          }
        }
      }
      ratios.sort((a, b) => a - b);
      return {
        fillPixels,
        pairedPixels: ratios.length,
        localContrast: ratios[Math.floor(ratios.length * 0.2)] ?? 0,
        fill,
      };
    },
    { base64: png.toString("base64"), fill },
  );
}

function expectVisibleInk(result: Awaited<ReturnType<typeof inspectInk>>) {
  expect(result.fillPixels).toBeGreaterThan(30);
  expect(result.pairedPixels).toBeGreaterThan(15);
}

function expectReadableInk(result: Awaited<ReturnType<typeof inspectInk>>) {
  expectVisibleInk(result);
  expect(result.localContrast).toBeGreaterThanOrEqual(3);
}

test("water and ISU blocks respond to the pointer without shader errors", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    Math.random = () => 0.49;
  });
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
  await page.mouse.move(0, 0);
  await expect
    .poll(() => metric(page, "ripple-energy"), { timeout: 3_000 })
    .toBeLessThan(0.02);

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
        y < image.height * 0.48;
        y++
      ) {
        for (
          let x = Math.floor(image.width * 0.08);
          x < image.width * 0.55;
          x++
        ) {
          const i = (y * image.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
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
  await expect
    .poll(() => metric(page, "block-light"), { timeout: 30_000 })
    .toBeGreaterThan(0.2);
  await page.mouse.move(0, 0);
  await expect
    .poll(() => metric(page, "block-light"), { timeout: 30_000 })
    .toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

test("pointer over the login card leaves the water still", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await expect(canvas(page)).toHaveAttribute("data-intro", "complete", {
    timeout: 90_000,
  });
  const panel = await page.locator(".loginPanel").boundingBox();
  if (!panel) throw new Error("login card is missing");
  const before = await metric(page, "pointer-hits");
  for (const [x, y] of [
    [0.2, 0.3],
    [0.5, 0.6],
    [0.8, 0.9],
  ])
    await page.mouse.move(
      panel.x + panel.width * x,
      panel.y + panel.height * y,
    );
  await page.waitForTimeout(1_500);
  expect(await metric(page, "pointer-hits")).toBe(before);
  expect(await metric(page, "ripple-energy")).toBe(0);
});

test("visible slogan sits 24 to 32 pixels above the desktop login card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  const text = await slogan(page).boundingBox();
  const panel = await page.locator(".loginPanel").boundingBox();
  if (!text || !panel) throw new Error("slogan or login card is missing");
  const gap = panel.y - (text.y + text.height);
  expect(gap).toBeGreaterThanOrEqual(24);
  expect(gap).toBeLessThanOrEqual(32);
  expect(Math.abs(text.x - panel.x)).toBeLessThanOrEqual(2);
  await expect(
    page.locator(".loginSloganChallenge .loginSloganLetters"),
  ).toBeVisible();
  await expect(
    page.locator(".loginSloganShare .loginSloganLetters"),
  ).toBeVisible();
  await expect(slogan(page)).toHaveCSS("opacity", "1");
});

test("mobile slogan and card fit without overlap or horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login?material=metal");
  await expect(canvas(page)).toHaveAttribute("data-ready", "static");
  const text = await slogan(page).boundingBox();
  const panel = await page.locator(".loginPanel").boundingBox();
  const scene = await page.locator(".loginScene").boundingBox();
  if (!text || !panel || !scene)
    throw new Error("mobile login layout is incomplete");
  expect(text.y + text.height).toBeLessThan(panel.y);
  expect(scene.y + scene.height).toBeLessThanOrEqual(panel.y);
  expect(text.x).toBeGreaterThanOrEqual(0);
  expect(text.x + text.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(await sloganColor(page, "Challenge")).toEqual([153, 202, 60]);
  expect(await sloganColor(page, "Share")).toEqual([0, 143, 212]);
  expectReadableInk(await inspectInk(page, "Challenge"));
  expect(
    await page
      .locator(".loginScene")
      .evaluate((element) => getComputedStyle(element).backgroundPositionY),
  ).toBe("0%");
  const capture = await page.screenshot({
    path: "output/isu-ci-20260927/login-mobile.png",
    fullPage: true,
  });
  const logo = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const surface = document.createElement("canvas");
    surface.width = image.width;
    surface.height = image.height;
    const context = surface.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let greenCount = 0;
    let greenTop = Infinity;
    let blueTop = Infinity;
    let blueBottom = -Infinity;
    const blueBands = [0, 0, 0];
    for (let y = 0; y < 310; y++) {
      for (let x = 0; x < image.width; x++) {
        const offset = (y * image.width + x) * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        if (r > 55 && g > r + 8 && g > b + 25 && b < 190) {
          greenCount++;
          greenTop = Math.min(greenTop, y);
        }
        if (
          x >= image.width * 0.22 &&
          r < 80 &&
          g > 40 &&
          b > 75 &&
          b > g + 25 &&
          g > r + 25
        ) {
          blueTop = Math.min(blueTop, y);
          blueBottom = Math.max(blueBottom, y);
          blueBands[Math.min(2, Math.floor((x / image.width) * 3))]++;
        }
      }
    }
    return { greenCount, greenTop, blueTop, blueBottom, blueBands };
  }, capture.toString("base64"));
  expect(logo.greenCount).toBeGreaterThan(60);
  expect(logo.greenTop).toBeLessThan(logo.blueTop);
  expect(logo.blueBottom - logo.blueTop).toBeGreaterThan(85);
  for (const count of logo.blueBands) expect(count).toBeGreaterThan(200);
});

test("slogan sheen follows the pointer without moving its text", async ({
  page,
}) => {
  await page.goto("/login");
  const text = page.locator(".loginSloganChallenge .loginSloganLetters");
  const box = await text.boundingBox();
  if (!box) throw new Error("slogan text is missing");
  const opacity = () =>
    text.evaluate((element) => getComputedStyle(element, "::after").opacity);
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await expect.poll(opacity).toBe("0.8");
  expect(
    await text.evaluate(
      (element) => getComputedStyle(element, "::after").backgroundImage,
    ),
  ).toContain("rgb(224, 240, 196)");
  const first = await text.evaluate((element) =>
    parseFloat(getComputedStyle(element).getPropertyValue("--slogan-sheen-x")),
  );
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  const second = await text.evaluate((element) =>
    parseFloat(getComputedStyle(element).getPropertyValue("--slogan-sheen-x")),
  );
  expect(second).toBeGreaterThan(first);
  await expect(text).toHaveCSS("transform", "none");
  await page.mouse.move(0, 0);
  await expect.poll(opacity).toBe("0");
  const share = page.locator(".loginSloganShare .loginSloganLetters");
  const shareBox = await share.boundingBox();
  if (!shareBox) throw new Error("Share text is missing");
  await page.mouse.move(
    shareBox.x + shareBox.width / 2,
    shareBox.y + shareBox.height / 2,
  );
  await expect
    .poll(() =>
      share.evaluate((element) => getComputedStyle(element, "::after").opacity),
    )
    .toBe("0.8");
  expect(
    await share.evaluate(
      (element) => getComputedStyle(element, "::after").backgroundImage,
    ),
  ).toContain("rgb(179, 221, 242)");
});

test.describe("touch input", () => {
  test.use({ hasTouch: true });

  test("touching an ISU block briefly lights it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await expect(canvas(page)).toHaveAttribute("data-ready", "true", {
      timeout: 60_000,
    });
    await expect(canvas(page)).toHaveAttribute("data-intro", "complete", {
      timeout: 90_000,
    });
    const before = await metric(page, "block-hits");
    const observed = page.evaluate(
      (initialHits) =>
        new Promise<{ hits: number; light: number }>((resolve) => {
          const surface =
            document.querySelector<HTMLElement>(".loginSceneCanvas")!;
          let hits = initialHits;
          let light = 0;
          const inspect = () => {
            hits = Math.max(hits, Number(surface.dataset.blockHits));
            light = Math.max(light, Number(surface.dataset.blockLight));
          };
          const observer = new MutationObserver(inspect);
          observer.observe(surface, {
            attributes: true,
            attributeFilter: ["data-block-hits", "data-block-light"],
          });
          window.setTimeout(() => {
            observer.disconnect();
            resolve({ hits, light });
          }, 12000);
        }),
      before,
    );
    await page.touchscreen.tap(105, 180);
    const result = await observed;
    expect(result.hits).toBeGreaterThan(before);
    expect(result.light).toBeGreaterThan(0.2);
  });

  test("tapping the water starts a small ripple", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await expect(canvas(page)).toHaveAttribute("data-intro", "complete", {
      timeout: 90_000,
    });
    const box = await canvas(page).boundingBox();
    if (!box) throw new Error("scene canvas is missing");
    const observed = page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const surface =
            document.querySelector<HTMLElement>(".loginSceneCanvas")!;
          let energy = 0;
          const observer = new MutationObserver(() => {
            energy = Math.max(energy, Number(surface.dataset.rippleEnergy));
          });
          observer.observe(surface, {
            attributes: true,
            attributeFilter: ["data-ripple-energy"],
          });
          window.setTimeout(() => {
            observer.disconnect();
            resolve(energy);
          }, 12000);
        }),
    );
    await page.touchscreen.tap(
      box.x + box.width * 0.5,
      box.y + box.height * 0.9,
    );
    expect(await observed).toBeGreaterThan(0);
  });

  test("a touch leaves the slogan readable and in place", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    const text = page.locator(".loginSloganChallenge .loginSloganLetters");
    const box = await text.boundingBox();
    if (!box) throw new Error("touch target text is missing");
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(text).toBeVisible();
    await expect(text).toHaveCSS("transform", "none");
    const after = await text.boundingBox();
    expect(after?.x).toBe(box.x);
    expect(after?.y).toBe(box.y);
  });
});

test("reduced motion removes the sheen and keeps the text visible", async ({
  page,
}) => {
  await page.goto("/login");
  const text = page.locator(".loginSloganChallenge .loginSloganLetters");
  const box = await text.boundingBox();
  if (!box) throw new Error("slogan text is missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect
    .poll(() =>
      text.evaluate((element) => getComputedStyle(element, "::after").opacity),
    )
    .toBe("0.8");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas(page)).toHaveAttribute("data-ready", "static");
  await expect
    .poll(() =>
      text.evaluate((element) => getComputedStyle(element, "::after").opacity),
    )
    .toBe("0");
  await expect(text).toBeVisible();
  await expect(text).toHaveCSS("transform", "none");
});

for (const [name, seed, part] of [
  ["day", 0.5, "noon"],
  ["night", 0, "night"],
] as const) {
  test(`both slogans keep their fixed colors through sign-in in ${name}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((value) => {
      Math.random = () => value;
      const frame = window.requestAnimationFrame.bind(window);
      let sceneTime = 0;
      window.requestAnimationFrame = (callback) =>
        frame(() => {
          sceneTime += 20;
          callback(sceneTime);
        });
    }, seed);
    let employeeRequested = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/employees**", async (route) => {
      employeeRequested = true;
      await gate;
      await route.continue();
    });
    try {
      await page.goto("/login");
      await expect(canvas(page)).toHaveAttribute("data-ready", "true", {
        timeout: 60_000,
      });
      await expect(canvas(page)).toHaveAttribute("data-daypart", part);
      await expect(slogan(page)).toHaveCSS("opacity", "1");
      expect(await sloganColor(page, "Challenge")).toEqual([153, 202, 60]);
      expect(await sloganColor(page, "Share")).toEqual([0, 143, 212]);
      await expect(page.locator(".loginSloganShare")).toHaveCSS("opacity", "1");
      await page.getByLabel("아이디").fill("hr-admin");
      await page.getByLabel("비밀번호").fill(fixturePassword());
      await page.getByRole("button", { name: "로그인", exact: true }).click();
      await expect.poll(() => employeeRequested).toBe(true);
      await expect(page.locator(".loginSloganShare")).toHaveCSS("opacity", "1");
      expect(await sloganColor(page, "Challenge")).toEqual([153, 202, 60]);
      expect(await sloganColor(page, "Share")).toEqual([0, 143, 212]);
    } finally {
      release();
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
    await page.waitForURL("**/employees", { timeout: 15_000 });
  });
}

test("static slogan stays readable over its dark fallback surface", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(canvas(page)).toHaveAttribute("data-ready", "static");
  expect(await sloganColor(page, "Challenge")).toEqual([153, 202, 60]);
  expect(await sloganColor(page, "Share")).toEqual([0, 143, 212]);
  expectReadableInk(await inspectInk(page, "Challenge"));
  expectReadableInk(await inspectInk(page, "Share"));
});
