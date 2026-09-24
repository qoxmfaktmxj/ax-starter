import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { ExportRequest } from "../../contracts/exports";
import { can, type ExecutionContext } from "../../core/authz";
import { ApiError } from "../auth/context";
import { db } from "../db";
import { auditEvents, employees, exportJobs, fileObjects } from "../db/schema";
import { scopeSql } from "../employees/service";
function requireActor(ctx: ExecutionContext): string {
  if (ctx.principal.kind !== "user")
    throw new ApiError(403, "FORBIDDEN", "사용자 문맥이 필요합니다");
  return ctx.principal.actorId;
}

export async function requestExport(
  ctx: ExecutionContext,
  request: ExportRequest,
): Promise<{ jobId: string; status: string }> {
  if (!can(ctx, "emp.export"))
    throw new ApiError(403, "FORBIDDEN", "출력 권한이 없습니다");
  const actorId = requireActor(ctx);
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        format: request.format,
        query: request.query,
        selectedIds: request.selectedIds,
      }),
    )
    .digest("hex");
  const existing = await db
    .select()
    .from(exportJobs)
    .where(
      and(
        eq(exportJobs.actorId, actorId),
        eq(exportJobs.idempotencyKey, request.requestId),
      ),
    )
    .limit(1);
  if (existing[0]) {
    if (existing[0].payloadHash !== payloadHash)
      throw new ApiError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "같은 요청 ID에 다른 내용이 있습니다",
      );
    if (
      ctx.principal.kind !== "user" ||
      existing[0].authzVersion !== ctx.principal.authzVersion
    )
      throw new ApiError(403, "FORBIDDEN", "권한이 변경되었습니다");
    return { jobId: existing[0].id, status: existing[0].status };
  }
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(exportJobs)
        .values({
          actorId,
          idempotencyKey: request.requestId,
          payloadHash,
          format: request.format,
          request,
          authzVersion:
            ctx.principal.kind === "user" ? ctx.principal.authzVersion : 0,
        })
        .returning({ id: exportJobs.id });
      await tx.insert(auditEvents).values({
        actorId,
        correlationId: ctx.correlationId,
        action: "export.request",
        outcome: "SUCCESS",
        source: "web",
      });
      return { jobId: created.id, status: "PENDING" };
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "23505"
    ) {
      const [same] = await db
        .select()
        .from(exportJobs)
        .where(
          and(
            eq(exportJobs.actorId, actorId),
            eq(exportJobs.idempotencyKey, request.requestId),
          ),
        )
        .limit(1);
      if (
        same?.payloadHash === payloadHash &&
        ctx.principal.kind === "user" &&
        same.authzVersion === ctx.principal.authzVersion
      )
        return { jobId: same.id, status: same.status };
      throw new ApiError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "같은 요청 ID에 다른 내용이 있습니다",
      );
    }
    throw error;
  }
}

export async function getExportJob(ctx: ExecutionContext, id: string) {
  const actorId = requireActor(ctx);
  const [job] = await db
    .select()
    .from(exportJobs)
    .where(and(eq(exportJobs.id, id), eq(exportJobs.actorId, actorId)))
    .limit(1);
  if (!job)
    throw new ApiError(404, "NOT_FOUND", "출력 작업을 찾을 수 없습니다");
  return {
    id: job.id,
    status: job.status,
    format: job.format,
    snapshotAt: job.snapshotAt,
    errorCode: job.errorCode,
  };
}

export async function authorizeExportDownload(
  ctx: ExecutionContext,
  jobId: string,
) {
  const actorId = requireActor(ctx);
  const [job] = await db
    .select()
    .from(exportJobs)
    .where(and(eq(exportJobs.id, jobId), eq(exportJobs.actorId, actorId)))
    .limit(1);
  if (!job)
    throw new ApiError(404, "NOT_FOUND", "출력 작업을 찾을 수 없습니다");
  if (job.status !== "SUCCEEDED" || !job.artifactId)
    throw new ApiError(403, "FORBIDDEN", "아직 받을 수 없는 출력물입니다");
  if (
    !can(ctx, "emp.export") ||
    ctx.principal.kind !== "user" ||
    ctx.principal.authzVersion !== job.authzVersion
  )
    throw new ApiError(
      403,
      "FORBIDDEN",
      "권한이 변경되었습니다. 다시 생성하세요",
    );
  const subjectIds = job.subjectIds ?? [];
  if (subjectIds.length) {
    const visible = await db
      .select({ id: employees.id })
      .from(employees)
      .where(
        and(
          inArray(employees.id, subjectIds),
          isNull(employees.deletedAt),
          scopeSql(ctx),
        ),
      );
    if (visible.length !== subjectIds.length)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "대상 범위가 변경되었습니다. 다시 생성하세요",
      );
  }
  const [file] = await db
    .select()
    .from(fileObjects)
    .where(eq(fileObjects.id, job.artifactId))
    .limit(1);
  if (
    !file ||
    file.state !== "AVAILABLE" ||
    (file.waiverExpiresAt && file.waiverExpiresAt <= new Date())
  )
    throw new ApiError(403, "FORBIDDEN", "출력물을 다시 생성하세요");
  return { ...file, subjectIds };
}
