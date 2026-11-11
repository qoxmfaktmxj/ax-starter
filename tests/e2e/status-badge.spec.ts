import { expect, test, type Locator } from "@playwright/test";
import { signInWithPassword } from "./login";
import { textContrast } from "./text-contrast";

async function checkBadge(badge: Locator, label: string) {
  await badge.scrollIntoViewIfNeeded();
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(label);
  const colors = await badge.evaluate((element) => {
    const style = getComputedStyle(element);
    return { foreground: style.color, background: style.backgroundColor };
  });
  expect(colors.background).not.toBe("rgba(0, 0, 0, 0)");
  const contrast = await badge.evaluate(textContrast);
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  return { ...colors, contrast };
}

for (const theme of ["cobalt", "isu"]) {
  for (const mode of ["light", "dark"]) {
    test(`employee grid and catalog status badges match in ${theme} ${mode}`, async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([
        { name: "ax-appearance", value: `${theme}.${mode}`, url: baseURL! },
      ]);
      await page.setViewportSize({ width: 1440, height: 900 });
      await signInWithPassword(page, "org-manager");
      await expect(page.getByText("전체 12건")).toBeVisible();
      const root = page.locator("html");
      await expect(root).toHaveAttribute("data-theme", theme);
      await expect(root).toHaveAttribute("data-mode", mode);
      const rows = page.getByRole("grid").getByRole("row");
      const active = await checkBadge(
        rows
          .filter({ hasText: "E001" })
          .locator('[col-id="status"] [data-status="ACTIVE"]'),
        "재직",
      );
      const leave = await checkBadge(
        rows
          .filter({ hasText: "E009" })
          .locator('[col-id="status"] [data-status="LEAVE"]'),
        "휴직",
      );
      expect(active.background).not.toBe(leave.background);
      await page.getByRole("button", { name: "디자인 시스템" }).click();
      await page.getByRole("tab", { name: "컴포넌트" }).click();
      await page
        .getByRole("button", { name: "상태 배지", exact: true })
        .click();
      const catalog = page.getByRole("table", {
        name: "사원 상태별 그리드 표시",
      });
      for (const [status, label, expected] of [
        ["ACTIVE", "재직", active],
        ["LEAVE", "휴직", leave],
      ] as const) {
        const row = catalog.getByRole("row").filter({
          has: page.getByRole("rowheader", { name: status, exact: true }),
        });
        expect(
          await checkBadge(row.locator(`[data-status="${status}"]`), label),
        ).toEqual(expected);
      }
      console.log(
        `${theme}/${mode} 재직 ${active.contrast.toFixed(2)}:1, 휴직 ${leave.contrast.toFixed(2)}:1`,
      );
    });
  }
}
