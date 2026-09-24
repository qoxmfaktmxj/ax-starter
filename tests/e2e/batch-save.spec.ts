import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const employeeId = "00000000-0000-4000-8000-000000000001";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "SSO로 로그인" }).click();
  await page.getByPlaceholder("Enter any user/subject").fill("hr-admin");
  await page.getByRole("button", { name: "Sign-in" }).click();
  await page.waitForURL("**/employees");
  await page.getByRole("button", { name: "일괄편집" }).click();
  await expect(
    page.getByRole("gridcell", { name: "E001", exact: true }),
  ).toBeVisible();
}

async function editName(page: Page, current: string, next: string) {
  await page
    .getByRole("row")
    .filter({ hasText: "E001" })
    .getByRole("gridcell", { name: current, exact: true })
    .dblclick();
  const editor = page.locator(".ag-cell-inline-editing input");
  await editor.fill(next);
  await editor.press("Enter");
}

async function getEmployee(
  page: Page,
): Promise<{ name: string; position: string; rowVersion: number }> {
  return page.evaluate(
    async (id) =>
      (await fetch(`/api/employees/${id}`, { cache: "no-store" })).json(),
    employeeId,
  );
}

async function apiUpdate(
  page: Page,
  rowVersion: number,
  values: Record<string, string>,
) {
  const requestId = randomUUID();
  return page.evaluate(
    async ({ id, version, requestId, values }) => {
      const response = await fetch("/api/employees/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          changes: [{ kind: "update", rowId: id, rowVersion: version, values }],
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    { id: employeeId, version: rowVersion, requestId, values },
  );
}

async function restoreSeed(page: Page) {
  const current = await getEmployee(page);
  if (current.name !== "가상사원01" || current.position !== "사원") {
    const result = await apiUpdate(page, current.rowVersion, {
      name: "가상사원01",
      position: "사원",
    });
    expect(result.status).toBe(200);
  }
}

test("invalid batch keeps the edit and a corrected payload uses a new request ID", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await signIn(page);
  try {
    await editName(page, "가상사원01", "");
    const invalidRequest = page.waitForRequest((request) =>
      request.url().endsWith("/api/employees/batch"),
    );
    const invalidResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/employees/batch") &&
        response.status() === 422,
    );
    await page.getByRole("button", { name: "저장 1건" }).click();
    const firstId = (await invalidRequest).postDataJSON().requestId;
    const failed = await (await invalidResponse).json();
    await expect(
      page.getByRole("alert").filter({ hasText: "입력값을 확인하세요" }),
    ).toBeVisible();
    const audit = await page.evaluate(
      async () => (await (await fetch("/api/audit")).json()).rows,
    );
    expect(
      audit.some(
        (event: { action: string; outcome: string; correlationId: string }) =>
          event.action === "employee.batch" &&
          event.outcome === "FAILED" &&
          event.correlationId === failed.correlationId,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "output/playwright/validation-error-1366.png",
    });
    await expect(page.getByRole("button", { name: "저장 1건" })).toBeEnabled();
    const nameCell = page
      .getByRole("row")
      .filter({ hasText: "E001" })
      .getByRole("gridcell")
      .nth(2);
    await expect(nameCell).toHaveText("");
    await nameCell.dblclick();
    await page.locator(".ag-cell-inline-editing input").fill("가상사원01 임시");
    await page.locator(".ag-cell-inline-editing input").press("Enter");
    const correctedRequest = page.waitForRequest((request) =>
      request.url().endsWith("/api/employees/batch"),
    );
    await page.getByRole("button", { name: "저장 1건" }).click();
    const secondId = (await correctedRequest).postDataJSON().requestId;
    expect(secondId).not.toBe(firstId);
    await expect(page.getByText("1건을 저장했습니다.")).toBeVisible();
    await expect(page.getByRole("button", { name: "저장 0건" })).toBeDisabled();
  } finally {
    await restoreSeed(page);
  }
});

test("rowVersion conflict leaves the unsaved value visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await signIn(page);
  try {
    const initial = await getEmployee(page);
    await editName(page, "가상사원01", "충돌 미저장");
    expect(
      (await apiUpdate(page, initial.rowVersion, { position: "동시 변경" }))
        .status,
    ).toBe(200);
    await page.getByRole("button", { name: "저장 1건" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "다른 저장으로 내용이 변경됐습니다" }),
    ).toBeVisible();
    await page.screenshot({ path: "output/playwright/conflict-1366.png" });
    await expect(
      page.getByRole("gridcell", { name: "충돌 미저장", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "저장 1건" })).toBeEnabled();
  } finally {
    await restoreSeed(page);
  }
});

test("save commits the last value while the cell editor is still open", async ({
  page,
}) => {
  await signIn(page);
  try {
    await page
      .getByRole("gridcell", { name: "가상사원01", exact: true })
      .dblclick();
    await page
      .locator(".ag-cell-inline-editing input")
      .fill("마지막 입력 저장");
    const saveButton = page.getByRole("button", { name: /저장 .*건/ });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByText("1건을 저장했습니다.")).toBeVisible();
    expect((await getEmployee(page)).name).toBe("마지막 입력 저장");
  } finally {
    await restoreSeed(page);
  }
});
