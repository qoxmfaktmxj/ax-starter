import { and, eq } from "drizzle-orm";
import { homeModeUpdate, type HomeMode } from "../../contracts/home";
import type { ExecutionContext } from "../../core/authz";
import { ApiError } from "../auth/context";
import { db } from "../db";
import { appUsers } from "../db/schema";

function currentAccount(ctx: ExecutionContext) {
  const { principal } = ctx;
  if (principal.kind !== "user")
    throw new ApiError(403, "FORBIDDEN", "사용자 계정이 필요합니다");
  return and(
    eq(appUsers.id, principal.actorId),
    eq(appUsers.active, 1),
    eq(appUsers.authzVersion, principal.authzVersion),
  );
}

function modeOf(row: { mode: HomeMode } | undefined): HomeMode {
  if (!row)
    throw new ApiError(403, "FORBIDDEN", "업무 계정 정보가 변경되었습니다");
  return row.mode;
}

export async function getHomeMode(ctx: ExecutionContext): Promise<HomeMode> {
  const [row] = await db
    .select({ mode: appUsers.homeMode })
    .from(appUsers)
    .where(currentAccount(ctx));
  return modeOf(row);
}

export async function setHomeMode(
  ctx: ExecutionContext,
  input: unknown,
): Promise<HomeMode> {
  const { mode } = homeModeUpdate.parse(input);
  const [row] = await db
    .update(appUsers)
    .set({ homeMode: mode })
    .where(currentAccount(ctx))
    .returning({ mode: appUsers.homeMode });
  return modeOf(row);
}
