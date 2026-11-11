import { expect, test } from "@playwright/test";
import { signInWithPassword } from "./login";

for (const brand of ["코발트", "ISU"]) {
  test(`workflow templates support selection, review and keyboard use in ${brand}`, async ({
    page,
  }) => {
    await signInWithPassword(page, "org-manager");
    await page.getByRole("button", { name: "디자인 시스템" }).click();
    const choices = page.getByRole("navigation", { name: "화면 유형" });
    const master = page.getByRole("region", { name: "교육 과정", exact: true });
    const chooseRow = (code: string) =>
      master
        .getByRole("row")
        .filter({ hasText: code })
        .getByRole("checkbox")
        .click();
    for (const count of [1, 2, 3, 4]) {
      await choices.getByRole("button", { name: `그리드 ${count}개` }).click();
      await expect(page.locator(".workGridLayout > section")).toHaveCount(
        count,
      );
    }
    for (const mode of ["라이트", "다크"]) {
      for (const density of ["기본", "촘촘하게"]) {
        await page.getByRole("button", { name: "화면 설정" }).click();
        const settings = page.getByRole("dialog", { name: "화면 설정" });
        for (const option of [brand, mode, density])
          await settings
            .getByRole("radio", { name: option, exact: true })
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
        await choices.getByRole("button", { name: "목록과 상세 탭" }).click();
        await chooseRow("ED-001");
        const tabs = page.getByRole("tablist", { name: "선택 과정 상세" });
        await tabs.getByRole("tab", { name: "교육 일정" }).focus();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
        await expect(page.getByRole("table", { name: "신청자" })).toContainText(
          "ED-001-1",
        );
        await chooseRow("ED-002");
        await expect(
          tabs.getByRole("tab", { name: "교육 일정" }),
        ).toHaveAttribute("aria-selected", "true");
        await tabs.getByRole("tab", { name: "준비 자료" }).click();
        await expect(
          page.getByRole("table", { name: "준비 자료" }),
        ).toContainText("데이터 분석 1차 안내서");
        await choices.getByRole("button", { name: "선택 팝업" }).click();
        const trigger = page.getByRole("button", { name: "과정 찾기" });
        await trigger.click();
        const picker = page.getByRole("dialog", { name: "교육 과정 찾기" });
        const query = picker.getByRole("searchbox", { name: "과정 검색" });
        const apply = picker.getByRole("button", { name: "선택 적용" });
        await query.fill("없는 과정");
        await expect(picker.getByRole("status")).toContainText(
          "일치하는 과정이 없습니다",
        );
        await expect(apply).toBeDisabled();
        await query.fill("ed-002");
        await picker.getByRole("radio").check();
        await apply.press("Enter");
        await expect(trigger).toBeFocused();
        const value = page.locator(".workflowSelection dd");
        await expect(value).toContainText("ED-002");
        await trigger.click();
        await expect(
          picker.getByRole("radio", { name: /ED-002/ }),
        ).toBeChecked();
        await query.fill("ED-003");
        await picker.getByRole("radio").check();
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
        await expect(value).toContainText("ED-002");
        await choices.getByRole("button", { name: "변경 비교" }).click();
        const table = page.getByRole("table", {
          name: "교육 운영 계획 변경 전후",
        });
        await expect(table.getByRole("row")).toHaveCount(4);
        await page.getByRole("checkbox", { name: "변경 항목만 보기" }).check();
        await expect(table.getByRole("row")).toHaveCount(3);
        await expect(table).toContainText("16명");
      }
    }
    await page.setViewportSize({ width: 320, height: 700 });
    await page.getByLabel("메뉴 배치").selectOption("top");
    await choices.getByRole("button", { name: "선택 팝업" }).click();
    await page.getByRole("button", { name: "과정 찾기" }).click();
    const picker = page.getByRole("dialog", { name: "교육 과정 찾기" });
    await expect(picker.getByRole("button", { name: "취소" })).toBeInViewport();
    const bounds = await picker.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    await picker.getByRole("button", { name: "취소" }).focus();
    await page.keyboard.press("Tab");
    expect(
      await picker.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
    await picker.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("button", { name: "과정 찾기" })).toBeFocused();
  });
}
