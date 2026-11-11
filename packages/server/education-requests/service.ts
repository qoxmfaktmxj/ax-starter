import { createHash } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  educationRequestSave,
  type EducationDraft,
  type EducationInbox,
  type EducationRequestSave,
} from "../../contracts/education-requests";
import { can, policyForRole, type ExecutionContext } from "../../core/authz";
import { ApiError } from "../auth/context";
import { db } from "../db";
import {
  appUsers,
  auditEvents,
  commandResults,
  educationCourses,
  educationDrafts,
  employees,
} from "../db/schema";
import { writeAudit } from "../employees/service";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const operation = "education.draft.save";
const summaryFields = {
  id: educationDrafts.id,
  rowVersion: educationDrafts.rowVersion,
  updatedAt: educationDrafts.updatedAt,
  course: {
    id: educationCourses.id,
    code: educationCourses.code,
    name: educationCourses.name,
  },
};

async function getActor(tx: Tx, ctx: ExecutionContext, forSave = false) {
  if (ctx.principal.kind !== "user" || !can(ctx, "education.draft"))
    throw new ApiError(403, "FORBIDDEN", "내 신청함 접근 권한이 없습니다");
  const query = tx
    .select()
    .from(appUsers)
    .where(eq(appUsers.id, ctx.principal.actorId));
  // 계정 상태 변경과 같은 계정의 저장/재시도를 직렬화한다.
  const [actor] = await (forSave ? query.for("no key update") : query);
  if (
    !actor?.active ||
    actor.authzVersion !== ctx.principal.authzVersion ||
    !policyForRole(actor.roleCode).permissions.has("education.draft")
  )
    throw new ApiError(
      403,
      "FORBIDDEN",
      "내 신청함 접근 권한이 변경되었습니다",
    );
  return actor;
}

