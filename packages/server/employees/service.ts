import { createHash } from "node:crypto";
import { and, asc, desc, eq, ilike, isNull, sql, type SQL } from "drizzle-orm";
import type {
  BatchSaveRequest,
  BatchSaveResult,
  EmployeeQuery,
  EmployeeRow,
} from "../../contracts/employees";
import {
  can,
  canReadField,
  projectEmployee,
  type ExecutionContext,
} from "../../core/authz";
import { ApiError } from "../auth/context";
import { db } from "../db";
import {
  appUsers,
  auditEvents,
  commandResults,
  employees,
  organizations,
} from "../db/schema";

function actorId(ctx: ExecutionContext): string {
  if (ctx.principal.kind !== "user")
    throw new ApiError(403, "FORBIDDEN", "사용자 문맥이 필요합니다");
  return ctx.principal.actorId;
}

export function scopeSql(ctx: ExecutionContext): SQL {
  if (ctx.dataScope === "ALL") return sql`true`;
  if (ctx.principal.kind !== "user")
    throw new ApiError(403, "FORBIDDEN", "접근 범위가 없습니다");
  if (ctx.dataScope === "ORG" && ctx.principal.orgId)
    return eq(employees.orgId, ctx.principal.orgId);
  if (ctx.dataScope === "SELF" && ctx.principal.employeeId)
    return eq(employees.id, ctx.principal.employeeId);
  throw new ApiError(403, "FORBIDDEN", "접근 범위가 없습니다");
}

export async function writeAudit(
  ctx: ExecutionContext,
  action: string,
  outcome: string,
  subjectIds: string[] = [],
  changedFields: string[] = [],
): Promise<void> {
  await db.insert(auditEvents).values({
    actorId: actorId(ctx),
    correlationId: ctx.correlationId,
    action,
    outcome,
    subjectIds,
    changedFields,
    source: "web",
  });
}

export async function queryEmployees(
  ctx: ExecutionContext,
  query: EmployeeQuery,
  forExport = false,
): Promise<{ rows: EmployeeRow[]; cappedCount: number; countCapped: boolean }> {
  if (!can(ctx, forExport ? "emp.export" : "emp.read"))
    throw new ApiError(403, "FORBIDDEN", "조회 권한이 없습니다");
  const conditions: SQL[] = [isNull(employees.deletedAt), scopeSql(ctx)];
  if (query.filters.employeeNo)
    conditions.push(
      ilike(employees.employeeNo, `%${query.filters.employeeNo}%`),
    );
  if (query.filters.name)
    conditions.push(ilike(employees.name, `%${query.filters.name}%`));
  if (query.filters.orgId)
    conditions.push(eq(employees.orgId, query.filters.orgId));
  if (query.filters.status)
    conditions.push(eq(employees.status, query.filters.status));
  const where = and(...conditions);
  const sortColumns = {
    employeeNo: employees.employeeNo,
    name: employees.name,
    orgId: employees.orgId,
    hireDate: employees.hireDate,
    status: employees.status,
  };
  const order = query.sort.map((item) =>
    item.direction === "desc"
      ? desc(sortColumns[item.field])
      : asc(sortColumns[item.field]),
  );
  order.push(asc(employees.id));

  if (canReadField(ctx, "salary") && !forExport)
    await writeAudit(ctx, "employee.sensitive_read", "SUCCESS");
  const boundedCount = db
    .select({ id: employees.id })
    .from(employees)
    .where(where)
    .limit(10001)
    .as("bounded_employees");
  const [countResult, rawRows] = await Promise.all([
    db.select({ value: sql<number>`count(*)::int` }).from(boundedCount),
    db
      .select({ employee: employees, orgName: organizations.name })
      .from(employees)
      .innerJoin(organizations, eq(organizations.id, employees.orgId))
      .where(where)
      .orderBy(...order)
      .limit(query.limit)
      .offset(query.offset),
  ]);
  const rows = rawRows.map(({ employee, orgName }) =>
    projectEmployee(
      ctx,
      {
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
      },
      forExport,
    ),
  );
  const count = countResult[0]?.value ?? 0;
  return {
    rows,
    cappedCount: Math.min(count, 10001),
    countCapped: count > 10000,
  };
}

