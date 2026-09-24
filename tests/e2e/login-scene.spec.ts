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
    await page.goto("/login");
    await expect(canvas(page)).not.toHaveAttribute("data-ready", "true");
    await page.getByLabel("아이디").fill("hr-admin");
    await page.getByLabel("비밀번호").fill(fixturePassword());
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL("**/employees");
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
