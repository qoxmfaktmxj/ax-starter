import { desc, gte, lte, and } from "drizzle-orm";
import { can } from "@/packages/core/authz";
import {
  resolveRequestContext,
  ApiError,
} from "@/packages/server/auth/context";
import { db } from "@/packages/server/db";
import { auditEvents } from "@/packages/server/db/schema";
import { errorResponse } from "@/packages/server/http";

export async function GET(request: Request) {
  try {
    const ctx = await resolveRequestContext(request.headers);
    if (!can(ctx, "audit.read"))
      throw new ApiError(403, "FORBIDDEN", "감사 기록 권한이 없습니다");
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const rows = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          from ? gte(auditEvents.occurredAt, new Date(from)) : undefined,
          to ? lte(auditEvents.occurredAt, new Date(to)) : undefined,
        ),
      )
      .orderBy(desc(auditEvents.occurredAt))
      .limit(100);
    return Response.json({ rows });
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
