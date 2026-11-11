import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type {
  DirectoryEmployee,
  OrganizationOverview,
  OrganizationUpdate,
} from "../../contracts/organization";
import { can, policyForRole, type ExecutionContext } from "../../core/authz";
import { ApiError, PASSWORD_ISSUER } from "../auth/context";
import { db } from "../db";
import {
  appUsers,
  auditEvents,
  commandResults,
  employees,
  organizations,
} from "../db/schema";
import { writeAudit } from "../employees/service";

type DirectoryTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Account = typeof appUsers.$inferSelect;
const employeeFields = {
  id: employees.id,
  employeeNo: employees.employeeNo,
  name: employees.name,
  orgId: employees.orgId,
  status: sql<DirectoryEmployee["status"]>`${employees.status}`,
};
const orgFields = {
  id: organizations.id,
  code: organizations.code,
  name: organizations.name,
  parentId: organizations.parentId,
};
const operation = "organization.update";

function principalOf(ctx: ExecutionContext) {
  if (ctx.principal.kind !== "user")
    throw new ApiError(403, "FORBIDDEN", "사용자 계정이 필요합니다");
  return ctx.principal;
}

function isManager(ctx: ExecutionContext, actor: Account) {
  return (
    can(ctx, "org.manage") &&
    ctx.dataScope === "ALL" &&
    actor.dataScope === "ALL" &&
    policyForRole(actor.roleCode).permissions.has("org.manage")
  );
}

