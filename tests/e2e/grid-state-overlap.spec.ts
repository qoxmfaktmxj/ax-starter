import { expect, test, type Locator } from "@playwright/test";
import { signInWithPassword } from "./login";
import { textContrast } from "./text-contrast";

async function edit(cell: Locator, value: string) {
  await cell.dblclick();
  const input = cell.locator("input");
  await input.fill(value);
  await input.press("Enter");
}

test("selected employee, focused cell and validation errors remain distinct", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithPassword(page, "hr-admin");
  await page.getByRole("button", { name: "일괄편집" }).click();
  const row = page.getByRole("row").filter({ hasText: "E001" });
  const checkbox = row.getByRole("checkbox");
  const number = row.locator('[col-id="employeeNo"]');
  const name = row.locator('[col-id="name"]');
  const position = row.locator('[col-id="position"]');
  await checkbox.click();
  await edit(name, "");
  await edit(position, "가".repeat(51));
  const rejected = page.waitForResponse(
    (res) => res.url().endsWith("/api/employees/batch") && res.status() === 422,
  );
  await page.getByRole("button", { name: "저장 1건" }).click();
  await rejected;
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(position).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(/[가-힣]/);
  await expect(page.getByText(/입력 오류 E001 이름/)).toBeVisible();
  await expect(page.getByText(/입력 오류 E001 직책/)).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "화면 설정" });
  for (const brand of ["코발트", "ISU"]) {
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
        await expect(row).toHaveCSS(
          "height",
          density === "기본" ? "55px" : "34px",
        );
        await number.click();
        await number.press("ArrowRight");
        await expect(name).toBeFocused();
        await expect(checkbox).toBeChecked();
        await expect(row).toHaveAttribute("aria-selected", "true");
        const selection = row.locator('[aria-colindex="1"]');
        await expect(selection).toHaveCSS("border-inline-start-width", "4px");
        await expect(name).toHaveCSS("outline-style", "solid");
        await expect(name).toHaveCSS("outline-offset", "-2px");
        expect(
          await name.evaluate(textContrast, "outline" as const),
        ).toBeGreaterThanOrEqual(3);
        expect(
          await name.evaluate((el) => getComputedStyle(el, "::before").content),
        ).toBe('"오류"');
        expect(
          await name.evaluate(textContrast, "errorMark" as const),
        ).toBeGreaterThanOrEqual(4.5);
        await name.press("Enter");
        const input = name.locator("input");
        await expect(input).toBeFocused();
        await expect(input).toHaveAccessibleDescription(/^저장 오류:/);
        expect(
          await input.evaluate((el) => {
            const box = el
              .closest('[role="gridcell"]')!
              .getBoundingClientRect();
            const editor = el.getBoundingClientRect();
            return (
              editor.left >= box.left + 36 &&
              editor.right <= box.right &&
              editor.top >= box.top &&
              editor.bottom <= box.bottom
            );
          }),
        ).toBe(true);
        await input.press("Escape");
      }
    }
  }
  await page.emulateMedia({ forcedColors: "active" });
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toHaveCSS("appearance", "auto");
  await expect(checkbox).toHaveCSS("opacity", "1");
  await expect(name).toBeFocused();
  await expect(name).toHaveCSS("outline-style", "solid");
  expect(
    await name.evaluate(
      (el) => getComputedStyle(el, "::before").borderTopStyle,
    ),
  ).toBe("dashed");
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await checkbox.click();
  await edit(name, "가상사원01");
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  await expect(position).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText(/입력 오류 E001 이름/)).toHaveCount(0);
  await expect(page.getByText(/입력 오류 E001 직책/)).toBeVisible();
  await expect(checkbox).toBeChecked();
  await page.getByRole("button", { name: "실행 취소" }).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "다시 실행" }).click();
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  await edit(position, "사원");
  await expect(row.locator(".gridCell--invalid")).toHaveCount(0);
});
