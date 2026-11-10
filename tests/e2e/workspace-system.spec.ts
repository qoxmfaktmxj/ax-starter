import { expect, test } from "@playwright/test";
import { signInWithPassword } from "./login";

test("permissions and related grids follow the signed-in user and selected course", async ({
  page,
}) => {
  await signInWithPassword(page, "org-manager");
  await page.getByRole("button", { name: "화면 템플릿" }).click();
  await page.getByLabel("메뉴 배치").selectOption("top");
  await page.getByRole("button", { name: "그리드 4개" }).click();
  const master = page.getByRole("region", { name: "교육 과정", exact: true });
  await master
    .getByRole("row")
    .filter({ hasText: "ED-001" })
    .getByRole("checkbox")
    .click();
  await expect(
    page.getByRole("heading", { name: "ED-001 준비 자료" }),
  ).toBeVisible();
  await master
    .getByRole("row")
    .filter({ hasText: "ED-002" })
    .getByRole("checkbox")
    .click();
  await expect(
    page.getByRole("heading", { name: "ED-002 교육 일정" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ED-001 준비 자료" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "내 권한", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "급여" }).getByText("제한"),
  ).toHaveCount(3);
  await expect(page.getByRole("button", { name: "감사 기록" })).toHaveCount(0);
});

test("a new employee search resets the page and indicates a pending query", async ({
  page,
}) => {
  await signInWithPassword(page, "hr-admin");
  await expect(page.getByText("전체 24건")).toBeVisible();
  await page.getByRole("button", { name: "다음 페이지" }).click();
  await expect(
    page.getByRole("gridcell", { name: "E024", exact: true }),
  ).toBeVisible();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/employees/query", async (route) => {
    await hold;
    await route.continue();
  });
  await page.getByLabel("사번", { exact: true }).fill("E001");
  await page.getByRole("button", { name: "조회", exact: true }).click();
  try {
    await expect(
      page.getByRole("button", { name: "조회 중", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByText("전체 1건")).toBeVisible();
  await expect(
    page.getByRole("gridcell", { name: "E001", exact: true }),
  ).toBeVisible();
});

test("detail actions follow the current employee while a new detail loads", async ({
  page,
}) => {
  await signInWithPassword(page, "hr-admin");
  const checkbox = (employeeNo: string) =>
    page.getByRole("row").filter({ hasText: employeeNo }).getByRole("checkbox");
  await checkbox("E001").click();
  const upload = page.getByRole("button", { name: "첨부 업로드" });
  await expect(upload).toBeVisible();
  await checkbox("E002").click();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/employees\/[^/]+\/files$/, async (route) => {
    await hold;
    await route.continue();
  });
  try {
    await checkbox("E001").click();
    await expect(upload).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator(".detailCard")).toContainText("E002");
  await expect(upload).toBeVisible();
});
