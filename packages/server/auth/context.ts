import { and, eq, inArray } from "drizzle-orm";
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

export const PASSWORD_ISSUER = "local-password";

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
        inArray(account.providerId, ["local-oidc", "credential"]),
      ),
    )
    .limit(1);
  if (!linked) throw new ApiError(403, "FORBIDDEN", "업무 계정이 없습니다");
  // 비밀번호 계정은 아이디로, OIDC 계정은 IdP subject로 업무 계정을 찾는다.
  const identity =
    linked.providerId === "credential"
      ? { issuer: PASSWORD_ISSUER, subject: session.user.username ?? "" }
      : {
          issuer:
            process.env.OIDC_ISSUER ??
            "http://host.docker.internal:8090/default",
          subject: linked.accountId,
        };
  if (!identity.subject)
    throw new ApiError(403, "FORBIDDEN", "업무 계정이 없습니다");
  const [row] = await db
    .select()
    .from(appUsers)
    .where(
      and(
        eq(appUsers.issuer, identity.issuer),
        eq(appUsers.subject, identity.subject),
      ),
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
