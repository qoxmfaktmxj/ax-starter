import type { Page } from "@playwright/test";

export function fixturePassword() {
  const value = process.env.LOCAL_FIXTURE_PASSWORD;
  if (!value) throw new Error("LOCAL_FIXTURE_PASSWORD is required for e2e");
  return value;
}

export async function signInWithPassword(
  page: Page,
  username: string,
  password = fixturePassword(),
) {
  await page.goto("/login");
  await page.getByLabel("아이디").fill(username);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
}
