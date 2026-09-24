import { Readable } from "node:stream";
import { and, eq, isNull, sql } from "drizzle-orm";
import { can, type ExecutionContext } from "../../core/authz";
import { ApiError } from "../auth/context";
import { db } from "../db";
import { auditEvents, fileObjects } from "../db/schema";
import { getEmployee } from "../employees/service";
import { fileStorage, newObjectKey } from "../storage/fs";

const fixtureHash =
  "d56519cbd3a1f830e3174bf4a0b5ce369f3ef5c389cd3e09b4b367ac5e3dd243";
const maxSize = 5 * 1024 * 1024;

export async function uploadEmployeeFile(
  ctx: ExecutionContext,
  employeeId: string,
  file: File,
  signal?: AbortSignal,
) {
  if (!can(ctx, "file.upload"))
    throw new ApiError(403, "FORBIDDEN", "첨부 권한이 없습니다");
  if (ctx.principal.kind !== "user")
    throw new ApiError(403, "FORBIDDEN", "사용자 문맥이 필요합니다");
  const actorId = ctx.principal.actorId;
  await getEmployee(ctx, employeeId);
  if (file.size < 1 || file.size > maxSize)
    throw new ApiError(413, "FILE_TOO_LARGE", "파일은 5 MiB 이하여야 합니다");
  const filename = file.name.replace(/[\\/\u0000-\u001f]/g, "").slice(0, 200);
  const lower = filename.toLowerCase();
  const isPng = lower.endsWith(".png") && file.type === "image/png";
  const isPdf = lower.endsWith(".pdf") && file.type === "application/pdf";
  if (!isPng && !isPdf)
    throw new ApiError(
      422,
      "VALIDATION",
      "PNG 또는 PDF 파일만 업로드할 수 있습니다",
    );
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];
  const valid = isPng
    ? pngMagic.every((byte, index) => head[index] === byte)
    : new TextDecoder().decode(head.slice(0, 5)) === "%PDF-";
  if (!valid)
    throw new ApiError(422, "VALIDATION", "파일 형식이 올바르지 않습니다");

  const id = crypto.randomUUID();
  const objectKey = newObjectKey(id);
  const stored = await fileStorage.put(
    objectKey,
    Readable.fromWeb(file.stream() as never),
    { size: file.size, contentType: file.type },
    signal,
  );
  const waived =
    (process.env.APP_PROFILE === "local" ||
      process.env.APP_PROFILE === "test") &&
    stored.sha256 === fixtureHash;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(fileObjects).values({
        id,
        ownerKind: "EMPLOYEE",
        ownerId: employeeId,
        originalName: filename,
        size: stored.size,
        contentType: file.type,
        sha256: stored.sha256,
        backendId: "fs",
        objectKey,
        state: waived ? "AVAILABLE" : "QUARANTINED",
        scanStatus: waived ? "WAIVED" : "NOT_SCANNED",
        waiverBy: waived ? "system:local-fixture-policy" : null,
        waiverReason: waived ? "LOCAL_SYNTHETIC_FIXTURE" : null,
        waiverExpiresAt: waived
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          : null,
      });
      await tx.insert(auditEvents).values({
        actorId,
        correlationId: ctx.correlationId,
        action: "file.upload",
        outcome: "SUCCESS",
        subjectIds: [employeeId],
        source: "web",
      });
    });
  } catch (error) {
    await fileStorage.delete(objectKey);
    throw error;
  }
  return {
    fileId: id,
    state: waived ? "AVAILABLE" : "QUARANTINED",
    scanStatus: waived ? "WAIVED" : "NOT_SCANNED",
  };
}

