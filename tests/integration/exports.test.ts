import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../../packages/server/db";
import {
  appUsers,
  exportJobs,
  fileObjects,
} from "../../packages/server/db/schema";
import { resolveActorContext } from "../../packages/server/auth/context";
import {
  authorizeExportDownload,
  getExportJob,
  requestExport,
} from "../../packages/server/exports/service";
import { processExportJob } from "../../packages/server/exports/processor";
import { fileStorage } from "../../packages/server/storage/fs";

const adminId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const managerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";
const seededIds = Array.from(
  { length: 24 },
  (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

async function fileBytes(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of await fileStorage.get(key))
    chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe("export jobs with actual artifacts", () => {
  it("replays one job, keeps one xlsx artifact, and preserves salary strings", async () => {
    const ctx = await resolveActorContext(adminId);
    const request = {
      requestId: randomUUID(),
      format: "xlsx" as const,
      selectedIds: seededIds,
    };
    const created = await requestExport(ctx, request);
    expect(await requestExport(ctx, request)).toEqual(created);
    await processExportJob(created.jobId);
    await processExportJob(created.jobId);
    expect((await getExportJob(ctx, created.jobId)).status).toBe("SUCCEEDED");
    const file = await authorizeExportDownload(ctx, created.jobId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await fileBytes(file.objectKey)) as never);
    const sheet = workbook.getWorksheet("사원명부")!;
    expect(sheet.rowCount).toBe(25);
    expect(sheet.getCell("B2").value).toBe("가상사원01");
    expect(sheet.getCell("H2").value).toBe("9999999999999999.99");
    expect(typeof sheet.getCell("H2").value).toBe("string");
    const artifacts = await db
      .select()
      .from(fileObjects)
      .where(
        and(
          eq(fileObjects.ownerKind, "EXPORT"),
          eq(fileObjects.ownerId, created.jobId),
        ),
      );
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].state).toBe("AVAILABLE");
    await db
      .update(exportJobs)
      .set({ status: "FAILED" })
      .where(eq(exportJobs.id, created.jobId));
    await db
      .update(fileObjects)
      .set({ state: "PENDING" })
      .where(eq(fileObjects.id, file.id));
    await processExportJob(created.jobId);
    expect((await getExportJob(ctx, created.jobId)).status).toBe("SUCCEEDED");
    expect((await authorizeExportDownload(ctx, created.jobId)).id).toBe(
      file.id,
    );
    const afterRetry = await db
      .select()
      .from(fileObjects)
      .where(eq(fileObjects.ownerId, created.jobId));
    expect(afterRetry).toHaveLength(1);
  });

  it("generates a multi-page Korean PDF and omits salary for the manager", async () => {
    const admin = await resolveActorContext(adminId);
    const adminJob = await requestExport(admin, {
      requestId: randomUUID(),
      format: "pdf",
      selectedIds: seededIds,
    });
    await processExportJob(adminJob.jobId);
    const adminFile = await authorizeExportDownload(admin, adminJob.jobId);
    const adminBytes = await fileBytes(adminFile.objectKey);
    expect(adminBytes.subarray(0, 5).toString()).toBe("%PDF-");
    await mkdir("output/pdf", { recursive: true });
    const adminPath = `output/pdf/admin-${adminJob.jobId}.pdf`;
    await writeFile(adminPath, adminBytes);
    const info = execFileSync("pdfinfo", [adminPath], { encoding: "utf8" });
    const pageCount = Number(info.match(/Pages:\s*(\d+)/)?.[1]);
    expect(pageCount).toBeGreaterThanOrEqual(2);
    expect(pageCount).toBeLessThanOrEqual(10);
    const adminText = execFileSync("pdftotext", ["-layout", adminPath, "-"], {
      encoding: "utf8",
    });
    expect(adminText).toContain("가상사원01");
    expect(adminText).toContain("가상사원24");
    expect(adminText).toContain("9999999999999999.99");
    execFileSync("pdftoppm", [
      "-f",
      "1",
      "-l",
      "1",
      "-scale-to",
      "1200",
      "-png",
      "-singlefile",
      adminPath,
      `output/pdf/admin-first-${adminJob.jobId}`,
    ]);
    execFileSync("pdftoppm", [
      "-f",
      String(pageCount),
      "-l",
      String(pageCount),
      "-scale-to",
      "1200",
      "-png",
      "-singlefile",
      adminPath,
      `output/pdf/admin-last-${adminJob.jobId}`,
    ]);
    expect(
      (await readFile(`output/pdf/admin-first-${adminJob.jobId}.png`)).length,
    ).toBeGreaterThan(1000);
    expect(
      (await readFile(`output/pdf/admin-last-${adminJob.jobId}.png`)).length,
    ).toBeGreaterThan(1000);

    const manager = await resolveActorContext(managerId);
    const managerJob = await requestExport(manager, {
      requestId: randomUUID(),
      format: "pdf",
      selectedIds: seededIds.slice(0, 12),
    });
    await processExportJob(managerJob.jobId);
    const managerFile = await authorizeExportDownload(
      manager,
      managerJob.jobId,
    );
    const managerPath = `output/pdf/manager-${managerJob.jobId}.pdf`;
    await writeFile(managerPath, await fileBytes(managerFile.objectKey));
    const managerText = execFileSync(
      "pdftotext",
      ["-layout", managerPath, "-"],
      { encoding: "utf8" },
    );
    expect(managerText).toContain("가상사원01");
    expect(managerText).not.toContain("9999999999999999.99");
    expect(managerText).not.toContain("월 급여");
    const managerExcelJob = await requestExport(manager, {
      requestId: randomUUID(),
      format: "xlsx",
      selectedIds: seededIds.slice(0, 12),
    });
    await processExportJob(managerExcelJob.jobId);
    const managerExcelFile = await authorizeExportDownload(
      manager,
      managerExcelJob.jobId,
    );
    const managerWorkbook = new ExcelJS.Workbook();
    await managerWorkbook.xlsx.load(
      (await fileBytes(managerExcelFile.objectKey)) as never,
    );
    const managerSheet = managerWorkbook.getWorksheet("사원명부")!;
    expect(managerSheet.rowCount).toBe(13);
    expect(managerSheet.getRow(1).values).not.toContain("월 급여");
    expect(managerSheet.getCell("G1").value).toBe("이메일");
  });

  it("denies a queued job after authorization changes and blocks old downloads", async () => {
    const before = await resolveActorContext(adminId);
    const queued = await requestExport(before, {
      requestId: randomUUID(),
      format: "xlsx",
      selectedIds: seededIds.slice(0, 1),
    });
    await db
      .update(appUsers)
      .set({ authzVersion: sql`${appUsers.authzVersion} + 1` })
      .where(eq(appUsers.id, adminId));
    await processExportJob(queued.jobId);
    const current = await resolveActorContext(adminId);
    expect((await getExportJob(current, queued.jobId)).status).toBe("DENIED");
    await expect(
      authorizeExportDownload(current, queued.jobId),
    ).rejects.toMatchObject({ status: 403 });
    const [job] = await db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, queued.jobId));
    expect(job.artifactId).toBeNull();
  });

  it("blocks a finished artifact after the owner moves out of its subject scope", async () => {
    const manager = await resolveActorContext(managerId);
    const requested = await requestExport(manager, {
      requestId: randomUUID(),
      format: "xlsx",
      selectedIds: seededIds.slice(0, 1),
    });
    await processExportJob(requested.jobId);
    expect(
      (await authorizeExportDownload(manager, requested.jobId)).state,
    ).toBe("AVAILABLE");
    await db
      .update(appUsers)
      .set({ orgId: orgB, authzVersion: sql`${appUsers.authzVersion} + 1` })
      .where(eq(appUsers.id, managerId));
    try {
      const moved = await resolveActorContext(managerId);
      await expect(
        authorizeExportDownload(moved, requested.jobId),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      await db
        .update(appUsers)
        .set({ orgId: orgA, authzVersion: sql`${appUsers.authzVersion} + 1` })
        .where(eq(appUsers.id, managerId));
    }
  });
});
