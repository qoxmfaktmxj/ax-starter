"use client";

import { useRef, useState } from "react";
import type { EducationDraftSummary } from "../../../../packages/contracts/education-requests";
import type { HomeMode } from "../../../../packages/contracts/home";
import type { OrganizationOverview } from "../../../../packages/contracts/organization";
import type { DataScope, Permission } from "../../../../packages/core/authz";
import {
  ActionButton,
  WorkspaceShell,
} from "../../../../packages/ui/workspace/Workspace";
import {
  WorkspaceIcon,
  type WorkspaceIconName,
} from "../../../../packages/ui/workspace/WorkspaceIcon";
import { authClient } from "../../auth-client";
import { scopeLabel } from "../useWorkspaceUser";
import "./home.css";

const shortcuts: {
  label: string;
  href: string;
  icon: WorkspaceIconName;
  detail: string;
  permission: Permission;
}[] = [
  {
    label: "사원관리",
    href: "/employees",
    icon: "people",
    detail: "사원 명부와 상세 정보 조회",
    permission: "emp.read",
  },
  {
    label: "인사/조직",
    href: "/organization",
    icon: "user",
    detail: "소속 조직과 책임자 확인",
    permission: "emp.read",
  },
  {
    label: "내 신청함",
    href: "/my-requests",
    icon: "inbox",
    detail: "교육 신청 작성과 초안 조회",
    permission: "education.draft",
  },
  {
    label: "감사 기록",
    href: "/audit",
    icon: "audit",
    detail: "업무 처리 이력 조회",
    permission: "audit.read",
  },
];

const savedTime = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

export default function WorkspaceHome({
  initialMode,
  dataScope,
  permissions,
  latestDraft,
  organization,
}: {
  initialMode: HomeMode;
  dataScope: DataScope;
  permissions: Permission[];
  latestDraft: EducationDraftSummary | null;
  organization: OrganizationOverview["self"];
}) {
  const [mode, setMode] = useState(initialMode);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const inFlight = useRef<Promise<void> | null>(null);
  const available = shortcuts.filter((item) =>
    permissions.includes(item.permission),
  );
  const canWriteDraft = permissions.includes("education.draft");
  const canReadOrganization = permissions.includes("emp.read");

  async function saveMode(next: HomeMode) {
    setSaveError("");
    setSaving(true);
    try {
      const response = await fetch("/api/home/mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
        keepalive: true,
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok) throw new Error();
      setMode(next);
    } catch {
      setSaveError(
        "홈 모드 저장을 확인하지 못했습니다. 원하는 모드를 다시 선택해 주세요.",
      );
    } finally {
      setSaving(false);
      inFlight.current = null;
    }
  }

  function selectMode(next: HomeMode) {
    if (inFlight.current || (mode === next && !saveError)) return;
    inFlight.current = saveMode(next);
  }

  async function signOut() {
    await inFlight.current;
    await authClient.signOut();
    window.location.assign("/login");
  }

  return (
    <WorkspaceShell
      homeCurrent
      scopeLabel={scopeLabel(dataScope)}
      onSignOut={() => void signOut()}
      menu={[
        ...available.map(({ label, icon, href }) => ({
          label,
          icon,
          onSelect: () => window.location.assign(href),
        })),
        {
          label: "디자인 시스템",
          icon: "layout",
          onSelect: () => window.location.assign("/design-system"),
        },
      ]}
    >
      <section className="workspaceMain homeWorkspace">
        <header className="workspaceHeader homeHeader">
          <h1>홈</h1>
          <div
            className="homeModes"
            role="group"
            aria-label="홈 모드"
            aria-busy={saving}
          >
            {(["portal", "work"] as const).map((value) => (
              <ActionButton
                key={value}
                type="button"
                aria-pressed={mode === value}
                aria-disabled={saving || undefined}
                onClick={() => selectMode(value)}
              >
                {value === "portal" ? "포털" : "내 업무"}
              </ActionButton>
            ))}
          </div>
          {saving && (
            <span className="homeMeta" role="status">
              홈 모드 저장 중
            </span>
          )}
        </header>
        {saveError && (
          <p className="homeError" role="alert">
            {saveError}
          </p>
        )}
        <div className="homeColumns">
          {mode === "portal" ? (
            <section
              className="workReading homePanel homePortal"
              aria-labelledby="home-shortcuts"
            >
              <h2 id="home-shortcuts">업무 바로가기</h2>
              {available.length ? (
                <ul className="homeShortcuts">
                  {available.map(({ label, icon, href, detail }) => (
                    <li key={href}>
                      <a href={href} aria-label={label}>
                        <WorkspaceIcon name={icon} />
                        <span>
                          <strong>{label}</strong>
                          <small>{detail}</small>
                        </span>
                        <span className="homeArrow" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>접근할 수 있는 업무가 없습니다.</p>
              )}
            </section>
          ) : canWriteDraft ? (
            <section
              className="workReading homePanel homeDraft"
              aria-labelledby="home-draft"
            >
              <h2 id="home-draft">
                <WorkspaceIcon name="inbox" />
                교육 신청
              </h2>
              {latestDraft ? (
                <div className="homeDraftBody">
                  <p className="homeDraftTitle">
                    {latestDraft.course?.name ?? "과정 미선택"}
                  </p>
                  <p className="homeMeta">
                    최근 저장{" "}
                    <time dateTime={latestDraft.updatedAt}>
                      {savedTime.format(new Date(latestDraft.updatedAt))}
                    </time>
                  </p>
                </div>
              ) : (
                <p className="homeDraftTitle">작성 중인 신청이 없습니다</p>
              )}
              <div className="homeDraftActions">
                <a
                  className="homePrimary"
                  href={
                    latestDraft
                      ? `/my-requests?draft=${encodeURIComponent(latestDraft.id)}`
                      : "/my-requests?new=1"
                  }
                >
                  <WorkspaceIcon name="edit" />
                  {latestDraft ? "이어서 작성" : "새 교육 신청"}
                </a>
                <a className="homeTextLink" href="/my-requests">
                  내 신청함 전체
                </a>
              </div>
            </section>
          ) : (
            !canReadOrganization && <p>접근할 수 있는 업무가 없습니다.</p>
          )}
          {canReadOrganization && (
            <section
              className="workReading homePanel homeAffiliation"
              aria-labelledby="home-affiliation"
            >
              <h2 id="home-affiliation">내 소속</h2>
              {organization.organization ? (
                <dl>
                  <div>
                    <dt>소속 조직</dt>
                    <dd>{organization.organization.name}</dd>
                  </div>
                  <div>
                    <dt>조직 책임자</dt>
                    <dd>{organization.manager?.name ?? "공석"}</dd>
                  </div>
                </dl>
              ) : (
                <p className="homeMeta">계정에 연결된 소속이 없습니다.</p>
              )}
              <a className="homeTextLink" href="/organization">
                인사/조직 열기
              </a>
            </section>
          )}
        </div>
      </section>
    </WorkspaceShell>
  );
}
