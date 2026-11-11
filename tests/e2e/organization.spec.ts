import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type {
  OrganizationOverview,
  OrganizationUpdate,
} from "../../packages/contracts/organization";
import { signInWithPassword } from "./login";

const accountId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const orgId = "11111111-1111-4111-8111-111111111111";
const employee3 = "00000000-0000-4000-8000-000000000003";
const employee4 = "00000000-0000-4000-8000-000000000004";

async function overview(page: Page): Promise<OrganizationOverview> {
  const response = await page.request.get("/api/organization");
  expect(response.ok()).toBe(true);
  return response.json();
}

async function change(page: Page, mutation: OrganizationUpdate) {
  return page.request.post("/api/organization", {
    headers: { Origin: new URL(page.url()).origin },
    data: mutation,
  });
}

test("관리자는 사원 연결과 책임자를 지정하고 담당자는 본인의 최신 소속을 조회한다", async ({
  page,
  browser,
  baseURL,
}) => {
  await signInWithPassword(page, "hr-admin");
  await page.getByRole("button", { name: "인사/조직", exact: true }).click();
  const original = (await overview(page)).management!;
  const originalEmployee = original.accounts.find(
    (row) => row.id === accountId,
  )!.employeeId;
  const originalManager = original.organizations.find(
    (row) => row.id === orgId,
  )!.managerEmployeeId;
  const memberContext = await browser.newContext({
    baseURL,
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  try {
    await page.getByRole("tab", { name: "계정 연결" }).click();
    await page
      .getByRole("combobox", { name: "대상 계정" })
      .selectOption(accountId);
    await page
      .getByRole("combobox", { name: "연결할 사원" })
      .selectOption(employee3);
    await page.getByRole("button", { name: "계정 연결 저장" }).click();
    await expect(page.getByText("계정 연결을 저장했습니다.")).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "대상 계정" }),
    ).toBeFocused();
    await page.getByRole("tab", { name: "조직 책임자" }).click();
    await page.getByRole("combobox", { name: "대상 조직" }).selectOption(orgId);
    await page
      .getByRole("combobox", { name: "지정할 책임자" })
      .selectOption(employee4);
    await page.getByRole("button", { name: "책임자 지정 저장" }).click();
    await expect(page.getByText("조직 책임자를 저장했습니다.")).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "대상 조직" }),
    ).toBeFocused();
    await page.reload();
    await page.getByRole("tab", { name: "계정 연결" }).click();
    await page
      .getByRole("combobox", { name: "대상 계정" })
      .selectOption(accountId);
    await expect(
      page.getByRole("combobox", { name: "연결할 사원" }),
    ).toHaveValue(employee3);
    await page.getByRole("tab", { name: "조직 책임자" }).click();
    await page.getByRole("combobox", { name: "대상 조직" }).selectOption(orgId);
    await expect(
      page.getByRole("combobox", { name: "지정할 책임자" }),
    ).toHaveValue(employee4);
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
      for (const brand of ["코발트", "ISU"])
        for (const mode of ["라이트", "다크"]) {
          await page.getByRole("button", { name: "화면 설정" }).click();
          const dialog = page.getByRole("dialog", { name: "화면 설정" });
          for (const label of [brand, mode])
            await dialog
              .getByRole("radio", { name: label, exact: true })
              .check();
          await dialog.getByRole("button", { name: "닫기" }).click();
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            brand === "코발트" ? "cobalt" : "isu",
          );
          await expect(page.locator("html")).toHaveAttribute(
            "data-mode",
            mode === "라이트" ? "light" : "dark",
          );
          await expect(
            page.getByRole("combobox", { name: "지정할 책임자" }),
          ).toBeVisible();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
        }
    }
    const member = await memberContext.newPage();
    await signInWithPassword(member, "org-manager");
    await member
      .getByRole("button", { name: "인사/조직", exact: true })
      .click();
    const self = member.getByRole("region", { name: "내 소속" });
    await expect(self).toContainText("E003");
    await expect(self).toContainText("E004");
    await expect(member.getByRole("tab", { name: "계정 연결" })).toHaveCount(0);
    expect((await overview(member)).management).toBeNull();
    const denied = await change(member, {
      kind: "manager",
      targetId: orgId,
      employeeId: null,
      rowVersion: 1,
      requestId: randomUUID(),
    });
    expect(denied.status()).toBe(403);
  } finally {
    await memberContext.close();
    const current = (await overview(page)).management!;
    const account = current.accounts.find((row) => row.id === accountId)!;
    const org = current.organizations.find((row) => row.id === orgId)!;
    if (account.employeeId !== originalEmployee)
      expect(
        (
          await change(page, {
            kind: "account",
            targetId: accountId,
            employeeId: originalEmployee,
            rowVersion: account.rowVersion,
            requestId: randomUUID(),
          })
        ).ok(),
      ).toBe(true);
    if (org.managerEmployeeId !== originalManager)
      expect(
        (
          await change(page, {
            kind: "manager",
            targetId: orgId,
            employeeId: originalManager,
            rowVersion: org.rowVersion,
            requestId: randomUUID(),
          })
        ).ok(),
      ).toBe(true);
  }
});
