import { employeeQuery } from "@/packages/contracts/employees";
import { resolveRequestContext } from "@/packages/server/auth/context";
import { queryEmployees } from "@/packages/server/employees/service";
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
      await queryEmployees(ctx, employeeQuery.parse(await request.json())),
    );
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
