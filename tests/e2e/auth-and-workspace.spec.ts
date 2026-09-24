import { expect, test, type Page } from "@playwright/test";

async function signInWithFixture(page: Page, subject: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "SSO로 로그인" }).click();
  const subjectInput = page.getByPlaceholder("Enter any user/subject");
  await expect(subjectInput).toBeVisible();
  await subjectInput.fill(subject);
  await subjectInput.press("Enter");
  await page.waitForURL("**/employees");
}

test("hr-admin completes OIDC login and sees 24 seeded employees with salary", async ({
  page,
}) => {
  await signInWithFixture(page, "hr-admin");

  await expect(page.getByText("전체 24건")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "월급" })).toBeVisible();
  await expect(
    page.getByRole("gridcell", { name: "E001", exact: true }),
  ).toBeVisible();
  const auditStatus = await page.evaluate(
    async () => (await fetch("/api/audit")).status,
  );
  expect(auditStatus).toBe(200);
});

test("org-manager sees 12 in-scope employees and no salary in UI or query API", async ({
  page,
}) => {
  await signInWithFixture(page, "org-manager");

  await expect(page.getByText("전체 12건")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "월급" })).toHaveCount(0);
  const queryResult = await page.evaluate(async () => {
    const response = await fetch("/api/employees/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: { employeeNo: "E" },
        offset: 0,
        limit: 100,
        sort: [],
      }),
    });
    return { status: response.status, body: await response.json() };
  });

  expect(queryResult.status).toBe(200);
  expect(queryResult.body.rows).toHaveLength(12);
  expect(
    queryResult.body.rows.every(
      (row: Record<string, unknown>) => !Object.hasOwn(row, "monthlySalary"),
    ),
  ).toBe(true);
  const salaryQueries = await page.evaluate(async () => {
    const post = async (body: unknown) =>
      (
        await fetch("/api/employees/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status;
    return [
      await post({
        filters: {},
        offset: 0,
        limit: 50,
        sort: [{ field: "monthlySalary", direction: "asc" }],
      }),
      await post({
        filters: { monthlySalary: "1" },
        offset: 0,
        limit: 50,
        sort: [],
      }),
    ];
  });
  expect(salaryQueries).toEqual([422, 422]);
  const auditStatus = await page.evaluate(
    async () => (await fetch("/api/audit")).status,
  );
  expect(auditStatus).toBe(403);
});

for (const subject of ["unknown-e2e-user", "inactive-user"]) {
  test(`${subject} can authenticate but cannot access business data`, async ({
    page,
  }) => {
    await signInWithFixture(page, subject);

    await expect(
      page.getByText("업무 계정에 접근할 수 없습니다.", { exact: true }),
    ).toBeVisible();
    const response = await page.evaluate(async () => {
      const result = await fetch("/api/me", { cache: "no-store" });
      return { status: result.status, body: await result.json() };
    });
    expect(response.status).toBe(403);
    await expect(page.getByRole("grid")).toHaveCount(0);
  });
}

test("cancelling dirty navigation preserves the edited value", async ({
  page,
}) => {
  await signInWithFixture(page, "hr-admin");
  await page.getByRole("button", { name: "일괄편집" }).click();

  const nameCell = page.getByRole("gridcell", {
    name: "가상사원01",
    exact: true,
  });
  await expect(nameCell).toBeVisible();
  await nameCell.dblclick();
  const editor = page.locator(".ag-cell-inline-editing input");
  await editor.fill("변경 보존 확인");
  await editor.press("Enter");
  await expect(
    page.getByRole("gridcell", { name: "변경 보존 확인", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "조회형" }).click();
  const dialog = page.getByRole("dialog", { name: /저장하지 않은 변경 1건/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "계속 편집" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("gridcell", { name: "변경 보존 확인", exact: true }),
  ).toBeVisible();
  const browseButton = page.getByRole("button", { name: "조회형" });
  await browseButton.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "계속 편집" }).focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "버리고 이동" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("gridcell", { name: "변경 보존 확인", exact: true }),
  ).toBeVisible();
  await expect(browseButton).toBeFocused();
});
