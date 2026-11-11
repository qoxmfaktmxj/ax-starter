import { expect, test } from "@playwright/test";
import { signInWithPassword } from "./login";
import { textContrast } from "./text-contrast";

test("the component catalog shows three save states in all four themes", async ({
  page,
}) => {
  await signInWithPassword(page, "org-manager");
  await page.getByRole("button", { name: "디자인 시스템" }).click();
  const componentTab = page.getByRole("tab", { name: "컴포넌트" });
  await page.getByRole("tab", { name: "화면 템플릿" }).focus();
  await page.keyboard.press("ArrowRight");
  await componentTab.press("Enter");
  const panel = page.getByRole("tabpanel", { name: "컴포넌트" });
  const index = panel.getByRole("navigation", { name: "컴포넌트 목록" });
  const fieldChoice = index.getByRole("button", { name: "입력 필드" });
  await fieldChoice.focus();
  await page.keyboard.press("Enter");
  await expect(fieldChoice).toHaveAttribute("aria-pressed", "true");
  const field = panel
    .getByRole("textbox", { name: "사번", exact: true })
    .first();
  await field.fill("E012");
  await index.getByRole("button", { name: "상태 배지" }).press("Space");
  await expect(field).toHaveCount(0);
  await expect(
    panel.getByRole("table", { name: "사원 상태별 그리드 표시" }),
  ).toBeVisible();
  await fieldChoice.press("Enter");
  await expect(field).toHaveValue("E012");
  await index.getByRole("button", { name: "저장 버튼" }).press("Enter");
  const ready = panel.getByRole("button", { name: "저장 1건" });
  const pending = panel.getByRole("button", { name: "저장 중" });
  const disabled = panel.getByRole("button", { name: "저장 0건" });
  const colors = new Set<string>();
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/"))
      writes++;
  });
  for (const brand of ["코발트", "ISU"]) {
    for (const mode of ["라이트", "다크"]) {
      await page.getByRole("button", { name: "화면 설정" }).click();
      await page.getByRole("radio", { name: brand }).check();
      await page.getByRole("radio", { name: mode }).check();
      await page.getByRole("button", { name: "닫기" }).click();
      await expect(ready).toBeEnabled();
      await expect(pending).toBeDisabled();
      await expect(pending).toHaveAttribute("aria-busy", "true");
      await expect(disabled).toBeDisabled();
      const activeChoice = index.getByRole("button", {
        name: "저장 버튼",
        pressed: true,
      });
      expect(await activeChoice.evaluate(textContrast)).toBeGreaterThanOrEqual(
        4.5,
      );
      for (const button of [ready, pending, disabled]) {
        expect(await button.evaluate(textContrast)).toBeGreaterThanOrEqual(4.5);
      }
      colors.add(
        await ready.evaluate((el) => getComputedStyle(el).backgroundColor),
      );
    }
  }
  expect(colors.size).toBe(4);
  await page.setViewportSize({ width: 320, height: 740 });
  await ready.press("Enter");
  await expect(pending).toHaveCount(2);
  await expect(panel.getByRole("status")).toHaveText(
    "예시 1건을 저장했습니다.",
  );
  await expect(ready).toBeEnabled();
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  expect(writes).toBe(0);
});

test("permissions and related grids follow the signed-in user and selected course", async ({
  page,
}) => {
  await signInWithPassword(page, "org-manager");
  await page.getByRole("button", { name: "디자인 시스템" }).click();
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
