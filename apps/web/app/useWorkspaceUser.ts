"use client";
import { useEffect, useState } from "react";
import type {
  DataScope,
  FieldGrant,
  FieldGroup,
  Permission,
} from "../../../packages/core/authz";

export type WorkspaceUser = {
  actorId: string;
  dataScope: DataScope;
  permissions: Permission[];
  fields: Partial<Record<FieldGroup, FieldGrant>>;
};
export function scopeLabel(scope: DataScope) {
  return {
    ALL: "전체 조직",
    ORG: "소속 조직",
    SELF: "본인",
    ORG_TREE: "하위 조직",
    CUSTOM: "지정 범위",
  }[scope];
}
export function useWorkspaceUser() {
  const [me, setMe] = useState<WorkspaceUser | null>(null);
  const [authError, setAuthError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch("/api/me", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (!res.ok) {
          setAuthError("업무 계정에 접근할 수 없습니다.");
          return;
        }
        setMe(await res.json());
      } catch {
        if (!controller.signal.aborted)
          setAuthError("인증 상태를 확인하지 못했습니다.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return { me, authError };
}
