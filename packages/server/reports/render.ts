import ExcelJS from "exceljs";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BRAND_NAME } from "../../core/brand";
import type { EmployeeRow } from "../../contracts/employees";

export interface EmployeeListReportData {
  rows: EmployeeRow[];
  snapshotAt: string;
}

export interface ReportRenderer {
  render(
    report: { id: string; version: number },
    data: EmployeeListReportData,
    format: "pdf" | "xlsx",
  ): Promise<Buffer>;
}

const MAX_PDF_ROWS = 100;
const PDF_ROWS_PER_PAGE = 10;
const PDF_TIMEOUT_MS = 30_000;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function reportValue(value: string | null | undefined): string {
  return value ?? "";
}

async function renderXlsx(data: EmployeeListReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BRAND_NAME;
  workbook.created = new Date(data.snapshotAt);

  const sheet = workbook.addWorksheet("사원명부");
  const includeEmail = data.rows.some((row) => Object.hasOwn(row, "email"));
  const includeSalary = data.rows.some((row) =>
    Object.hasOwn(row, "monthlySalary"),
  );
  sheet.columns = [
    { header: "사번", key: "employeeNo", width: 16 },
    { header: "이름", key: "name", width: 22 },
    { header: "조직", key: "orgName", width: 30 },
    { header: "직위", key: "position", width: 18 },
    { header: "입사일", key: "hireDate", width: 16, style: { numFmt: "@" } },
    { header: "상태", key: "status", width: 14 },
    ...(includeEmail ? [{ header: "이메일", key: "email", width: 28 }] : []),
    ...(includeSalary
      ? [
          {
            header: "월 급여",
            key: "monthlySalary",
            width: 20,
            style: { numFmt: "@" },
          },
        ]
      : []),
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of data.rows) {
    const cells = sheet.addRow({
      employeeNo: row.employeeNo,
      name: row.name,
      orgName: row.orgName,
      position: row.position,
      hireDate: row.hireDate,
      status: row.status === "ACTIVE" ? "재직" : "휴직",
      ...(includeEmail ? { email: row.email ?? "" } : {}),
      ...(includeSalary ? { monthlySalary: row.monthlySalary ?? "" } : {}),
    });
    cells.getCell("hireDate").numFmt = "@";
    if (includeSalary) cells.getCell("monthlySalary").numFmt = "@";
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function renderEmployeeXlsxToFile(
  rows: AsyncIterable<EmployeeRow>,
  outputPath: string,
  snapshotAt: string,
  fields: { email: boolean; salary: boolean },
): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: outputPath,
    useStyles: true,
    useSharedStrings: false,
  });
  workbook.creator = BRAND_NAME;
  workbook.created = new Date(snapshotAt);

  const sheet = workbook.addWorksheet("사원명부");
  sheet.columns = [
    { header: "사번", key: "employeeNo", width: 16 },
    { header: "이름", key: "name", width: 22 },
    { header: "조직", key: "orgName", width: 30 },
    { header: "직위", key: "position", width: 18 },
    { header: "입사일", key: "hireDate", width: 16, style: { numFmt: "@" } },
    { header: "상태", key: "status", width: 14 },
    ...(fields.email ? [{ header: "이메일", key: "email", width: 28 }] : []),
    ...(fields.salary
      ? [
          {
            header: "월 급여",
            key: "monthlySalary",
            width: 20,
            style: { numFmt: "@" },
          },
        ]
      : []),
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).commit();

  for await (const employee of rows) {
    const values = [
      employee.employeeNo,
      employee.name,
      employee.orgName,
      employee.position,
      employee.hireDate,
      employee.status === "ACTIVE" ? "재직" : "휴직",
      ...(fields.email ? [employee.email ?? ""] : []),
      ...(fields.salary ? [employee.monthlySalary ?? ""] : []),
    ];
    const row = sheet.addRow(values);
    row.getCell(5).numFmt = "@";
    if (fields.salary) row.getCell(values.length).numFmt = "@";
    row.commit();
  }

  await workbook.commit();
}

