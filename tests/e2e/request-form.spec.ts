import { expect, test, type Page } from "@playwright/test";
import { signInWithPassword } from "./login";

async function pickCourse(page: Page, code: string, apply: boolean) {
  const trigger = page.getByRole("button", { name: "과정 찾기" });
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "교육 과정 찾기" });
  await dialog.getByRole("searchbox", { name: "과정 검색" }).fill(code);
  await dialog.getByRole("radio").check();
  if (apply) {
    await dialog.getByRole("button", { name: "선택 적용" }).press("Enter");
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(trigger).toBeFocused();
}

for (const width of [1440, 320]) {
  test(`교육 신청서 검토와 수정 왕복 시 네 테마에서 입력값을 유지한다 (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
    await signInWithPassword(page, "org-manager");
    await page.getByRole("button", { name: "디자인 시스템" }).click();
    await page
      .getByRole("button", { name: "교육 신청서", exact: true })
      .click();

    const trigger = page.getByRole("button", { name: "과정 찾기" });
    const reason = page.getByRole("textbox", { name: /신청 사유/ });
    const review = page.getByRole("button", { name: "검토하기" });
    const revise = page.getByRole("button", { name: "다시 수정" });

    await review.click();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAccessibleDescription(
      "교육 과정을 선택하세요.",
    );
    await expect(revise).toHaveCount(0);
    await pickCourse(page, "ED-001", true);
    await reason.fill("   ");
    await review.click();
    await expect(reason).toBeFocused();
    await expect(reason).toHaveAttribute("aria-invalid", "true");
    await expect(reason).toHaveAccessibleDescription("신청 사유를 입력하세요.");
    await expect(revise).toHaveCount(0);

    for (const brand of ["코발트", "ISU"]) {
      for (const mode of ["라이트", "다크"]) {
        await page.getByRole("button", { name: "화면 설정" }).click();
        const settings = page.getByRole("dialog", { name: "화면 설정" });
        await settings.getByRole("radio", { name: brand, exact: true }).check();
        await settings.getByRole("radio", { name: mode, exact: true }).check();
        await settings.getByRole("button", { name: "닫기" }).click();
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          brand === "코발트" ? "cobalt" : "isu",
        );
        await expect(page.locator("html")).toHaveAttribute(
          "data-mode",
          mode === "라이트" ? "light" : "dark",
        );

        await pickCourse(page, "ED-002", true);
        await pickCourse(page, "ED-003", false);
        const draft = `현장 데이터를 해석하는 방법을 배우고 싶습니다.\n${brand} ${mode} 검토용 초안`;
        await reason.fill(draft);
        await review.press("Enter");
        await expect(
          page.getByRole("heading", { name: "교육 신청서 검토" }),
        ).toBeFocused();
        await expect(revise).toBeVisible();
        await expect(reason).toHaveCount(0);
        await expect(page.getByText(/ED-002/)).toBeVisible();
        await expect(page.getByText(/데이터 분석 1차/)).toBeVisible();
        await expect(
          page.getByText(draft.replace("\n", " "), { exact: true }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await revise.press("Enter");
        await expect(
          page.getByRole("heading", { name: "교육 신청서 작성" }),
        ).toBeFocused();
        await expect(reason).toHaveValue(draft);
        await trigger.press("Enter");
        const picker = page.getByRole("dialog", { name: "교육 과정 찾기" });
        await expect(
          picker.getByRole("radio", { name: /ED-002/ }),
        ).toBeChecked();
        await picker.getByRole("button", { name: "취소" }).click();
        await expect(reason).toHaveValue(draft);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await pickCourse(page, "ED-004", true);
        const amended = draft + "\n실습 과정으로 변경합니다.";
        await reason.fill(amended);
        await review.click();
        await expect(
          page.getByText(/ED-004 \/ 프로젝트 관리 1차/),
        ).toBeVisible();
        await expect(
          page.getByText(amended.replaceAll("\n", " "), { exact: true }),
        ).toBeVisible();
        await revise.click();
        await expect(reason).toHaveValue(amended);
      }
    }
  });
}
