import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  and,
  asc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  type SQL,
} from "drizzle-orm";
import type { ExportRequest } from "../../contracts/exports";
import type { EmployeeRow } from "../../contracts/employees";
import {
  can,
  canReadField,
  projectEmployee,
  type ExecutionContext,
} from "../../core/authz";
import { ApiError, resolveActorContext } from "../auth/context";
import { db, pool } from "../db";
import {
  appUsers,
  auditEvents,
  employees,
  exportJobItems,
  exportJobs,
  fileObjects,
  organizations,
} from "../db/schema";
import { scopeSql } from "../employees/service";
import { checkStorageMarker, fileStorage, newObjectKey } from "../storage/fs";
import { renderEmployeeXlsxToFile, reportRenderer } from "../reports/render";

function exportWhere(ctx: ExecutionContext, request: ExportRequest): SQL {
  const filters = request.query?.filters;
  const conditions: SQL[] = [isNull(employees.deletedAt), scopeSql(ctx)];
  if (request.selectedIds)
    conditions.push(inArray(employees.id, request.selectedIds));
  if (filters?.employeeNo)
    conditions.push(ilike(employees.employeeNo, `%${filters.employeeNo}%`));
  if (filters?.name)
    conditions.push(ilike(employees.name, `%${filters.name}%`));
  if (filters?.orgId) conditions.push(eq(employees.orgId, filters.orgId));
  if (filters?.status) conditions.push(eq(employees.status, filters.status));
  return and(...conditions)!;
}

async function ensureSnapshot(
  job: typeof exportJobs.$inferSelect,
  ctx: ExecutionContext,
): Promise<void> {
  if (job.snapshotAt) return;
  const request = job.request as ExportRequest;
  const maxRows = job.format === "pdf" ? 100 : 2000;
  await db.transaction(
    async (tx) => {
      const [locked] = await tx
        .select()
        .from(exportJobs)
        .where(eq(exportJobs.id, job.id))
        .for("update")
        .limit(1);
      if (locked?.snapshotAt) return;
      const [actor] = await tx
        .select()
        .from(appUsers)
        .where(eq(appUsers.id, job.actorId))
        .for("update")
        .limit(1);
      if (!actor?.active || actor.authzVersion !== job.authzVersion)
        throw new ApiError(403, "FORBIDDEN", "출력 권한이 변경되었습니다");
      let ordinal = 0;
      let lastId: string | undefined;
      const subjectIds: string[] = [];
      while (true) {
        const where = and(
          exportWhere(ctx, request),
          lastId ? gt(employees.id, lastId) : undefined,
        );
        const batch = await tx
          .select({ employee: employees, orgName: organizations.name })
          .from(employees)
          .innerJoin(organizations, eq(organizations.id, employees.orgId))
          .where(where)
          .orderBy(asc(employees.id))
          .limit(200);
        if (!batch.length) break;
        if (ordinal + batch.length > maxRows)
          throw new ApiError(
            422,
            "VALIDATION",
            "출력 건수가 한도를 초과했습니다. 조건을 좁혀 주세요",
          );
        const items = batch.map(({ employee, orgName }) => {
          const row: EmployeeRow = {
            id: employee.id,
            employeeNo: employee.employeeNo,
            name: employee.name,
            orgId: employee.orgId,
            orgName,
            position: employee.position,
            hireDate: employee.hireDate,
            status: employee.status as EmployeeRow["status"],
            email: employee.email,
            monthlySalary: employee.monthlySalary,
            rowVersion: employee.rowVersion,
          };
          ordinal += 1;
          subjectIds.push(employee.id);
          return {
            jobId: job.id,
            ordinal,
            employeeId: employee.id,
            projectedJson: projectEmployee(ctx, row, true),
          };
        });
        await tx.insert(exportJobItems).values(items);
        lastId = batch[batch.length - 1].employee.id;
        if (batch.length < 200) break;
      }
      if (
        request.selectedIds &&
        subjectIds.length !== new Set(request.selectedIds).size
      )
        throw new ApiError(
          403,
          "FORBIDDEN",
          "선택한 행의 접근 권한을 확인하세요",
        );
      await tx
        .update(exportJobs)
        .set({
          snapshotAt: new Date(),
          subjectIds,
          projectionVersion: 1,
          status: "RUNNING",
          updatedAt: new Date(),
        })
        .where(eq(exportJobs.id, job.id));
    },
    { isolationLevel: "repeatable read" },
  );
}