export async function getOrganizationOverview(
  ctx: ExecutionContext,
  view: "directory" | "self" = "directory",
): Promise<OrganizationOverview> {
  const principal = principalOf(ctx);
  return db.transaction(
    async (tx) => {
      const [actor] = await tx
        .select()
        .from(appUsers)
        .where(eq(appUsers.id, principal.actorId));
      if (
        !actor?.active ||
        actor.authzVersion !== principal.authzVersion ||
        !can(ctx, "emp.read") ||
        !policyForRole(actor.roleCode).permissions.has("emp.read")
      )
        throw new ApiError(
          403,
          "FORBIDDEN",
          "인사 정보를 조회할 권한이 없습니다",
        );
      const self: OrganizationOverview["self"] = {
        employee: null,
        organization: null,
        manager: null,
      };
      if (actor.employeeId && actor.orgId) {
        const [profile] = await tx
          .select({
            employee: employeeFields,
            organization: orgFields,
            managerId: organizations.managerEmployeeId,
          })
          .from(employees)
          .innerJoin(organizations, eq(employees.orgId, organizations.id))
          .where(
            and(
              eq(employees.id, actor.employeeId),
              eq(employees.orgId, actor.orgId),
              isNull(employees.deletedAt),
            ),
          );
        if (profile) {
          self.employee = profile.employee;
          self.organization = profile.organization;
          if (profile.managerId) {
            const [manager] = await tx
              .select(employeeFields)
              .from(employees)
              .where(
                and(
                  eq(employees.id, profile.managerId),
                  eq(employees.orgId, actor.orgId),
                  eq(employees.status, "ACTIVE"),
                  isNull(employees.deletedAt),
                ),
              );
            self.manager = manager ?? null;
          }
        }
      }
      if (view === "self" || !isManager(ctx, actor))
        return { self, management: null };
      const accountRows = await tx
        .select({
          id: appUsers.id,
          subject: appUsers.subject,
          provider: sql<
            "password" | "oidc"
          >`case when ${appUsers.issuer} = ${PASSWORD_ISSUER} then 'password' else 'oidc' end`,
          orgId: appUsers.orgId,
          employeeId: appUsers.employeeId,
          active: sql<boolean>`${appUsers.active} = 1`,
          rowVersion: appUsers.rowVersion,
        })
        .from(appUsers)
        .orderBy(asc(appUsers.subject), asc(appUsers.issuer));
      const orgRows = await tx
        .select({
          ...orgFields,
          managerEmployeeId: organizations.managerEmployeeId,
          rowVersion: organizations.rowVersion,
        })
        .from(organizations)
        .orderBy(asc(organizations.code));
      const employeeRows = await tx
        .select(employeeFields)
        .from(employees)
        .where(isNull(employees.deletedAt))
        .orderBy(asc(employees.employeeNo));
      return {
        self,
        management: {
          accounts: accountRows,
          organizations: orgRows,
          employees: employeeRows,
        },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function applyUpdate(
  tx: DirectoryTx,
  request: OrganizationUpdate,
  account: Account | undefined,
) {
  const { targetId, employeeId, rowVersion, kind } = request;
  const [organization] =
    kind === "manager"
      ? await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, targetId))
          .for("no key update")
      : [];
  const target = kind === "account" ? account : organization;
  if (!target)
    throw new ApiError(404, "NOT_FOUND", "변경 대상을 찾을 수 없습니다");
  if (target.rowVersion !== rowVersion)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "다른 사용자가 변경했습니다. 새로 조회하세요",
    );

  if (employeeId) {
    const orgId = kind === "manager" ? targetId : account?.orgId;
    if (kind === "account" && !account?.active)
      throw new ApiError(
        422,
        "VALIDATION",
        "비활성 계정에는 사원을 연결할 수 없습니다",
      );
    const [employee] = await tx
      .select({ orgId: employees.orgId, status: employees.status })
      .from(employees)
      .where(and(eq(employees.id, employeeId), isNull(employees.deletedAt)))
      .for("update");
    if (!employee || employee.status !== "ACTIVE" || employee.orgId !== orgId)
      throw new ApiError(
        422,
        "VALIDATION",
        "같은 조직의 재직 사원을 선택하세요",
      );
    if (kind === "account" && account) {
      const [duplicate] = await tx
        .select({ id: appUsers.id })
        .from(appUsers)
        .where(
          and(
            eq(appUsers.issuer, account.issuer),
            eq(appUsers.employeeId, employeeId),
            ne(appUsers.id, targetId),
          ),
        )
        .limit(1);
      if (duplicate)
        throw new ApiError(
          409,
          "ALREADY_LINKED",
          "같은 로그인 제공자의 다른 계정에 연결된 사원입니다",
        );
    }
  }
  if (kind === "manager") {
    await tx
      .update(organizations)
      .set({ managerEmployeeId: employeeId, rowVersion: rowVersion + 1 })
      .where(eq(organizations.id, targetId));
  } else {
    await tx
      .update(appUsers)
      .set({
        employeeId,
        rowVersion: rowVersion + 1,
        authzVersion: sql`${appUsers.authzVersion} + 1`,
      })
      .where(eq(appUsers.id, targetId));
  }
  return { rowVersion: rowVersion + 1 };
}

type Reply = { rowVersion: number } | { code: string; message: string };

export async function updateOrganization(
  ctx: ExecutionContext,
  request: OrganizationUpdate,
): Promise<{ rowVersion: number }> {
  const principal = principalOf(ctx);
  const { kind, targetId, employeeId, rowVersion, requestId } = request;
  const hash = createHash("sha256")
    .update(JSON.stringify([kind, targetId, employeeId, rowVersion]))
    .digest("hex");
  const action =
    kind === "manager" ? "organization.manager" : "organization.account";
  let outcome: { status: number; body: Reply };
  try {
    outcome = await db.transaction(async (tx) => {
      // 계정 간 교차 변경 시에도 같은 순서로 행을 잠근다. 행 잠금은 커밋까지 유지한다.
      const ids =
        kind === "account"
          ? [principal.actorId, targetId]
          : [principal.actorId];
      const locked = await tx
        .select()
        .from(appUsers)
        .where(inArray(appUsers.id, ids))
        .orderBy(asc(appUsers.id))
        .for("update");
      const actor = locked.find((item) => item.id === principal.actorId);
      if (!actor?.active || !isManager(ctx, actor))
        throw new ApiError(
          403,
          "FORBIDDEN",
          "인사 기준정보 관리 권한이 없습니다",
        );
      const [prior] = await tx
        .select()
        .from(commandResults)
        .where(
          and(
            eq(commandResults.actorId, actor.id),
            eq(commandResults.operation, operation),
            eq(commandResults.idempotencyKey, requestId),
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
        return { status: prior.httpStatus, body: prior.result as Reply };
      }
      if (principal.authzVersion !== actor.authzVersion)
        throw new ApiError(403, "FORBIDDEN", "권한이 변경되었습니다");
      let status = 200;
      let body: Reply;
      try {
        body = await applyUpdate(
          tx,
          request,
          locked.find((item) => item.id === targetId),
        );
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        status = error.status;
        body = { code: error.code, message: error.message };
      }
      const selfUpdated =
        status === 200 && kind === "account" && targetId === actor.id;
      await tx.insert(commandResults).values({
        actorId: actor.id,
        operation,
        idempotencyKey: requestId,
        payloadHash: hash,
        authzVersion: actor.authzVersion + (selfUpdated ? 1 : 0),
        httpStatus: status,
        result: body,
      });
      await tx.insert(auditEvents).values({
        actorId: actor.id,
        correlationId: ctx.correlationId,
        action,
        outcome: status === 200 ? "SUCCESS" : "FAILED",
        subjectIds: employeeId ? [targetId, employeeId] : [targetId],
        changedFields:
          status === 200
            ? [kind === "account" ? "employeeId" : "managerEmployeeId"]
            : [],
        source: "web",
      });
      return { status, body };
    });
  } catch (error) {
    await writeAudit(
      ctx,
      action,
      error instanceof ApiError && error.status === 403 ? "DENIED" : "FAILED",
      [targetId],
    );
    throw error;
  }
  if ("code" in outcome.body)
    throw new ApiError(outcome.status, outcome.body.code, outcome.body.message);
  return outcome.body;
}
