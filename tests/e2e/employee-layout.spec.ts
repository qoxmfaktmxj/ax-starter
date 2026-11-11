import { expect, test } from "@playwright/test";
import { signInWithPassword } from "./login";

for (const brand of ["코발트", "ISU"]) {
  test(`employee search, grid and current detail stay connected in ${brand}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithPassword(page, "org-manager");
    const search = page.getByRole("form", { name: "사원 검색" });
    const grid = page.getByRole("grid");
    const detail = page.getByRole("complementary", { name: "상세와 작업" });
    const first = grid.getByRole("row").filter({ hasText: "E001" });
    const second = grid.getByRole("row").filter({ hasText: "E002" });
    const dialog = page.getByRole("dialog", { name: "화면 설정" });
    await expect(page.getByText("전체 12건")).toBeVisible();
    for (const mode of ["라이트", "다크"]) {
      for (const density of ["기본", "촘촘하게"]) {
        await page.getByRole("button", { name: "화면 설정" }).click();
        for (const option of [brand, mode, density])
          await dialog
            .getByRole("radio", { name: option, exact: true })
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
        await search.getByLabel("사번", { exact: true }).fill("E");
        await search.getByLabel("이름", { exact: true }).fill("");
        await search
          .getByRole("combobox", { name: "조직", exact: true })
          .selectOption({ label: "가상조직A" });
        await search
          .getByRole("combobox", { name: "상태", exact: true })
          .selectOption({ label: "재직" });
        await search.getByRole("button", { name: "조회", exact: true }).click();
        await expect(page.getByText("전체 11건")).toBeVisible();
        await expect(detail).toHaveCount(0);
        await first.getByRole("checkbox").click();
        await expect(detail.locator(".detailCard")).toContainText("E001");
        await second.getByRole("checkbox").click();
        await first.getByRole("checkbox").click();
        await expect(detail.locator(".detailCard")).toContainText("E002");
        await expect(detail.getByText("김가람", { exact: true })).toBeVisible();
        await expect(detail.getByText("재직", { exact: true })).toBeVisible();
        await expect(
          grid.getByRole("columnheader", { name: "월급" }),
        ).toHaveCount(0);
        await expect(second).toHaveCSS(
          "height",
          density === "기본" ? "55px" : "34px",
        );
        const filters = await search.boundingBox();
        const list = await page.locator("#employee-list").boundingBox();
        const aside = await detail.boundingBox();
        expect(filters!.y + filters!.height).toBeLessThanOrEqual(list!.y);
        expect(aside!.x).toBeGreaterThanOrEqual(list!.x + list!.width);
        expect(Math.abs(aside!.y - list!.y)).toBeLessThanOrEqual(2);
        await search.getByLabel("이름", { exact: true }).fill("가상사원01");
        await expect(page.locator(".employeeApplied")).not.toContainText(
          "가상사원01",
        );
        await search.getByLabel("이름", { exact: true }).press("Enter");
        await expect(page.getByText("전체 1건")).toBeVisible();
        await expect(page.locator(".employeeApplied")).toContainText(
          "이름 가상사원01",
        );
        await expect(detail).toHaveCount(0);
      }
    }
    await page.setViewportSize({ width: 320, height: 740 });
    await first.getByRole("checkbox").click();
    const jump = page.getByRole("link", {
      name: "가상사원01 (E001) 상세 보기",
    });
    await expect(jump).toBeInViewport();
    await jump.press("Enter");
    await expect(detail).toBeFocused();
    await expect(
      detail.getByText("가상사원01", { exact: true }),
    ).toBeInViewport();
    await detail.getByRole("link", { name: "목록으로" }).press("Enter");
    await expect(page.locator("#employee-list")).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
