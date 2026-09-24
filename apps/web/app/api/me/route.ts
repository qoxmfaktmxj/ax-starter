import { resolveRequestContext } from "@/packages/server/auth/context";
import { errorResponse } from "@/packages/server/http";

export async function GET(request: Request) {
  try {
    const ctx = await resolveRequestContext(request.headers);
    return Response.json({
      actorId: ctx.principal.actorId,
      permissions: [...ctx.permissions],
      fields: ctx.fieldGrants,
      dataScope: ctx.dataScope,
    });
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
