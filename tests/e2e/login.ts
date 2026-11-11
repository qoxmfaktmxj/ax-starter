import { setTimeout as delay } from "node:timers/promises";
import { expect, test, type Page } from "@playwright/test";

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
  const submit = page.getByRole("button", { name: "로그인", exact: true });
  const [response] = await Promise.all([
    page.waitForResponse("**/api/auth/sign-in/username"),
    submit.click(),
  ]);
  if (response.status() === 429) {
    // 계정을 공유하는 전체 검사에서는 서버가 안내한 재시도 시각까지 기다린다.
    const seconds = Number(await response.headerValue("x-retry-after"));
    if (seconds > 0 && seconds <= 60) {
      test.setTimeout(test.info().timeout + seconds * 1000);
      await delay(seconds * 1000);
      await submit.click();
    }
  }
}

export async function signInWithFixture(page: Page, subject: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "SSO로 로그인" }).click();
  const subjectInput = page.getByPlaceholder("Enter any user/subject");
  await expect(subjectInput).toBeVisible();
  await subjectInput.fill(subject);
  await subjectInput.press("Enter");
  await expect(page).toHaveURL("/");
}

export async function openEmployeesFromHome(page: Page) {
  await expect(page).toHaveURL("/");
  await page.getByRole("button", { name: "사원관리", exact: true }).click();
  await expect(page).toHaveURL("/employees");
}

export async function signInToEmployees(page: Page, username: string) {
  await signInWithPassword(page, username);
  await openEmployeesFromHome(page);
}
