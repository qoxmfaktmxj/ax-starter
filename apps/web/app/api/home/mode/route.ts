import { resolveRequestContext } from "@/packages/server/auth/context";
import { getHomeMode, setHomeMode } from "@/packages/server/home/service";
import {
  assertJson,
  assertSameOrigin,
  errorResponse,
} from "@/packages/server/http";

export async function GET(request: Request) {
  try {
    const ctx = await resolveRequestContext(request.headers);
    return Response.json(
      { mode: await getHomeMode(ctx) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    assertJson(request);
    const ctx = await resolveRequestContext(request.headers);
    const input = await request.json().catch(() => null);
    return Response.json({ mode: await setHomeMode(ctx, input) });
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
