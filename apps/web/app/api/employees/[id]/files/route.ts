import { resolveRequestContext } from "@/packages/server/auth/context";
import {
  listEmployeeFiles,
  uploadEmployeeFile,
} from "@/packages/server/files/service";
import {
  assertSameOrigin,
  boundedFormData,
  errorResponse,
} from "@/packages/server/http";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await resolveRequestContext(request.headers);
    return Response.json({
      rows: await listEmployeeFiles(ctx, (await params).id),
    });
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const ctx = await resolveRequestContext(request.headers);
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(30_000),
    ]);
    const body = await boundedFormData(
      request,
      5 * 1024 * 1024 + 32 * 1024,
      signal,
    );
    const file = body.get("file");
    if (!(file instanceof File))
      return Response.json(
        {
          code: "VALIDATION",
          message: "파일을 선택하세요",
          correlationId: ctx.correlationId,
        },
        { status: 422 },
      );
    return Response.json(
      await uploadEmployeeFile(ctx, (await params).id, file, signal),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
