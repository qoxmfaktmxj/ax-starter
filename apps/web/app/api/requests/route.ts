import { resolveRequestContext } from "@/packages/server/auth/context";
import {
  listEducationDrafts,
  saveEducationDraft,
} from "@/packages/server/education-requests/service";
import {
  assertJson,
  assertSameOrigin,
  errorResponse,
} from "@/packages/server/http";

export async function GET(request: Request) {
  try {
    const ctx = await resolveRequestContext(request.headers);
    return Response.json(await listEducationDrafts(ctx), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertJson(request);
    const ctx = await resolveRequestContext(request.headers);
    return Response.json(
      await saveEducationDraft(ctx, await request.json().catch(() => null)),
    );
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
