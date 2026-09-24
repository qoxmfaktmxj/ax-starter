import { exportRequest } from "@/packages/contracts/exports";
import { resolveRequestContext } from "@/packages/server/auth/context";
import { requestExport } from "@/packages/server/exports/service";
import {
  assertJson,
  assertSameOrigin,
  errorResponse,
} from "@/packages/server/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertJson(request);
    const ctx = await resolveRequestContext(request.headers);
    return Response.json(
      await requestExport(ctx, exportRequest.parse(await request.json())),
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