async function denyJob(
  jobId: string,
  actorId: string,
  reason: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(exportJobs)
      .set({ status: "DENIED", errorCode: reason, updatedAt: new Date() })
      .where(eq(exportJobs.id, jobId));
    await tx.insert(auditEvents).values({
      actorId,
      correlationId: crypto.randomUUID(),
      action: "export.generate",
      outcome: "DENIED",
      source: "worker",
    });
  });
}

async function* snapshotRows(jobId: string): AsyncGenerator<EmployeeRow> {
  let lastOrdinal = 0;
  while (true) {
    const batch = await db
      .select({
        ordinal: exportJobItems.ordinal,
        projectedJson: exportJobItems.projectedJson,
      })
      .from(exportJobItems)
      .where(
        and(
          eq(exportJobItems.jobId, jobId),
          gt(exportJobItems.ordinal, lastOrdinal),
        ),
      )
      .orderBy(asc(exportJobItems.ordinal))
      .limit(200);
    for (const item of batch) yield item.projectedJson as EmployeeRow;
    if (batch.length < 200) return;
    lastOrdinal = batch[batch.length - 1].ordinal;
  }
}

async function fingerprint(
  body: Readable,
): Promise<{ size: number; sha256: string }> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of body) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    hash.update(bytes);
  }
  return { size, sha256: hash.digest("hex") };
}

