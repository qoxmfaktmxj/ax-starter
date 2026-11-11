import { organizationUpdate } from "@/packages/contracts/organization";
import { resolveRequestContext } from "@/packages/server/auth/context";
import { writeAudit } from "@/packages/server/employees/service";
import {
  assertJson,
  assertSameOrigin,
  errorResponse,
} from "@/packages/server/http";
import {
  getOrganizationOverview,
  updateOrganization,
} from "@/packages/server/organization/service";

export async function GET(request: Request) {
  try {
    const ctx = await resolveRequestContext(request.headers);
    return Response.json(await getOrganizationOverview(ctx), {
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
    const parsed = organizationUpdate.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      await writeAudit(ctx, "organization.update", "FAILED");
      throw parsed.error;
    }
    return Response.json(await updateOrganization(ctx, parsed.data));
  } catch (error) {
    return errorResponse(error, request.headers);
  }
}
