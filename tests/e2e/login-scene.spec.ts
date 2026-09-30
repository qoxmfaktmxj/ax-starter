import { expect, test } from "@playwright/test";

test("SSMS login keeps CI slogans and interactive Blender blocks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      /shader error|WebGLProgram|failed to load.*login-scene/i.test(
        message.text(),
      )
    )
      errors.push(message.text());
  });
  await page.goto("/login");
  const canvas = page.locator(".loginSceneCanvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await expect(page.getByLabel("아이디", { exact: true })).toBeVisible();
  await expect(page.getByLabel("비밀번호", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".loginSloganChallenge")).toHaveCSS(
    "color",
    "rgb(153, 202, 60)",
  );
  await expect(page.locator(".loginSloganShare")).toHaveCSS(
    "color",
    "rgb(0, 143, 212)",
  );
  await page.mouse.move(430, 420);
  await expect(canvas).toHaveAttribute("data-hovered-block", /ISU/);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-block-lift")))
    .toBeGreaterThan(0.03);
  await page.getByLabel("아이디", { exact: true }).hover();
  await expect(canvas).toHaveAttribute("data-hovered-block", "");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-block-lift")))
    .toBeLessThan(0.002);
  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  const sceneAssets = resources.filter((url) => url.includes("/login-scene/"));
  expect(sceneAssets.length).toBeGreaterThan(0);
  expect(
    sceneAssets.every((url) => /\/login-scene\/(studio|fonts)\//.test(url)),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("reduced-motion mobile login keeps the seasonal still and CI text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login?season=christmas");
  await expect(page.locator(".loginSceneCanvas")).toHaveAttribute(
    "data-ready",
    "static",
  );
  const background = await page
    .locator(".loginScene")
    .evaluate(
      (element) => getComputedStyle(element, "::before").backgroundImage,
    );
  expect(background).toContain("/studio/still-christmas-mobile.webp");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await expect(page.locator(".loginSloganChallenge")).toHaveCSS(
    "color",
    "rgb(153, 202, 60)",
  );
  await expect(page.locator(".loginSloganShare")).toHaveCSS(
    "color",
    "rgb(0, 143, 212)",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  expect(resources.some((url) => url.includes("isu-studio.glb"))).toBe(false);
});

test("greeting seasons put a phrase above the cube and other seasons do not", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/login?season=yearend");
  await expect(page.locator(".loginSceneCanvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator(".studioPhrase")).toHaveText(/^See you in \d{4}$/);
  const phrase = (await page.locator(".studioPhrase").boundingBox())!;
  const frame = (await page.locator(".studioModelFrame").boundingBox())!;
  const cube = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector(".studioPhrase")!);
    return {
      left: Number(style.getPropertyValue("--cube-left")),
      top: Number(style.getPropertyValue("--cube-top")),
    };
  });
  expect(
    Math.abs(phrase.x - (frame.x + cube.left * frame.width)),
  ).toBeLessThanOrEqual(1);
  expect(phrase.y + phrase.height).toBeLessThan(
    frame.y + cube.top * frame.height,
  );
  expect(phrase.y).toBeGreaterThan(0);
  await page.goto("/login?season=green");
  await expect(page.locator(".loginSceneCanvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator(".studioPhrase")).toHaveCount(0);
});

for (const [width, height] of [
  [820, 1180],
  [1024, 768],
  [1366, 1024],
] as const) {
  test(`tall windows keep the seasonal cube and phrase on screen at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/login?season=newyear");
    await expect(page.locator(".loginSceneCanvas")).toHaveAttribute(
      "data-ready",
      "true",
    );
    const { phraseLeft, cubeLeft } = await page.evaluate(() => {
      const frame = document
        .querySelector(".studioModelFrame")!
        .getBoundingClientRect();
      const phrase = document.querySelector(".studioPhrase")!;
      const left = Number(
        getComputedStyle(phrase).getPropertyValue("--cube-left"),
      );
      return {
        phraseLeft: phrase.getBoundingClientRect().left,
        cubeLeft: frame.left + left * frame.width,
      };
    });
    expect(cubeLeft).toBeGreaterThanOrEqual(15);
    expect(phraseLeft).toBeGreaterThanOrEqual(15);
  });
}

for (const failure of ["model", "webgl"]) {
  test(`falls back to the seasonal still after ${failure} failure`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    if (failure === "model")
      await page.route("**/isu-studio.glb", (route) => route.abort());
    else
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (
          this: HTMLCanvasElement,
          type: string,
          ...args: unknown[]
        ) {
          return type.includes("webgl")
            ? null
            : Reflect.apply(original, this, [type, ...args]);
        } as typeof original;
      });
    await page.goto("/login?season=autumn");
    await expect(page.locator(".loginSceneCanvas")).toHaveAttribute(
      "data-ready",
      "static",
    );
    expect(
      await page
        .locator(".loginScene")
        .evaluate((el) => getComputedStyle(el, "::before").backgroundImage),
    ).toContain("still-autumn-desktop.webp");
    await expect(
      page.getByRole("button", { name: "로그인", exact: true }),
    ).toBeEnabled();
  });
}
test("middle click previews seasons without changing the form", async ({
  page,
}) => {
  await page.goto("/login?season=autumn");
  await page.getByLabel("아이디", { exact: true }).fill("test-user");
  await page.mouse.click(20, 20, { button: "middle" });
  expect(
    await page
      .locator(".loginScene")
      .evaluate((el) => getComputedStyle(el, "::before").backgroundImage),
  ).toContain("still-christmas-desktop.webp");
  await expect(page.getByLabel("아이디", { exact: true })).toHaveValue(
    "test-user",
  );
});