export async function getEmployee(
  ctx: ExecutionContext,
  id: string,
  forExport = false,
): Promise<EmployeeRow> {
  if (!can(ctx, forExport ? "emp.export" : "emp.read"))
    throw new ApiError(403, "FORBIDDEN", "조회 권한이 없습니다");
  const [row] = await db
    .select({ employee: employees, orgName: organizations.name })
    .from(employees)
    .innerJoin(organizations, eq(organizations.id, employees.orgId))
    .where(
      and(eq(employees.id, id), isNull(employees.deletedAt), scopeSql(ctx)),
    )
    .limit(1);
  if (!row) throw new ApiError(404, "NOT_FOUND", "사원을 찾을 수 없습니다");
  if (canReadField(ctx, "salary") && !forExport)
    await writeAudit(ctx, "employee.sensitive_read", "SUCCESS", [id]);
  return projectEmployee(
    ctx,
    {
      id: row.employee.id,
      employeeNo: row.employee.employeeNo,
      name: row.employee.name,
      orgId: row.employee.orgId,
      orgName: row.orgName,
      position: row.employee.position,
      hireDate: row.employee.hireDate,
      status: row.employee.status as EmployeeRow["status"],
      email: row.employee.email,
      monthlySalary: row.employee.monthlySalary,
      rowVersion: row.employee.rowVersion,
    },
    forExport,
  );
}

