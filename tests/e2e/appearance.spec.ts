import { expect, test } from "@playwright/test";
import { signInToEmployees } from "./login";
import { textContrast } from "./text-contrast";

test("appearance choices update the grid without losing selection and survive navigation", async ({
  page,
}) => {
  await signInToEmployees(page, "hr-admin");
  const root = page.locator("html");
  const settings = page.getByRole("button", { name: "화면 설정" });
  await expect(root).toHaveAttribute("data-theme", "cobalt");
  await expect(root).toHaveAttribute("data-mode", "light");
  await page
    .getByRole("row")
    .filter({ hasText: "E001" })
    .getByRole("checkbox")
    .click();
  await settings.click();
  const dialog = page.getByRole("dialog", { name: "화면 설정" });
  const buttons = new Set<string>();
  const surfaces = new Set<string>();
  for (const [brand, mode] of [
    ["코발트", "라이트"],
    ["ISU", "라이트"],
    ["코발트", "다크"],
    ["ISU", "다크"],
  ]) {
    await dialog.getByRole("radio", { name: brand }).check();
    await dialog.getByRole("radio", { name: mode }).check();
    const colors = await page.evaluate(() => {
      const style = (selector: string) =>
        getComputedStyle(document.querySelector(selector)!);
      const primary = style(".modeAction");
      return {
        primary: primary.backgroundColor,
        surface: style(".ag-root-wrapper").backgroundColor,
        panel: style(".workspaceTablePanel").backgroundColor,
      };
    });
    buttons.add(colors.primary);
    surfaces.add(colors.surface);
    expect(colors.surface).toBe(colors.panel);
    for (const selector of [
      ".modeAction",
      ".gridStatus[data-status=ACTIVE]",
      ".gridStatus[data-status=LEAVE]",
    ]) {
      expect(
        await page.locator(selector).first().evaluate(textContrast),
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(buttons.size).toBe(4);
  expect(surfaces.size).toBe(2);
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  await expect(page.locator(".detailCard")).toContainText("E001");
  await page.reload();
  await settings.click();
  await expect(dialog.getByRole("radio", { name: "ISU" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "다크" })).toBeChecked();
  for (const path of ["/audit", "/login"]) {
    const response = await page.goto(path);
    expect(await response!.text()).toMatch(
      /<html[^>]*data-theme="isu"[^>]*data-mode="dark"/,
    );
    await expect(root).toHaveCSS("color-scheme", "dark");
  }
});

test("mobile keyboard settings preserve the edit and recover from an invalid preference", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: "ax-appearance", value: "isu.invalid", url: baseURL! },
  ]);
  await signInToEmployees(page, "hr-admin");
  await page.getByRole("button", { name: "일괄편집" }).click();
  await page
    .getByRole("gridcell", { name: "가상사원01", exact: true })
    .dblclick();
  const input = page.locator(".ag-cell-inline-editing input");
  await input.fill("테마 변경 중인 초안");
  await input.press("Enter");
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole("button", { name: "화면 설정" }).click();
  const dialog = page.getByRole("dialog");
  const light = dialog.getByRole("radio", { name: "라이트" });
  await expect(dialog.getByRole("radio", { name: "코발트" })).toBeChecked();
  await expect(light).toBeChecked();
  await light.focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("radio", { name: "다크" })).toBeChecked();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByRole("button", { name: "저장 1건" })).toBeEnabled();
});
