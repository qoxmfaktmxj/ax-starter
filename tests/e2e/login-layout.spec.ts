import { expect, test } from "@playwright/test";
import { fixturePassword } from "./login";

test("login form keeps keyboard order and submits with Enter", async ({
  page,
}) => {
  await page.goto("/login");
  const username = page.getByLabel("아이디");
  const password = page.getByLabel("비밀번호");
  await username.focus();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "SSO로 로그인" }),
  ).toBeFocused();
  await username.fill("hr-admin");
  await password.fill(fixturePassword());
  await password.press("Enter");
  await page.waitForURL("**/employees");
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`login has no horizontal overflow at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
