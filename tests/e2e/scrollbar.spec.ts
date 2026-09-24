import { expect, test } from "@playwright/test";

// headless Chromium은 기본으로 스크롤바를 숨긴다. 실제 폭을 재기 위해 이 옵션만 끈다.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("any scroll container uses the 12px custom scrollbar", async ({
  page,
}) => {
  await page.goto("/login");
  const gutter = await page.evaluate(() => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;top:0;left:0;width:120px;height:80px;overflow-y:scroll";
    box.innerHTML = '<div style="height:400px"></div>';
    document.body.append(box);
    const value = box.offsetWidth - box.clientWidth;
    box.remove();
    return value;
  });
  expect(gutter).toBe(12);
});
