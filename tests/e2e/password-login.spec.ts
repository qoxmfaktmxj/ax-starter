import { expect, test } from "@playwright/test";
import { signInWithPassword } from "./login";

const INVALID = "아이디 또는 비밀번호가 올바르지 않습니다.";

test("hr-admin signs in with a password and sees 24 employees with salary", async ({
  page,
}) => {
  await signInWithPassword(page, "hr-admin");
  await page.waitForURL("**/employees");
  await expect(page.getByText("전체 24건")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "월급" })).toBeVisible();
});

test("org-manager signs in with a password and sees 12 employees without salary", async ({
  page,
}) => {
  await signInWithPassword(page, "org-manager");
  await page.waitForURL("**/employees");
  await expect(page.getByText("전체 12건")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "월급" })).toHaveCount(0);
});

for (const username of ["hr-admin", "no-such-user"]) {
  test(`${username} with a bad password stays on login with one generic error`, async ({
    page,
  }) => {
    await signInWithPassword(page, username, "wrong-password-0000");
    await expect(
      page.getByRole("alert").filter({ hasText: INVALID }),
    ).toHaveText(INVALID);
    await expect(page).toHaveURL(/\/login$/);
    const status = await page.evaluate(
      async () => (await fetch("/api/me", { cache: "no-store" })).status,
    );
    expect(status).toBe(401);
  });
}

test("inactive-user authenticates but cannot access business data", async ({
  page,
}) => {
  await signInWithPassword(page, "inactive-user");
  await page.waitForURL("**/employees");
  await expect(
    page.getByText("업무 계정에 접근할 수 없습니다.", { exact: true }),
  ).toBeVisible();
});

test("public sign-up is refused and the account never works", async ({
  page,
}) => {
  await page.goto("/login");
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "e2e-signup@example.invalid",
            password: "e2e-signup-password",
            name: "e2e",
            username: "e2e-signup",
          }),
        })
      ).status,
  );
  expect(status).toBeGreaterThanOrEqual(400);
  await signInWithPassword(page, "e2e-signup", "e2e-signup-password");
  await expect(page.getByRole("alert").filter({ hasText: INVALID })).toHaveText(
    INVALID,
  );
});
