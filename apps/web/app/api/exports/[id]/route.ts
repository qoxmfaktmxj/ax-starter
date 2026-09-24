import { resolveRequestContext } from "@/packages/server/auth/context";
import { getExportJob } from "@/packages/server/exports/service";
import { errorResponse } from "@/packages/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveRequestContext(request.headers);
    return Response.json(await getExportJob(ctx, (await params).id));
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