export async function listEducationDrafts(
  ctx: ExecutionContext,
): Promise<EducationInbox> {
  return db.transaction(
    async (tx) => {
      const actor = await getActor(tx, ctx);
      const rows = await tx
        .select(summaryFields)
        .from(educationDrafts)
        .leftJoin(
          educationCourses,
          eq(educationDrafts.courseId, educationCourses.id),
        )
        .where(eq(educationDrafts.ownerId, actor.id))
        .orderBy(desc(educationDrafts.updatedAt), desc(educationDrafts.id));
      const courses = await tx
        .select()
        .from(educationCourses)
        .orderBy(asc(educationCourses.code));
      const [employee] =
        actor.employeeId && actor.orgId
          ? await tx
              .select({
                employeeNo: employees.employeeNo,
                name: employees.name,
              })
              .from(employees)
              .where(
                and(
                  eq(employees.id, actor.employeeId),
                  eq(employees.orgId, actor.orgId),
                  isNull(employees.deletedAt),
                ),
              )
          : [];
      return {
        drafts: rows.map((row) => ({
          ...row,
          updatedAt: row.updatedAt.toISOString(),
          status: "DRAFT" as const,
        })),
        courses,
        applicant: { account: actor.subject, employee: employee ?? null },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getEducationDraft(
  ctx: ExecutionContext,
  id: string,
): Promise<EducationDraft> {
  return db.transaction(
    async (tx) => {
      const actor = await getActor(tx, ctx);
      if (!z.uuid().safeParse(id).success)
        throw new ApiError(404, "NOT_FOUND", "신청서를 찾을 수 없습니다");
      const [row] = await tx
        .select({ ...summaryFields, reason: educationDrafts.reason })
        .from(educationDrafts)
        .leftJoin(
          educationCourses,
          eq(educationDrafts.courseId, educationCourses.id),
        )
        .where(
          and(
            eq(educationDrafts.ownerId, actor.id),
            eq(educationDrafts.id, id),
          ),
        );
      if (!row)
        throw new ApiError(404, "NOT_FOUND", "신청서를 찾을 수 없습니다");
      return {
        ...row,
        status: "DRAFT",
        updatedAt: row.updatedAt.toISOString(),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

type Saved = { id: string; rowVersion: number };

async function persistDraft(
  tx: Tx,
  ownerId: string,
  request: EducationRequestSave,
): Promise<Saved> {
  if ("id" in request) {
    const [existing] = await tx
      .select({ version: educationDrafts.rowVersion })
      .from(educationDrafts)
      .where(
        and(
          eq(educationDrafts.ownerId, ownerId),
          eq(educationDrafts.id, request.id),
        ),
      );
    if (!existing)
      throw new ApiError(404, "NOT_FOUND", "신청서를 찾을 수 없습니다");
    if (existing.version !== request.rowVersion)
      throw new ApiError(
        409,
        "VERSION_CONFLICT",
        "다른 화면에서 저장한 내용이 있습니다. 최신 초안을 확인하세요.",
      );
  }
  if (request.courseId !== null) {
    const [course] = await tx
      .select({ id: educationCourses.id })
      .from(educationCourses)
      .where(eq(educationCourses.id, request.courseId))
      .for("key share");
    if (!course)
      throw new ApiError(422, "VALIDATION", "교육 과정을 다시 선택하세요.");
  }
  const values = { courseId: request.courseId, reason: request.reason };
  const returning = {
    id: educationDrafts.id,
    rowVersion: educationDrafts.rowVersion,
  };
  if ("id" in request) {
    const [row] = await tx
      .update(educationDrafts)
      .set({
        ...values,
        rowVersion: request.rowVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(educationDrafts.id, request.id),
          eq(educationDrafts.ownerId, ownerId),
          eq(educationDrafts.rowVersion, request.rowVersion),
        ),
      )
      .returning(returning);
    if (!row)
      throw new ApiError(409, "VERSION_CONFLICT", "최신 초안을 확인하세요.");
    return row;
  }
  const [row] = await tx
    .insert(educationDrafts)
    .values({ ...values, ownerId })
    .returning(returning);
  return row;
}

export async function saveEducationDraft(
  ctx: ExecutionContext,
  input: unknown,
): Promise<Saved> {
  type Body = Saved | { code: string; message: string };
  let outcome: { status: number; body: Body };
  try {
    outcome = await db.transaction(async (tx) => {
      const actor = await getActor(tx, ctx, true);
      const request = educationRequestSave.parse(input);
      const hash = createHash("sha256")
        .update(JSON.stringify(request))
        .digest("hex");
      const [prior] = await tx
        .select()
        .from(commandResults)
        .where(
          and(
            eq(commandResults.actorId, actor.id),
            eq(commandResults.operation, operation),
            eq(commandResults.idempotencyKey, request.requestId),
          ),
        );
      if (prior) {
        if (prior.authzVersion !== actor.authzVersion)
          throw new ApiError(403, "FORBIDDEN", "권한이 변경되었습니다");
        if (prior.payloadHash !== hash)
          throw new ApiError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "같은 요청 ID에 다른 내용이 있습니다",
          );
        return { status: prior.httpStatus, body: prior.result as Body };
      }
      let status = 200;
      let body: Body;
      try {
        body = await persistDraft(tx, actor.id, request);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        status = error.status;
        body = { code: error.code, message: error.message };
      }
      await tx.insert(commandResults).values({
        actorId: actor.id,
        operation,
        idempotencyKey: request.requestId,
        payloadHash: hash,
        authzVersion: actor.authzVersion,
        httpStatus: status,
        result: body,
      });
      await tx.insert(auditEvents).values({
        actorId: actor.id,
        correlationId: ctx.correlationId,
        action: operation,
        outcome: status === 200 ? "SUCCESS" : "FAILED",
        subjectIds: "id" in body ? [body.id] : [],
        changedFields: status === 200 ? ["courseId", "reason"] : [],
        source: "web",
      });
      return { status, body };
    });
  } catch (error) {
    if (ctx.principal.kind === "user")
      await writeAudit(
        ctx,
        operation,
        error instanceof ApiError && error.status === 403 ? "DENIED" : "FAILED",
      );
    throw error;
  }
  if ("code" in outcome.body)
    throw new ApiError(outcome.status, outcome.body.code, outcome.body.message);
  return outcome.body;
}
