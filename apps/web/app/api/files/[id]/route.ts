import { resolveRequestContext } from "@/packages/server/auth/context";
import { markFileDeleted } from "@/packages/server/files/service";
import { assertSameOrigin, errorResponse } from "@/packages/server/http";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const ctx = await resolveRequestContext(request.headers);
    return Response.json(await markFileDeleted(ctx, (await params).id));
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
