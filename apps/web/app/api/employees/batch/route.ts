import { batchSaveRequest } from "@/packages/contracts/employees";
import type { BatchSaveRequest } from "@/packages/contracts/employees";
import { resolveRequestContext } from "@/packages/server/auth/context";
import { saveBatch, writeAudit } from "@/packages/server/employees/service";
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
    let input: BatchSaveRequest;
    try {
      input = batchSaveRequest.parse(await request.json());
    } catch (error) {
      await writeAudit(ctx, "employee.batch", "FAILED");
      throw error;
    }
    const { status, result } = await saveBatch(ctx, input);
    return Response.json(result, { status });
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
