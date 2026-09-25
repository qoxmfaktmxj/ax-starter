import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

// 로그인 3D 장면의 완성 프레임을 정지 이미지로 저장한다. 모션 감소와 WebGL 오류 때 쓴다.
// CAPTURE_REVIEW_OUT이 있으면 리뷰용 전체 화면 캡처와 SwiftShader 기준 fps도 남긴다.
const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://test-web:3000";
const stillDir = process.env.CAPTURE_OUT;
const reviewDir = process.env.CAPTURE_REVIEW_OUT;

async function openScene(page: Page) {
  await page.goto(`${baseUrl}/login`);
  await page.waitForFunction(
    () =>
      document
        .querySelector(".loginScene .loginSceneCanvas")
        ?.getAttribute("data-intro") === "complete",
    undefined,
    { timeout: 180_000 },
  );
  await page.waitForTimeout(700);
}

async function toWebp(page: Page, png: Buffer) {
  const dataUrl = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const surface = document.createElement("canvas");
    surface.width = image.width;
    surface.height = image.height;
    surface.getContext("2d")!.drawImage(image, 0, 0);
    return surface.toDataURL("image/webp", 0.86);
  }, png.toString("base64"));
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  if (stillDir) {
    for (const shot of [
      {
        name: "login-still-desktop.webp",
        viewport: { width: 1920, height: 1080 },
        scale: 1,
      },
      {
        name: "login-still-mobile.webp",
        viewport: { width: 390, height: 844 },
        scale: 2,
      },
    ]) {
      const page = await browser.newPage({
        viewport: shot.viewport,
        deviceScaleFactor: shot.scale,
      });
      try {
        await openScene(page);
        await page.addStyleTag({
          content:
            ".loginBrand, .loginPanel { visibility: hidden !important; }",
        });
        const png = await page
          .locator(".loginScene .loginSceneCanvas")
          .screenshot({ timeout: 180_000 });
        const webp = await toWebp(page, png);
        await writeFile(join(stillDir, shot.name), webp);
        console.log(`${shot.name}: ${webp.length} bytes`);
      } finally {
        await page.close();
      }
    }
  }
  if (reviewDir) {
    await mkdir(reviewDir, { recursive: true });
    for (const [width, height] of [
      [1440, 900],
      [1366, 768],
      [390, 844],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        await openScene(page);
        const canvas = page.locator(".loginScene .loginSceneCanvas");
        const before = Number(await canvas.getAttribute("data-frames"));
        await page.waitForTimeout(5_000);
        const after = Number(await canvas.getAttribute("data-frames"));
        // ponytail: SwiftShader의 전체 화면 캡처는 느려 기본 30초 제한을 넘길 수 있다.
        await page.screenshot({
          path: join(reviewDir, `login-${width}x${height}.png`),
          timeout: 180_000,
        });
        console.log(
          `login-${width}x${height}: ${((after - before) / 5).toFixed(1)} fps (SwiftShader)`,
        );
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
