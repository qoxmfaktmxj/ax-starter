import { and, eq } from "drizzle-orm";
import { account } from "./auth-schema";
import { db } from "../db";
import { appUsers } from "../db/schema";
import { policyForRole, type ExecutionContext } from "../../core/authz";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const requestCorrelations = new WeakMap<Headers, string>();

export function getRequestCorrelationId(headers: Headers): string | undefined {
  return requestCorrelations.get(headers);
}

function contextFromRow(
  row: typeof appUsers.$inferSelect,
  correlationId: string,
): ExecutionContext {
  if (!row.active)
    throw new ApiError(403, "FORBIDDEN", "활성화된 업무 계정이 아닙니다");
  if (!["ALL", "ORG", "SELF"].includes(row.dataScope))
    throw new ApiError(403, "FORBIDDEN", "지원하지 않는 접근 범위입니다");
  const policy = policyForRole(row.roleCode);
  return {
    principal: {
      kind: "user",
      actorId: row.id,
      employeeId: row.employeeId,
      orgId: row.orgId,
      authzVersion: row.authzVersion,
    },
    permissions: policy.permissions,
    dataScope: row.dataScope as ExecutionContext["dataScope"],
    fieldGrants: policy.fieldGrants,
    correlationId,
  };
}

export async function resolveRequestContext(
  headers: Headers,
): Promise<ExecutionContext> {
  const correlationId = crypto.randomUUID();
  requestCorrelations.set(headers, correlationId);
  const { auth } = await import("./auth");
  const session = await auth.api.getSession({ headers });
  if (!session)
    throw new ApiError(401, "UNAUTHENTICATED", "로그인이 필요합니다");
  const [linked] = await db
    .select()
    .from(account)
    .where(
      and(
        eq(account.userId, session.user.id),
        eq(account.providerId, "local-oidc"),
      ),
    )
    .limit(1);
  if (!linked) throw new ApiError(403, "FORBIDDEN", "업무 계정이 없습니다");
  const issuer =
    process.env.OIDC_ISSUER ?? "http://host.docker.internal:8090/default";
  const [row] = await db
    .select()
    .from(appUsers)
    .where(
      and(eq(appUsers.issuer, issuer), eq(appUsers.subject, linked.accountId)),
    )
    .limit(1);
  if (!row) throw new ApiError(403, "FORBIDDEN", "업무 계정이 없습니다");
  return contextFromRow(row, correlationId);
}

export async function resolveActorContext(
  actorId: string,
  correlationId = crypto.randomUUID(),
): Promise<ExecutionContext> {
  const [row] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.id, actorId))
    .limit(1);
  if (!row) throw new ApiError(403, "FORBIDDEN", "업무 계정이 없습니다");
  return contextFromRow(row, correlationId);
}
