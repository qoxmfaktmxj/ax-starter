import { resolveRequestContext } from "@/packages/server/auth/context";
import { getEducationDraft } from "@/packages/server/education-requests/service";
import { errorResponse } from "@/packages/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveRequestContext(request.headers);
    return Response.json(await getEducationDraft(ctx, (await params).id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
