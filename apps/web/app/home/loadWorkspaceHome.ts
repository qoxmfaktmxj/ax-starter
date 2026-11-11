import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { can } from "@/packages/core/authz";
import {
  ApiError,
  resolveRequestContext,
} from "@/packages/server/auth/context";
import { getLatestEducationDraft } from "@/packages/server/education-requests/service";
import { getHomeMode } from "@/packages/server/home/service";
import { getOrganizationOverview } from "@/packages/server/organization/service";

export async function loadWorkspaceHome() {
  try {
    const ctx = await resolveRequestContext(await headers());
    const [initialMode, latestDraft, directory] = await Promise.all([
      getHomeMode(ctx),
      can(ctx, "education.draft") ? getLatestEducationDraft(ctx) : null,
      can(ctx, "emp.read") ? getOrganizationOverview(ctx, "self") : null,
    ]);
    return {
      initialMode,
      permissions: [...ctx.permissions],
      dataScope: ctx.dataScope,
      latestDraft,
      organization: directory?.self ?? {
        employee: null,
        organization: null,
        manager: null,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/login");
      if (error.status === 403) return null;
    }
    throw error;
  }
}
