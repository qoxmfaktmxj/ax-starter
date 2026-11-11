import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { signInWithPassword } from "./login";

async function openInbox(page: Page) {
  await signInWithPassword(page, "org-manager");
  await page.getByRole("button", { name: "내 신청함", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "내 신청함", exact: true }),
  ).toBeVisible();
}

async function selectCourse(page: Page, code: string) {
  await page.getByRole("button", { name: "과정 찾기" }).click();
  const dialog = page.getByRole("dialog", { name: "교육 과정 찾기" });
  await dialog.getByRole("searchbox", { name: "과정 검색" }).fill(code);
  await dialog.getByRole("radio", { name: new RegExp(code) }).check();
  await dialog.getByRole("button", { name: "선택 적용" }).click();
}

async function saveDraft(
  page: Page,
): Promise<{ id: string; rowVersion: number }> {
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/requests" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  return response.json();
}

test("교육 초안을 새 브라우저 로그인에서 이어 쓰고 네 테마와 두 밀도에서 다시 연다", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const desktop = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const reason = `초안 복원 ${randomUUID()}\n\n  원래 작성한 문단과 공백을 보존합니다.  `;
  let saved: { id: string; rowVersion: number };
  try {
    const page = await desktop.newPage();
    await openInbox(page);
    await page.getByRole("button", { name: "새 신청", exact: true }).click();
    await selectCourse(page, "ED-002");
    await page.getByRole("textbox", { name: /신청 사유/ }).fill(reason);
    saved = await saveDraft(page);
    expect(saved.rowVersion).toBe(1);
    await expect(
      page.getByRole("button", { name: "이어서 작성", exact: true }),
    ).toBeVisible();
  } finally {
    await desktop.close();
  }

  const fresh = await browser.newContext({
    baseURL,
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  try {
    expect((await fresh.request.get("/api/requests")).status()).toBe(401);
    const page = await fresh.newPage();
    await openInbox(page);
    const row = page.locator(`[id="draft-${saved.id}"]`);
    await expect(row).toContainText("ED-002");
    const search = page.getByRole("form", { name: "내 신청 검색" });
    await search.getByRole("textbox", { name: "신청 검색" }).fill(randomUUID());
    await search.getByRole("button", { name: "조회", exact: true }).click();
    await expect(
      page.getByText("검색 결과가 없습니다.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "조건 초기화" }).click();
    await row.click();
    await page
      .getByRole("button", { name: "이어서 작성", exact: true })
      .click();
    const input = page.getByRole("textbox", { name: /신청 사유/ });
    await expect(input).toHaveValue(reason);
    const pickerTrigger = page.getByRole("button", { name: "과정 찾기" });
    await pickerTrigger.click();
    const picker = page.getByRole("dialog", { name: "교육 과정 찾기" });
    await expect(picker.getByRole("radio", { name: /ED-002/ })).toBeChecked();
    await picker.getByRole("button", { name: "취소" }).click();
    for (const brand of ["코발트", "ISU"]) {
      for (const mode of ["라이트", "다크"]) {
        for (const density of ["기본", "촘촘하게"]) {
          await page.getByRole("button", { name: "화면 설정" }).click();
          const settings = page.getByRole("dialog", { name: "화면 설정" });
          for (const choice of [brand, mode, density])
            await settings
              .getByRole("radio", { name: choice, exact: true })
              .check();
          await settings.getByRole("button", { name: "닫기" }).click();
          const root = page.locator("html");
          await expect(root).toHaveAttribute(
            "data-theme",
            brand === "코발트" ? "cobalt" : "isu",
          );
          await expect(root).toHaveAttribute(
            "data-mode",
            mode === "라이트" ? "light" : "dark",
          );
          await expect(root).toHaveAttribute(
            "data-density",
            density === "기본" ? "default" : "compact",
          );
          for (const width of [1440, 320]) {
            await page.setViewportSize({
              width,
              height: width === 320 ? 740 : 900,
            });
            await expect(input).toHaveValue(reason);
            await page.getByRole("button", { name: "검토하기" }).click();
            await expect(
              page.getByText(reason.trim().replace(/\s+/g, " "), {
                exact: true,
              }),
            ).toBeVisible();
            await page.getByRole("button", { name: "다시 수정" }).click();
            await expect(input).toHaveValue(reason);
            await page
              .getByRole("button", { name: "취소", exact: true })
              .click();
            await row.click();
            const detail = page.getByRole("region", { name: "신청 상세" });
            await expect(detail).toContainText(
              reason.trim().replace(/\s+/g, " "),
            );
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            await detail
              .getByRole("button", { name: "이어서 작성", exact: true })
              .click();
          }
        }
      }
    }
    const amended = reason + "\n수정한 교육 신청서";
    await selectCourse(page, "ED-004");
    await input.fill(amended);
    expect(await saveDraft(page)).toEqual({ id: saved.id, rowVersion: 2 });
    await page.reload();
    await expect(row).toContainText("ED-004");
    await row.click();
    await page
      .getByRole("button", { name: "이어서 작성", exact: true })
      .click();
    await expect(input).toHaveValue(amended);
  } finally {
    await fresh.close();
  }
});

test("저장 응답이 유실되면 같은 초안을 복구하고 두 탭의 충돌 시 입력을 보존한다", async ({
  page,
  context,
}) => {
  await openInbox(page);
  const baseline = (await (await page.request.get("/api/requests")).json())
    .drafts.length;
  await page.getByRole("button", { name: "새 신청", exact: true }).click();
  const reason = page.getByRole("textbox", { name: /신청 사유/ });
  await reason.fill("응답 유실 검증용 부분 초안");
  const requestIds: string[] = [];
  let firstResult!: { id: string; rowVersion: number };
  await page.route("**/api/requests", async (route) => {
    if (route.request().method() === "POST") {
      requestIds.push(route.request().postDataJSON().requestId);
      if (requestIds.length === 1) {
        const actual = await route.fetch();
        expect(actual.ok()).toBe(true);
        firstResult = await actual.json();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "저장 결과를 확인하지 못했습니다." }),
  ).toBeVisible();
  await expect(reason).toHaveValue("응답 유실 검증용 부분 초안");
  const saved = await saveDraft(page);
  expect(saved).toEqual(firstResult);
  expect(saved.rowVersion).toBe(1);
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBeTruthy();
  expect(requestIds[1]).toBe(requestIds[0]);
  await page.unroute("**/api/requests");
  const afterRetry = await (await page.request.get("/api/requests")).json();
  expect(afterRetry.drafts).toHaveLength(baseline + 1);
  expect(
    afterRetry.drafts.filter((draft: { id: string }) => draft.id === saved.id),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "이어서 작성", exact: true }).click();
  await reason.fill("아직 저장하지 않은 내 입력");

  const other = await context.newPage();
  await other.goto("/my-requests");
  await other.locator(`[id="draft-${saved.id}"]`).click();
  await other.getByRole("button", { name: "이어서 작성", exact: true }).click();
  await other
    .getByRole("textbox", { name: /신청 사유/ })
    .fill("다른 탭에서 먼저 저장한 입력");
  expect(await saveDraft(other)).toEqual({ id: saved.id, rowVersion: 2 });
  await other.close();

  const rejected = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === "/api/requests" &&
      res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  expect((await rejected).status()).toBe(409);
  await expect(reason).toHaveValue("아직 저장하지 않은 내 입력");
  const reload = page.getByRole("button", { name: "최신 내용 다시 조회" });
  await reload.click();
  await page.getByRole("button", { name: "계속 편집" }).click();
  await expect(reason).toHaveValue("아직 저장하지 않은 내 입력");
  await reload.click();
  await page.getByRole("button", { name: "버리고 이동" }).click();
  await expect(page.getByRole("region", { name: "신청 상세" })).toContainText(
    "다른 탭에서 먼저 저장한 입력",
  );
});
