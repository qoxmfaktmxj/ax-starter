import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInWithPassword } from "./login";

async function openBatch(page: Page) {
  await signInWithPassword(page, "hr-admin");
  await page.waitForURL("**/employees");
  await page.getByRole("button", { name: "일괄편집" }).click();
  await expect(
    page.getByRole("gridcell", { name: "E001", exact: true }),
  ).toBeVisible();
}

function employeeCell(page: Page, employeeNo: string, value: string): Locator {
  return page
    .getByRole("row")
    .filter({ hasText: employeeNo })
    .getByRole("gridcell", { name: value, exact: true });
}

async function paste(cell: Locator, text: string) {
  await cell.click();
  await cell.evaluate((element, value) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", value);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  }, text);
}

async function copy(cell: Locator): Promise<string> {
  return cell.evaluate((element) => {
    const clipboardData = new DataTransfer();
    element.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
    return clipboardData.getData("text/plain");
  });
}

test("clipboard paste is one unsaved action with undo and redo", async ({
  page,
}) => {
  await openBatch(page);
  const original = employeeCell(page, "E001", "가상사원01");
  await paste(original, "붙여넣기 이름");
  const changed = employeeCell(page, "E001", "붙여넣기 이름");
  await expect(changed).toBeVisible();
  expect(await copy(changed)).toBe("붙여넣기 이름");
  await page.getByRole("button", { name: "실행 취소" }).click();
  await expect(original).toBeVisible();
  await page.getByRole("button", { name: "다시 실행" }).click();
  await expect(changed).toBeVisible();
  await expect(page.getByRole("button", { name: "저장 1건" })).toBeEnabled();
});

test("paste rejects a locked cell without changing the adjacent editable cell", async ({
  page,
}) => {
  await openBatch(page);
  await paste(employeeCell(page, "E001", "E001"), "E999\t바뀐 이름");
  await expect(
    page.getByRole("alert").filter({ hasText: "편집할 수 없는 셀" }),
  ).toBeVisible();
  await expect(employeeCell(page, "E001", "가상사원01")).toBeVisible();
  await expect(page.getByRole("button", { name: "저장 0건" })).toBeDisabled();
});

test("dragging a range copies its visible cells", async ({ page }) => {
  await openBatch(page);
  const first = employeeCell(page, "E001", "가상사원01");
  const second = employeeCell(page, "E002", "김가람");
  const start = await first.boundingBox();
  const end = await second.boundingBox();
  expect(start && end).toBeTruthy();
  await page.mouse.move(
    start!.x + start!.width / 2,
    start!.y + start!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  expect(await copy(second)).toBe("가상사원01\r\n김가람");
});

test("drag fill repeats a text value and undo restores the target row", async ({
  page,
}) => {
  await openBatch(page);
  const first = employeeCell(page, "E001", "가상사원01");
  const second = employeeCell(page, "E002", "김가람");
  await first.click();
  const start = await first.boundingBox();
  const end = await second.boundingBox();
  expect(start && end).toBeTruthy();
  await page.mouse.move(
    start!.x + start!.width - 5,
    start!.y + start!.height - 5,
  );
  await page.mouse.down();
  await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(employeeCell(page, "E002", "가상사원01")).toBeVisible();
  await page.getByRole("button", { name: "실행 취소" }).click();
  await expect(second).toBeVisible();
});

test("adding a row can be undone and redone as one action", async ({
  page,
}) => {
  await openBatch(page);
  const answers = ["E999", "추가 테스트"];
  page.on("dialog", (dialog) => void dialog.accept(answers.shift()));
  await page.getByRole("button", { name: "추가" }).click();
  await expect(employeeCell(page, "E999", "추가 테스트")).toBeVisible();
  await page.getByRole("button", { name: "실행 취소" }).click();
  await expect(employeeCell(page, "E999", "추가 테스트")).toHaveCount(0);
  await page.getByRole("button", { name: "다시 실행" }).click();
  await expect(employeeCell(page, "E999", "추가 테스트")).toBeVisible();
});
