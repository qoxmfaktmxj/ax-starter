import { expect, test, type Page } from "@playwright/test";
import { fixturePassword } from "./login";

// 이 파일은 실제 3D 장면을 검증하므로 프로젝트 기본값(축소 모션)을 되돌린다.
test.use({ reducedMotion: "no-preference" });

const canvas = (page: Page) => page.locator(".loginScene canvas");
const hasWebGL2 = (page: Page) =>
  page.evaluate(() =>
    Boolean(document.createElement("canvas").getContext("webgl2")),
  );
const sceneBackground = (page: Page) =>
  page
    .locator(".loginScene")
    .evaluate((element) => getComputedStyle(element).backgroundImage);

test("the form works while scene textures are still loading", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/images/login/**", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(canvas(page)).not.toHaveAttribute("data-ready", "true");
    await page.getByLabel("아이디").fill("hr-admin");
    await page.getByLabel("비밀번호").fill(fixturePassword());
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    // 텍스처가 막혀 있으면 load 이벤트가 끝나지 않으므로 domcontentloaded까지만 기다린다.
    await page.waitForURL("**/employees", { waitUntil: "domcontentloaded" });
  } finally {
    release();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("unavailable WebGL shows the still image and keeps the form", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: function (
        this: HTMLCanvasElement,
        type: string,
        ...args: unknown[]
      ) {
        return type.includes("webgl")
          ? null
          : Reflect.apply(original, this, [type, ...args]);
      },
    });
  });
  await page.goto("/login");
  await expect(canvas(page)).toHaveAttribute("data-ready", "false");
  await expect
    .poll(() => sceneBackground(page))
    .toContain("login-still-desktop.webp");
  await expect(page.getByLabel("아이디")).toBeEditable();
});

test("reduced motion skips WebGL and shows the still image", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(canvas(page)).toHaveAttribute("data-ready", "static");
  await expect
    .poll(() => sceneBackground(page))
    .toContain("login-still-desktop.webp");
});

test("the ISU scene finishes its entrance when WebGL is available", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto("/login");
  test.skip(
    !(await hasWebGL2(page)),
    "이 브라우저에서 WebGL2를 쓸 수 없습니다",
  );
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
  await expect(canvas(page)).toHaveAttribute("data-intro", "complete", {
    timeout: 90_000,
  });
  await expect(canvas(page)).toHaveAttribute("data-preview", "true");
});

const opacity = (page: Page, selector: string) =>
  page
    .locator(selector)
    .evaluate((element) => getComputedStyle(element).opacity);

test("a static scene shows Challenge fully and Share faintly", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(canvas(page)).toHaveAttribute("data-ready", "static");
  expect(await opacity(page, ".loginSloganChallenge")).toBe("1");
  expect(await opacity(page, ".loginSloganShare")).toBe("0.35");
});

test("slogan lines, calm and share follow the scene and the sign-in", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto("/login");
  test.skip(
    !(await hasWebGL2(page)),
    "이 브라우저에서 WebGL2를 쓸 수 없습니다",
  );
  await expect(canvas(page)).toHaveAttribute("data-intro", "complete", {
    timeout: 90_000,
  });
  await expect.poll(() => opacity(page, ".loginSloganChallenge")).toBe("1");
  await expect.poll(() => opacity(page, ".loginSloganShare")).toBe("0.35");

  await page.getByLabel("아이디").focus();
  // 컨테이너의 소프트웨어 렌더링은 초당 1프레임 안팎이라 calm이 차오를 시간을 넉넉히 준다.
  await expect
    .poll(async () => Number(await canvas(page).getAttribute("data-calm")), {
      timeout: 60_000,
    })
    .toBeGreaterThan(0.9);

  await page.getByLabel("아이디").fill("hr-admin");
  await page.getByLabel("비밀번호").fill(fixturePassword());
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".loginPage")).toHaveAttribute(
    "data-shared",
    "true",
  );
  // 성공하면 Share가 진해진다. 이동은 최대 1.2초 뒤라 그 전에 확인한다.
  await expect
    .poll(() => opacity(page, ".loginSloganShare"), {
      timeout: 1_100,
      intervals: [50],
    })
    .toBe("1");
  await page.waitForURL("**/employees", { timeout: 15_000 });
});

test("slogan keeps 3:1 contrast against the scene behind it", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  test.skip(
    !(await hasWebGL2(page)),
    "이 브라우저에서 WebGL2를 쓸 수 없습니다",
  );
  await expect(canvas(page)).toHaveAttribute("data-intro", "complete", {
    timeout: 90_000,
  });
  const box = await page.locator(".loginSlogan").boundingBox();
  if (!box) throw new Error("slogan is not rendered");
  await page.addStyleTag({
    content: ".loginSlogan { visibility: hidden !important; }",
  });
  const shot = await page.screenshot({ clip: box });
  const ratios = await page.evaluate(
    async ({ base64, colors }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const surface = document.createElement("canvas");
      surface.width = image.width;
      surface.height = image.height;
      const context = surface.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(
        0,
        0,
        surface.width,
        surface.height,
      );
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (r: number, g: number, b: number) =>
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      const values: number[] = [];
      for (let i = 0; i < data.length; i += 4)
        values.push(luminance(data[i], data[i + 1], data[i + 2]));
      values.sort((a, b) => a - b);
      // 눈송이 같은 작은 밝은 점을 빼기 위해 90번째 백분위수를 배경으로 본다.
      const background = values[Math.floor(values.length * 0.9)];
      return colors.map((hex) => {
        const text = luminance(
          parseInt(hex.slice(1, 3), 16),
          parseInt(hex.slice(3, 5), 16),
          parseInt(hex.slice(5, 7), 16),
        );
        const [high, low] =
          text > background ? [text, background] : [background, text];
        return (high + 0.05) / (low + 0.05);
      });
    },
    { base64: shot.toString("base64"), colors: ["#a0c840", "#33a9e6"] },
  );
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(3);
});