export async function listEmployeeFiles(
  ctx: ExecutionContext,
  employeeId: string,
) {
  if (!can(ctx, "file.download"))
    throw new ApiError(403, "FORBIDDEN", "첨부 조회 권한이 없습니다");
  await getEmployee(ctx, employeeId);
  return db
    .select({
      id: fileObjects.id,
      originalName: fileObjects.originalName,
      size: fileObjects.size,
      contentType: fileObjects.contentType,
      state: fileObjects.state,
      scanStatus: fileObjects.scanStatus,
      createdAt: fileObjects.createdAt,
    })
    .from(fileObjects)
    .where(
      and(
        eq(fileObjects.ownerKind, "EMPLOYEE"),
        eq(fileObjects.ownerId, employeeId),
        isNull(fileObjects.deletedAt),
      ),
    );
}

export async function authorizeFileDownload(ctx: ExecutionContext, id: string) {
  if (!can(ctx, "file.download"))
    throw new ApiError(403, "FORBIDDEN", "다운로드 권한이 없습니다");
  const [file] = await db
    .select()
    .from(fileObjects)
    .where(eq(fileObjects.id, id))
    .limit(1);
  if (!file || file.ownerKind !== "EMPLOYEE")
    throw new ApiError(404, "NOT_FOUND", "첨부를 찾을 수 없습니다");
  await getEmployee(ctx, file.ownerId);
  const permittedScan =
    file.scanStatus === "CLEAN" ||
    (file.scanStatus === "WAIVED" &&
      file.waiverExpiresAt &&
      file.waiverExpiresAt > new Date());
  if (file.state !== "AVAILABLE" || !permittedScan || file.deletedAt) {
    throw new ApiError(403, "FORBIDDEN", "다운로드할 수 없는 파일입니다");
  }
  return file;
}

export async function markFileDeleted(ctx: ExecutionContext, id: string) {
  if (!can(ctx, "file.delete"))
    throw new ApiError(403, "FORBIDDEN", "삭제 권한이 없습니다");
  const [file] = await db
    .select()
    .from(fileObjects)
    .where(eq(fileObjects.id, id))
    .limit(1);
  if (!file || file.ownerKind !== "EMPLOYEE")
    throw new ApiError(404, "NOT_FOUND", "첨부를 찾을 수 없습니다");
  await getEmployee(ctx, file.ownerId);
  if (file.state === "DELETE_PENDING" || file.state === "DELETED")
    return { state: file.state };
  if (ctx.principal.kind !== "user")
    throw new ApiError(403, "FORBIDDEN", "사용자 문맥이 필요합니다");
  const actorId = ctx.principal.actorId;
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(fileObjects)
      .set({
        state: "DELETE_PENDING",
        deletedAt: new Date(),
        rowVersion: file.rowVersion + 1,
      })
      .where(
        and(
          eq(fileObjects.id, id),
          eq(fileObjects.rowVersion, file.rowVersion),
        ),
      )
      .returning({ id: fileObjects.id });
    if (!updated)
      throw new ApiError(
        409,
        "CONFLICT",
        "파일 상태가 변경됐습니다. 다시 시도하세요",
      );
    await tx.insert(auditEvents).values({
      actorId,
      correlationId: ctx.correlationId,
      action: "file.delete",
      outcome: "SUCCESS",
      subjectIds: [file.ownerId],
      source: "web",
    });
  });
  return { state: "DELETE_PENDING" };
}

export async function applyFileScanResult(
  id: string,
  verdict: "CLEAN" | "FAILED" | "INFECTED",
): Promise<boolean> {
  const [updated] = await db
    .update(fileObjects)
    .set({
      state: verdict === "CLEAN" ? "AVAILABLE" : "QUARANTINED",
      scanStatus: verdict,
      rowVersion: sql`${fileObjects.rowVersion} + 1`,
    })
    .where(
      and(
        eq(fileObjects.id, id),
        eq(fileObjects.state, "QUARANTINED"),
        eq(fileObjects.scanStatus, "NOT_SCANNED"),
        isNull(fileObjects.deletedAt),
      ),
    )
    .returning({ id: fileObjects.id });
  return Boolean(updated);
}