export async function processExportJob(jobId: string): Promise<void> {
  const client = await pool.connect();
  let tempDirectory: string | undefined;
  let tempFile: string | undefined;
  const key = createHash("sha256")
    .update(`export:${jobId}`)
    .digest()
    .readBigInt64BE(0);
  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [key.toString()]);
    const [job] = await db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, jobId))
      .limit(1);
    if (!job || job.status === "SUCCEEDED" || job.status === "DENIED") return;
    let ctx: ExecutionContext;
    try {
      ctx = await resolveActorContext(job.actorId);
      if (
        !can(ctx, "emp.export") ||
        ctx.principal.kind !== "user" ||
        ctx.principal.authzVersion !== job.authzVersion
      )
        throw new ApiError(403, "FORBIDDEN", "출력 권한이 변경되었습니다");
      await ensureSnapshot(job, ctx);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        await denyJob(jobId, job.actorId, error.code);
        return;
      }
      throw error;
    }
    const [current] = await db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, jobId))
      .limit(1);
    if (current.format !== "xlsx" && current.format !== "pdf")
      throw new Error("Unsupported export format");
    const artifactId = current.artifactId ?? crypto.randomUUID();
    const [existingFile] = await db
      .select()
      .from(fileObjects)
      .where(eq(fileObjects.id, artifactId))
      .limit(1);
    const objectKey = existingFile?.objectKey ?? newObjectKey(artifactId);
    const contentType =
      current.format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf";
    const finalExists = await fileStorage.exists(objectKey);
    if (finalExists) {
      if (
        !existingFile ||
        existingFile.state !== "PENDING" ||
        existingFile.contentType !== contentType
      ) {
        throw new Error("Unexpected existing export artifact");
      }
      const actual = await fingerprint(await fileStorage.get(objectKey));
      if (
        actual.size !== existingFile.size ||
        actual.sha256 !== existingFile.sha256
      ) {
        throw new Error("Existing artifact hash mismatch");
      }
    } else {
      let fileBody: Readable;
      let size: number;
      let sha256: string;
      if (current.format === "xlsx") {
        await checkStorageMarker();
        tempDirectory = await mkdtemp(
          join(process.env.FILE_ROOT ?? "/data/files", ".report-"),
        );
        tempFile = join(tempDirectory, "employee-list.xlsx");
        const [firstItem] = await db
          .select({ projectedJson: exportJobItems.projectedJson })
          .from(exportJobItems)
          .where(eq(exportJobItems.jobId, jobId))
          .orderBy(asc(exportJobItems.ordinal))
          .limit(1);
        const firstRow = firstItem?.projectedJson as EmployeeRow | undefined;
        await renderEmployeeXlsxToFile(
          snapshotRows(jobId),
          tempFile,
          current.snapshotAt!.toISOString(),
          {
            email: firstRow
              ? Object.hasOwn(firstRow, "email")
              : canReadField(ctx, "contact", true),
            salary: firstRow
              ? Object.hasOwn(firstRow, "monthlySalary")
              : canReadField(ctx, "salary", true),
          },
        );
        const info = await fingerprint(createReadStream(tempFile));
        size = info.size;
        sha256 = info.sha256;
        fileBody = createReadStream(tempFile);
      } else {
        const rows: EmployeeRow[] = [];
        for await (const row of snapshotRows(jobId)) rows.push(row);
        const buffer = await reportRenderer.render(
          { id: "employee-list", version: 1 },
          { rows, snapshotAt: current.snapshotAt!.toISOString() },
          "pdf",
        );
        size = buffer.length;
        sha256 = createHash("sha256").update(buffer).digest("hex");
        fileBody = Readable.from(buffer);
      }
      if (existingFile) {
        if (
          existingFile.state !== "PENDING" ||
          existingFile.contentType !== contentType
        ) {
          throw new Error("Unexpected export artifact state");
        }
        await db
          .update(fileObjects)
          .set({
            size,
            sha256,
            waiverExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          })
          .where(eq(fileObjects.id, artifactId));
      } else {
        await db.insert(fileObjects).values({
          id: artifactId,
          ownerKind: "EXPORT",
          ownerId: jobId,
          originalName: `employee-list.${current.format}`,
          size,
          contentType,
          sha256,
          backendId: "fs",
          objectKey,
          state: "PENDING",
          scanStatus: "WAIVED",
          waiverBy: "system:report-renderer",
          waiverReason: "APP_GENERATED_REPORT",
          waiverExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
      }
      const stored = await fileStorage.put(objectKey, fileBody, {
        size,
        contentType,
      });
      if (stored.size !== size || stored.sha256 !== sha256)
        throw new Error("Written artifact hash mismatch");
    }
    await db
      .update(exportJobs)
      .set({ artifactId })
      .where(eq(exportJobs.id, jobId));
    await db.transaction(async (tx) => {
      const [actor] = await tx
        .select()
        .from(appUsers)
        .where(eq(appUsers.id, job.actorId))
        .for("update")
        .limit(1);
      if (!actor?.active || actor.authzVersion !== job.authzVersion)
        throw new ApiError(403, "FORBIDDEN", "출력 권한이 변경되었습니다");
      const currentCtx = await resolveActorContext(job.actorId);
      if (!can(currentCtx, "emp.export"))
        throw new ApiError(403, "FORBIDDEN", "출력 권한이 변경되었습니다");
      const subjectIds = current.subjectIds ?? [];
      if (subjectIds.length) {
        const inRange = await tx
          .select({ id: employees.id, orgId: employees.orgId })
          .from(employees)
          .where(
            and(
              inArray(employees.id, subjectIds),
              isNull(employees.deletedAt),
              scopeSql(currentCtx),
            ),
          );
        if (inRange.length !== subjectIds.length)
          throw new ApiError(
            403,
            "FORBIDDEN",
            "출력 대상의 접근 범위가 변경되었습니다",
          );
      }
      await tx
        .update(fileObjects)
        .set({ state: "AVAILABLE" })
        .where(eq(fileObjects.id, artifactId));
      await tx
        .update(exportJobs)
        .set({ status: "SUCCEEDED", artifactId, updatedAt: new Date() })
        .where(eq(exportJobs.id, jobId));
      await tx.insert(auditEvents).values({
        actorId: job.actorId,
        correlationId: ctx.correlationId,
        action: "export.generate",
        outcome: "SUCCESS",
        subjectIds,
        source: "worker",
      });
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 403)
      await denyJob(
        jobId,
        (
          await db
            .select()
            .from(exportJobs)
            .where(eq(exportJobs.id, jobId))
            .limit(1)
        )[0].actorId,
        error.code,
      );
    else
      await db
        .update(exportJobs)
        .set({
          status: "FAILED",
          errorCode: "GENERATION_FAILED",
          updatedAt: new Date(),
        })
        .where(eq(exportJobs.id, jobId));
    throw error;
  } finally {
    try {
      if (tempFile)
        await unlink(tempFile).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      if (tempDirectory)
        await rmdir(tempDirectory).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
    } finally {
      await client
        .query("SELECT pg_advisory_unlock($1::bigint)", [key.toString()])
        .catch(() => {});
      client.release();
    }
  }
}
