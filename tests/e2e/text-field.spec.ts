import { expect, test } from "@playwright/test";
import { signInWithPassword } from "./login";
import { textContrast } from "./text-contrast";

for (const theme of ["cobalt", "isu"]) {
  for (const mode of ["light", "dark"]) {
    test(`employee number field and catalog states in ${theme} ${mode}`, async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([
        { name: "ax-appearance", value: `${theme}.${mode}`, url: baseURL! },
      ]);
      await signInWithPassword(page, "org-manager");
      await expect(page.getByText("전체 12건")).toBeVisible();
      const employeeNo = page.getByRole("textbox", {
        name: "사번",
        exact: true,
      });
      await employeeNo.fill("E001");
      await employeeNo.press("Enter");
      await expect(page.getByText("전체 1건")).toBeVisible();
      await expect(
        page.getByRole("gridcell", { name: "E001", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "디자인 시스템" }).click();
      await page.getByRole("tab", { name: "컴포넌트" }).click();
      const root = page.locator("html");
      await expect(root).toHaveAttribute("data-theme", theme);
      await expect(root).toHaveAttribute("data-mode", mode);
      const example = page.getByRole("region", { name: "입력 필드" });
      const fields = example.getByRole("textbox", {
        name: "사번",
        exact: true,
      });
      await expect(fields).toHaveCount(5);
      const [normal, focused, readonly, disabled, invalid] = await fields.all();
      await expect(normal).toHaveAttribute("placeholder", "사번 입력");
      for (const field of [normal, focused, readonly, disabled, invalid]) {
        expect(await field.evaluate(textContrast)).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        await normal.evaluate(textContrast, "placeholder" as const),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await normal.evaluate(textContrast, "border" as const),
      ).toBeGreaterThanOrEqual(3);
      await normal.fill("E002");
      await expect(normal).toHaveValue("E002");
      await normal.press("Tab");
      await expect(focused).toBeFocused();
      await expect(focused).toHaveCSS("outline-style", "solid");
      expect(
        await focused.evaluate(textContrast, "outline" as const),
      ).toBeGreaterThanOrEqual(3);
      await focused.press("Tab");
      await expect(focused).not.toBeFocused();
      await expect(readonly).toBeFocused();
      await expect(readonly).toHaveJSProperty("readOnly", true);
      await readonly.press("ControlOrMeta+a");
      expect(
        await readonly.evaluate((el) => (el as HTMLInputElement).selectionEnd),
      ).toBe(4);
      await readonly.press("Backspace");
      await expect(readonly).toHaveValue("E001");
      await expect(disabled).toBeDisabled();
      await readonly.press("Tab");
      await expect(invalid).toBeFocused();
      await expect(invalid).toHaveAttribute("aria-invalid", "true");
      await expect(invalid).toHaveAccessibleDescription(
        "사번을 20자 이내로 입력하세요.",
      );
      expect(
        await invalid.evaluate(textContrast, "border" as const),
      ).toBeGreaterThanOrEqual(3);
      expect(
        await example.getByRole("alert").evaluate(textContrast),
      ).toBeGreaterThanOrEqual(4.5);
      await invalid.press("End");
      await invalid.press("Backspace");
      await expect(invalid).toHaveValue("E1234567890123456789");
      await expect(invalid).not.toHaveAttribute("aria-invalid", "true");
      await expect(example.getByRole("alert")).toHaveCount(0);
      await page.setViewportSize({ width: 320, height: 740 });
      expect(
        await example.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    });
  }
}
