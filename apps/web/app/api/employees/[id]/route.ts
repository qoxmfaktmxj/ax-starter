import { resolveRequestContext } from "@/packages/server/auth/context";
import { getEmployee } from "@/packages/server/employees/service";
import { errorResponse } from "@/packages/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveRequestContext(request.headers);
    return Response.json(await getEmployee(ctx, (await params).id));
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
