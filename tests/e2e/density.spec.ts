import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInToEmployees } from "./login";

async function setDensity(page: Page, label: "기본" | "촘촘하게") {
  await page.getByRole("button", { name: "화면 설정" }).click();
  await page
    .getByRole("group", { name: "표 밀도" })
    .getByRole("radio", { name: label, exact: true })
    .check();
  await page.getByRole("button", { name: "닫기" }).click();
}

async function visibleRowCount(page: Page, height: number) {
  await expect(page.getByRole("row").filter({ hasText: "E001" })).toHaveCSS(
    "height",
    `${height}px`,
  );
  // 가상화 버퍼와 반쯤 걸친 행은 제외한다.
  return page.locator(".ag-grid-viewport").evaluate((viewport) => {
    const bounds = viewport.getBoundingClientRect();
    const header = viewport
      .querySelector('[role="columnheader"]')!
      .getBoundingClientRect();
    const top = Math.max(0, bounds.top, header.bottom);
    const bottom = Math.min(
      innerHeight,
      bounds.top + viewport.clientTop + viewport.clientHeight,
    );
    return Array.from(viewport.querySelectorAll(".ag-row")).filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.height > 0 && rect.top >= top && rect.bottom <= bottom;
    }).length;
  });
}

async function expectFocusInsideCell(cell: Locator) {
  await expect(cell).toHaveCSS("outline-style", "solid");
  await expect(cell).toHaveCSS("outline-width", "2px");
  await expect(cell).toHaveCSS("outline-offset", "-2px");
  // 둥근 모서리의 바깥을 제외하고 포커스 테두리 네 변의 양 끝을 확인한다.
  expect(
    await cell.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const inset =
        Math.ceil(parseFloat(getComputedStyle(el).borderRadius)) + 2;
      const hitsCell = (x: number, y: number) =>
        el.contains(document.elementFromPoint(x, y));
      return (
        [r.left + inset, r.right - inset].every(
          (x) => hitsCell(x, r.top + 1) && hitsCell(x, r.bottom - 1),
        ) &&
        [r.top + inset, r.bottom - inset].every(
          (y) => hitsCell(r.left + 1, y) && hitsCell(r.right - 1, y),
        )
      );
    }),
  ).toBe(true);
}

async function expectEditorFits(editorControl: Locator) {
  expect(
    await editorControl.evaluate((el) => {
      const editor = el.getBoundingClientRect();
      const cell = el.closest('[role="gridcell"]')!.getBoundingClientRect();
      return (
        editor.left >= cell.left &&
        editor.right <= cell.right &&
        editor.top >= cell.top &&
        editor.bottom <= cell.bottom &&
        el.scrollHeight <= el.clientHeight
      );
    }),
  ).toBe(true);
}

for (const theme of ["cobalt", "isu"]) {
  for (const mode of ["light", "dark"]) {
    test(`employee grid density keeps complete rows, editors and focus visible in ${theme} ${mode}`, async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([
        { name: "ax-appearance", value: `${theme}.${mode}`, url: baseURL! },
      ]);
      await page.setViewportSize({ width: 1440, height: 900 });
      await signInToEmployees(page, "hr-admin");
      await expect(page.getByText("전체 24건")).toBeVisible();
      const root = page.locator("html");
      await expect(root).toHaveAttribute("data-density", "default");
      const regular = await visibleRowCount(page, 55);
      expect(regular).toBeGreaterThan(0);
      await setDensity(page, "촘촘하게");
      const compact = await visibleRowCount(page, 34);
      expect(compact).toBeGreaterThan(regular);
      console.log(
        `${theme}/${mode} 1440x900 기본 ${regular}행, 촘촘하게 ${compact}행`,
      );
      const response = await page.reload();
      expect(await response!.text()).toMatch(
        /<html[^>]*data-density="compact"/,
      );
      await expect(root).toHaveAttribute("data-theme", theme);
      await expect(root).toHaveAttribute("data-mode", mode);
      await page.getByRole("button", { name: "일괄편집" }).click();
      const first = page.getByRole("row").filter({ hasText: "E001" });
      const nameCell = first.locator('[col-id="name"]');
      for (const [density, height] of [
        ["기본", 55],
        ["촘촘하게", 34],
      ] as const) {
        await setDensity(page, density);
        await expect(first).toHaveCSS("height", `${height}px`);
        await first
          .getByRole("gridcell", { name: "E001", exact: true })
          .click();
        await page.keyboard.press("ArrowRight");
        await expect(nameCell).toBeFocused();
        await expectFocusInsideCell(nameCell);
        await nameCell.press("Enter");
        const input = nameCell.locator("input");
        await expect(input).toBeFocused();
        await expectFocusInsideCell(nameCell);
        await expectEditorFits(input);
        if (density === "촘촘하게")
          await expect(input).toHaveValue("밀도 확인");
        await input.fill("밀도 확인");
        await input.press("Enter");
        await expect(
          page.getByRole("button", { name: "저장 1건" }),
        ).toBeEnabled();
        for (const field of ["hireDate", "monthlySalary", "status"]) {
          const cell = first.locator(`[col-id="${field}"]`);
          await cell.click();
          await cell.press("Enter");
          const control = cell
            .locator('input:visible, [role="combobox"]:visible')
            .first();
          await expect(control).toBeVisible();
          await expectEditorFits(control);
          await page.keyboard.press("Escape");
        }
        await nameCell.click();
        for (let row = 1; row < 24; row++)
          await page.keyboard.press("ArrowDown");
        const last = page
          .getByRole("row")
          .filter({ hasText: "E024" })
          .locator('[col-id="name"]');
        await expect(last).toBeFocused();
        await expectFocusInsideCell(last);
        await last.press("Enter");
        await expectEditorFits(last.locator("input"));
        await expectFocusInsideCell(last);
        await page.keyboard.press("Escape");
        for (let row = 1; row < 24; row++) await page.keyboard.press("ArrowUp");
      }
    });
  }
}