export async function saveBatch(
  ctx: ExecutionContext,
  request: BatchSaveRequest,
): Promise<{ status: number; result: BatchSaveResult }> {
  const actor = actorId(ctx);
  if (ctx.principal.kind !== "user")
    throw new ApiError(403, "FORBIDDEN", "사용자 문맥이 필요합니다");
  const principal = ctx.principal;
  for (const change of request.changes) {
    const permission =
      change.kind === "insert"
        ? "emp.create"
        : change.kind === "delete"
          ? "emp.delete"
          : "emp.update";
    if (!can(ctx, permission)) {
      await writeAudit(ctx, "employee.batch", "DENIED");
      throw new ApiError(403, "FORBIDDEN", "저장 권한이 없습니다");
    }
    if (change.kind !== "delete") {
      if ("monthlySalary" in change.values && !ctx.fieldGrants.salary?.write) {
        await writeAudit(ctx, "employee.batch", "DENIED");
        throw new ApiError(403, "FORBIDDEN", "급여 수정 권한이 없습니다");
      }
      if ("email" in change.values && !ctx.fieldGrants.contact?.write) {
        await writeAudit(ctx, "employee.batch", "DENIED");
        throw new ApiError(403, "FORBIDDEN", "연락처 수정 권한이 없습니다");
      }
    }
  }

  const payloadHash = createHash("sha256")
    .update(JSON.stringify(request.changes))
    .digest("hex");
  const advisoryKey = createHash("sha256")
    .update(`${actor}:employee.batch:${request.requestId}`)
    .digest()
    .readBigInt64BE(0);
  try {
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${advisoryKey})`);
      const [prior] = await tx
        .select()
        .from(commandResults)
        .where(
          and(
            eq(commandResults.actorId, actor),
            eq(commandResults.operation, "employee.batch"),
            eq(commandResults.idempotencyKey, request.requestId),
          ),
        )
        .limit(1);
      const [currentActor] = await tx
        .select()
        .from(appUsers)
        .where(eq(appUsers.id, actor))
        .for("update")
        .limit(1);
      if (
        !currentActor?.active ||
        currentActor.authzVersion !== principal.authzVersion
      )
        throw new ApiError(403, "FORBIDDEN", "권한이 변경되었습니다");
      if (prior) {
        if (prior.payloadHash !== payloadHash)
          throw new ApiError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "같은 요청 ID에 다른 내용이 있습니다",
          );
        if (prior.authzVersion !== currentActor.authzVersion)
          throw new ApiError(403, "FORBIDDEN", "권한이 변경되었습니다");
        return {
          status: prior.httpStatus,
          result: prior.result as BatchSaveResult,
          replay: true,
        };
      }

      const targetIds = [
        ...new Set(
          request.changes
            .filter((item) => item.kind !== "insert")
            .map((item) => item.rowId),
        ),
      ].sort();
      const targetRows = new Map<string, typeof employees.$inferSelect>();
      for (const id of targetIds) {
        const [row] = await tx
          .select()
          .from(employees)
          .where(
            and(
              eq(employees.id, id),
              isNull(employees.deletedAt),
              scopeSql(ctx),
            ),
          )
          .for("update")
          .limit(1);
        if (!row)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "저장 대상 사원을 찾을 수 없습니다",
          );
        targetRows.set(id, row);
      }

      const rowErrors: Extract<BatchSaveResult, { ok: false }>["rowErrors"] =
        [];
      const conflicts: Extract<BatchSaveResult, { ok: false }>["conflicts"] =
        [];
      const orgIds = [
        ...new Set(
          request.changes
            .filter((item) => item.kind === "insert")
            .map((item) => item.values.orgId),
        ),
      ];
      const foundOrgs = new Set<string>();
      for (const id of orgIds) {
        const [org] = await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.id, id))
          .limit(1);
        if (org) foundOrgs.add(id);
      }
      for (const change of request.changes) {
        if (
          change.kind === "insert" &&
          (!foundOrgs.has(change.values.orgId) ||
            (ctx.dataScope === "ORG" &&
              principal.orgId !== change.values.orgId) ||
            ctx.dataScope === "SELF")
        ) {
          rowErrors.push({
            rowKey: change.clientRowId,
            field: "orgId",
            message: "허용된 조직이 아닙니다",
          });
        }
      }
      for (const change of request.changes) {
        if (change.kind !== "insert") {
          const row = targetRows.get(change.rowId)!;
          if (row.rowVersion !== change.rowVersion)
            conflicts.push({ rowId: row.id, currentVersion: row.rowVersion });
        }
      }
      if (rowErrors.length || conflicts.length) {
        const status = conflicts.length ? 409 : 422;
        const result: BatchSaveResult = { ok: false, rowErrors, conflicts };
        await tx.insert(commandResults).values({
          actorId: actor,
          operation: "employee.batch",
          idempotencyKey: request.requestId,
          payloadHash,
          authzVersion: currentActor.authzVersion,
          httpStatus: status,
          result,
        });
        return { status, result, replay: false };
      }

      const idMap: Extract<BatchSaveResult, { ok: true }>["idMap"] = [];
      const versions: Extract<BatchSaveResult, { ok: true }>["versions"] = [];
      const changedFields = new Set<string>();
      for (const change of request.changes) {
        if (change.kind === "insert") {
          const id = crypto.randomUUID();
          await tx.insert(employees).values({
            ...change.values,
            id,
            monthlySalary: change.values.monthlySalary ?? null,
          });
          idMap.push({ clientRowId: change.clientRowId, rowId: id });
          versions.push({ rowId: id, rowVersion: 1 });
          Object.keys(change.values).forEach((key) => changedFields.add(key));
        } else if (change.kind === "update") {
          const row = targetRows.get(change.rowId)!;
          await tx
            .update(employees)
            .set({
              ...change.values,
              rowVersion: row.rowVersion + 1,
              updatedAt: new Date(),
            })
            .where(eq(employees.id, row.id));
          versions.push({ rowId: row.id, rowVersion: row.rowVersion + 1 });
          Object.keys(change.values).forEach((key) => changedFields.add(key));
        } else {
          const row = targetRows.get(change.rowId)!;
          await tx
            .update(employees)
            .set({
              deletedAt: new Date(),
              rowVersion: row.rowVersion + 1,
              updatedAt: new Date(),
            })
            .where(eq(employees.id, row.id));
          versions.push({ rowId: row.id, rowVersion: row.rowVersion + 1 });
        }
      }
      const result: BatchSaveResult = { ok: true, idMap, versions };
      await tx.insert(auditEvents).values({
        actorId: actor,
        correlationId: ctx.correlationId,
        action: "employee.batch",
        outcome: "SUCCESS",
        subjectIds: versions.map((item) => item.rowId),
        changedFields: [...changedFields],
        source: "web",
      });
      await tx.insert(commandResults).values({
        actorId: actor,
        operation: "employee.batch",
        idempotencyKey: request.requestId,
        payloadHash,
        authzVersion: currentActor.authzVersion,
        httpStatus: 200,
        result,
      });
      return { status: 200, result, replay: false };
    });
    if (outcome.status !== 200 && !outcome.replay)
      await writeAudit(ctx, "employee.batch", "FAILED");
    return { status: outcome.status, result: outcome.result };
  } catch (error) {
    await writeAudit(
      ctx,
      "employee.batch",
      error instanceof ApiError && error.status === 403 ? "DENIED" : "FAILED",
    );
    if (error instanceof ApiError) throw error;
    if (typeof error === "object" && error && "code" in error) {
      if (error.code === "23505")
        throw new ApiError(422, "VALIDATION", "이미 사용 중인 사번입니다");
      if (error.code === "55P03" || error.code === "57014")
        throw new ApiError(503, "RETRY", "잠시 후 다시 저장하세요");
    }
    throw error;
  }
}