function renderPdfHtml(
  data: EmployeeListReportData,
  fontBase64: string,
): string {
  const includeEmail = data.rows.some((row) => Object.hasOwn(row, "email"));
  const includeSalary = data.rows.some((row) =>
    Object.hasOwn(row, "monthlySalary"),
  );
  const pages: EmployeeRow[][] = [];
  const widths =
    includeEmail && includeSalary
      ? [8, 9, 18, 7, 11, 7, 19, 21]
      : includeEmail || includeSalary
        ? [9, 12, 24, 8, 12, 8, 27]
        : [12, 16, 30, 10, 17, 15];
  const colgroup = `<colgroup>${widths.map((width) => `<col style="width:${width}%">`).join("")}</colgroup>`;
  for (let index = 0; index < data.rows.length; index += PDF_ROWS_PER_PAGE) {
    pages.push(data.rows.slice(index, index + PDF_ROWS_PER_PAGE));
  }

  const tableRows = (rows: EmployeeRow[]) =>
    rows
      .map(
        (row) => `<tr>
          <td>${escapeHtml(row.employeeNo)}</td>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.orgName)}</td>
          <td>${escapeHtml(row.position)}</td>
          <td>${escapeHtml(row.hireDate)}</td>
          <td>${row.status === "ACTIVE" ? "재직" : "휴직"}</td>
          ${includeEmail ? `<td class="email">${escapeHtml(reportValue(row.email))}</td>` : ""}
          ${includeSalary ? `<td class="salary">${escapeHtml(reportValue(row.monthlySalary))}</td>` : ""}
        </tr>`,
      )
      .join("");

  const pageMarkup = pages
    .map(
      (
        rows,
        index,
      ) => `<section class="page${index === pages.length - 1 ? " lastPage" : ""}">
        ${index === 0 ? `<header><h1>사원명부</h1><p>기준 시각 ${escapeHtml(data.snapshotAt)}</p></header>` : ""}
        <table>
          ${colgroup}
          <thead><tr><th>사번</th><th>이름</th><th>조직</th><th>직위</th><th>입사일</th><th>상태</th>${includeEmail ? "<th>이메일</th>" : ""}${includeSalary ? "<th>월 급여</th>" : ""}</tr></thead>
          <tbody>${tableRows(rows)}</tbody>
        </table>
      </section>`,
    )
    .join("");

  return `<!doctype html>
  <html lang="ko"><head><meta charset="utf-8"><style>
    @font-face { font-family: "Pretendard Variable"; src: url(data:font/woff2;base64,${fontBase64}) format("woff2"); font-weight: 100 900; }
    @page { size: A4 landscape; margin: 12mm 14mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111318; font: 10pt/1.4 "Pretendard Variable", Pretendard, "Malgun Gothic", sans-serif; }
    .page { width: 100%; break-after: page; }
    .page.lastPage { break-after: auto; }
    header { height: 16mm; display: flex; align-items: baseline; justify-content: space-between; }
    h1 { margin: 0; font-size: 18pt; }
    header p { margin: 0; color: #475569; font-size: 9pt; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    th, td { min-height: 10mm; padding: 2mm 2.5mm; border: 1px solid #cbd5e1; text-align: left; overflow-wrap: anywhere; vertical-align: top; }
    th { background: #eef3fa; color: #475569; font-size: 9pt; font-weight: 600; }
    tr { break-inside: avoid; }
    .email { font-size: 8pt; }
    .salary { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 9pt; }
  </style></head><body>${pageMarkup}</body></html>`;
}

async function renderPdf(data: EmployeeListReportData): Promise<Buffer> {
  if (data.rows.length > MAX_PDF_ROWS) {
    throw new RangeError(`PDF supports at most ${MAX_PDF_ROWS} rows`);
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const fontBase64 = (
    await readFile(
      join(process.cwd(), "apps/web/public/fonts/PretendardVariable.woff2"),
    )
  ).toString("base64");
  const work = async () => {
    browser = await chromium.launch({ timeout: PDF_TIMEOUT_MS });
    try {
      const page = await browser.newPage();
      await page.route("**/*", (route) => route.abort());
      await page.setContent(renderPdfHtml(data, fontBase64), {
        waitUntil: "load",
        timeout: PDF_TIMEOUT_MS,
      });
      const output = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        margin: { top: "12mm", right: "14mm", bottom: "14mm", left: "14mm" },
        footerTemplate:
          '<div style="width:100%;padding-right:14mm;text-align:right;font:8pt sans-serif;color:#64748b"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      });
      const info = execFileSync("pdfinfo", ["-"], {
        input: output,
        encoding: "utf8",
        timeout: 5000,
      });
      const pages = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1]);
      if (!Number.isInteger(pages) || pages > 10)
        throw new RangeError("PDF exceeds 10 pages");
      return Buffer.from(output);
    } finally {
      await browser?.close();
      browser = undefined;
    }
  };

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      void browser?.close();
      reject(new Error("PDF rendering timed out after 30 seconds"));
    }, PDF_TIMEOUT_MS);
  });

  try {
    return await Promise.race([work(), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    await browser?.close();
  }
}

export const reportRenderer: ReportRenderer = {
  async render(report, data, format) {
    if (report.id !== "employee-list" || report.version !== 1) {
      throw new Error("Unsupported report ID or version");
    }
    if (format === "xlsx") return renderXlsx(data);
    return renderPdf(data);
  },
};
