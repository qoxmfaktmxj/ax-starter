import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  renderEmployeeXlsxToFile,
  reportRenderer,
} from "../../packages/server/reports/render";
import type { EmployeeRow } from "../../packages/contracts/employees";

const row: EmployeeRow = {
  id: "employee-1",
  employeeNo: "E001",
  name: "가상사원 <script>",
  orgId: "org-1",
  orgName: "가상조직",
  position: "담당",
  hireDate: "2024-01-31",
  status: "ACTIVE",
  rowVersion: 1,
  monthlySalary: "1250000.50",
};

describe("reportRenderer", () => {
  it("creates a named workbook with employee values and salary stored as text", async () => {
    const buffer = await reportRenderer.render(
      { id: "employee-list", version: 1 },
      { rows: [row], snapshotAt: "2026-09-24T09:00:00.000Z" },
      "xlsx",
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );

    const sheet = workbook.getWorksheet("사원명부");
    expect(sheet).toBeDefined();
    expect(sheet?.getCell("A2").value).toBe("E001");
    expect(sheet?.getCell("B2").value).toBe("가상사원 <script>");
    expect(sheet?.getCell("E2").value).toBe("2024-01-31");
    expect(sheet?.getCell("G2").value).toBe("1250000.50");
    expect(typeof sheet?.getCell("G2").value).toBe("string");
  });

  it("rejects unsupported report IDs and versions", async () => {
    await expect(
      reportRenderer.render(
        { id: "other-report", version: 1 },
        { rows: [row], snapshotAt: "2026-09-24T09:00:00.000Z" },
        "xlsx",
      ),
    ).rejects.toThrow("Unsupported report ID or version");
  });

  it("streams rows to a workbook and keeps salary values as text", async () => {
    const outputPath = join(tmpdir(), `employee-list-${randomUUID()}.xlsx`);
    async function* rows() {
      yield row;
      yield {
        ...row,
        id: "employee-2",
        employeeNo: "E002",
        name: "두 번째 사원",
      };
    }

    try {
      await renderEmployeeXlsxToFile(
        rows(),
        outputPath,
        "2026-09-24T09:00:00.000Z",
        { email: true, salary: true },
      );
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(outputPath);
      const sheet = workbook.getWorksheet("사원명부");

      expect(sheet?.getCell("A2").value).toBe("E001");
      expect(sheet?.getCell("B3").value).toBe("두 번째 사원");
      expect(sheet?.getCell("G1").value).toBe("이메일");
      expect(sheet?.getCell("H2").value).toBe("1250000.50");
      expect(typeof sheet?.getCell("H2").value).toBe("string");
    } finally {
      await rm(outputPath, { force: true });
    }
  });
});
