"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import type {
  OrganizationOverview,
  OrganizationManagement,
} from "../../../../packages/contracts/organization";
import {
  WorkspaceShell,
  ActionButton,
} from "../../../../packages/ui/workspace/Workspace";
import { authClient } from "../../auth-client";
import { clientUuid } from "../clientUuid";
import { useWorkspaceUser, scopeLabel } from "../useWorkspaceUser";
import "./organization.css";

type BindingKind = "account" | "manager";
const bindingLabels = {
  account: {
    tab: "계정 연결",
    target: "대상 계정",
    current: "현재 연결 사원",
    next: "연결할 사원",
    empty: "미연결",
    clear: "연결 해제",
    save: "계정 연결 저장",
    success: "계정 연결을 저장했습니다.",
  },
  manager: {
    tab: "조직 책임자",
    target: "대상 조직",
    current: "현재 책임자",
    next: "지정할 책임자",
    empty: "공석",
    clear: "책임자 지정 해제",
    save: "책임자 지정 저장",
    success: "조직 책임자를 저장했습니다.",
  },
} as const;

function Affiliation({ self }: { self: OrganizationOverview["self"] }) {
  const facts = [
    {
      label: "사원",
      name: self.employee?.name,
      code: self.employee?.employeeNo,
      empty: "계정에 연결된 사원이 없습니다.",
    },
    {
      label: "소속 조직",
      name: self.organization?.name,
      code: self.organization?.code,
      empty: "사원 연결 후 확인",
    },
    {
      label: "조직 책임자",
      name: self.manager?.name,
      code: self.manager?.employeeNo,
      empty: self.organization ? "공석" : "사원 연결 후 확인",
    },
  ];
  return (
    <section className="orgPanel" aria-labelledby="org-self">
      <h2 id="org-self">내 소속</h2>
      <dl className="orgFacts">
        {facts.map(({ label, name, code, empty }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {name ? (
                <>
                  <strong>{name}</strong>
                  <span>{code}</span>
                </>
              ) : (
                empty
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type BindingTarget = {
  id: string;
  orgId: string | null;
  employeeId: string | null;
  rowVersion: number;
  label: string;
  active: boolean;
  provider?: "password" | "oidc";
};

function BindingForm({
  kind,
  target,
  targets,
  targetRef,
  onTargetChange,
  data,
  busy,
  onBusy,
  onRefresh,
}: {
  kind: BindingKind;
  target: BindingTarget;
  targets: BindingTarget[];
  targetRef: React.RefObject<HTMLSelectElement | null>;
  onTargetChange: (id: string) => void;
  data: OrganizationManagement;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onRefresh: (message?: string) => void;
}) {
  const text = bindingLabels[kind];
  const errorId = useId();
  const [proposed, setProposed] = useState(target.employeeId ?? "");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const inFlight = useRef(false);
  const command = useRef<{ value: string; requestId: string } | null>(null);
  const current = data.employees.find((item) => item.id === target.employeeId);
  const linkedPasswordEmployees = new Set(
    target.provider === "password"
      ? data.accounts
          .filter(
            (account) =>
              account.provider === "password" && account.id !== target.id,
          )
          .map((account) => account.employeeId)
      : [],
  );
  const candidates = data.employees.filter(
    (item) =>
      target.active &&
      item.orgId === target.orgId &&
      item.status === "ACTIVE" &&
      !linkedPasswordEmployees.has(item.id),
  );
  const orgName = data.organizations.find(
    (item) => item.id === target.orgId,
  )?.name;

  let currentLabel = current
    ? `${current.name} (${current.employeeNo})`
    : text.empty;
  if (
    target.employeeId &&
    kind === "manager" &&
    (!current || current.status !== "ACTIVE" || current.orgId !== target.orgId)
  ) {
    const reason = !current
      ? "사원 정보 확인 필요"
      : current.status === "LEAVE"
        ? `${currentLabel} 휴직`
        : `${currentLabel} 소속 변경`;
    currentLabel = `공석 (기존 지정 사원 ${reason}, 재지정 필요)`;
  } else if (target.employeeId && !current) {
    currentLabel = "기존 연결 사원 확인 필요";
  }
  async function save() {
    if (
      inFlight.current ||
      busy ||
      conflict ||
      proposed === (target.employeeId ?? "")
    )
      return;
    inFlight.current = true;
    onBusy(true);
    setError("");
    try {
      if (!command.current || command.current.value !== proposed)
        command.current = { value: proposed, requestId: clientUuid() };
      const response = await fetch("/api/organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: command.current.requestId,
          kind,
          targetId: target.id,
          employeeId: proposed || null,
          rowVersion: target.rowVersion,
        }),
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (response.status === 403) {
        onRefresh("관리 권한을 다시 확인합니다.");
        return;
      }
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          command.current = null;
        }
        const problem = await response.json().catch(() => ({}));
        setError(problem.message ?? "저장을 완료하지 못했습니다.");
        setConflict(
          problem.code === "VERSION_CONFLICT" || response.status === 404,
        );
        return;
      }
      onRefresh(text.success);
    } catch {
      setError(
        "저장 응답을 받지 못했습니다. 같은 값으로 다시 저장할 수 있습니다.",
      );
    } finally {
      inFlight.current = false;
      onBusy(false);
    }
  }

  return (
    <form
      className="orgBindingForm"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="orgTarget">
        <label>
          {text.target}
          <select
            ref={targetRef}
            disabled={busy}
            value={target.id}
            onChange={(e) => onTargetChange(e.target.value)}
          >
            {targets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <dl className="orgCurrent">
          {kind === "account" && (
            <div>
              <dt>대상 소속</dt>
              <dd>{orgName ?? "소속 미지정"}</dd>
            </div>
          )}
          <div>
            <dt>{text.current}</dt>
            <dd>{currentLabel}</dd>
          </div>
        </dl>
      </div>
      <div className="orgChange">
        <label>
          {text.next}
          <select
            aria-describedby={error ? errorId : undefined}
            value={proposed}
            disabled={busy || conflict}
            onChange={(event) => {
              setProposed(event.target.value);
              setError("");
            }}
          >
            <option value="">
              {target.employeeId ? text.clear : "사원을 선택하세요"}
            </option>
            {target.employeeId &&
              !candidates.some((item) => item.id === target.employeeId) && (
                <option value={target.employeeId} disabled>
                  {current
                    ? `${current.employeeNo} / ${current.name}`
                    : "현재 지정 사원"}{" "}
                  (지정 불가)
                </option>
              )}
            {candidates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.employeeNo} / {item.name}
              </option>
            ))}
          </select>
        </label>
        {!target.active && <p>비활성 계정은 연결 해제만 가능합니다.</p>}
        {target.active && !candidates.length && (
          <p>이 조직에 지정 가능한 재직 사원이 없습니다.</p>
        )}
        {error && (
          <p id={errorId} role="alert">
            {error}
          </p>
        )}
        <div className="orgActions">
          <ActionButton
            primary
            type="submit"
            pending={busy}
            pendingLabel="저장 중"
            disabled={conflict || proposed === (target.employeeId ?? "")}
          >
            {text.save}
          </ActionButton>
          {conflict && (
            <ActionButton onClick={() => onRefresh()}>
              최신 정보 다시 불러오기
            </ActionButton>
          )}
        </div>
      </div>
    </form>
  );
}

export default function OrganizationPage() {
  const { me, authError } = useWorkspaceUser();
  const [overview, setOverview] = useState<OrganizationOverview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [kind, setKind] = useState<BindingKind>("account");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const targetRef = useRef<HTMLSelectElement>(null);
  const restoreTargetFocus = useRef(false);
  useEffect(() => {
    if (overview && restoreTargetFocus.current) {
      restoreTargetFocus.current = false;
      targetRef.current?.focus();
    }
  }, [overview, targetId]);
  function reload(message = "") {
    restoreTargetFocus.current = !!overview?.management;
    setOverview(null);
    setNotice(message);
    setError("");
    setRevision((value) => value + 1);
  }
  useEffect(() => {
    if (!me) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/organization", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (!response.ok) throw new Error();
        const result: OrganizationOverview = await response.json();
        if (!controller.signal.aborted) setOverview(result);
      } catch {
        if (!controller.signal.aborted)
          setError("인사/조직 정보를 불러오지 못했습니다.");
      }
    }
    void load();
    return () => controller.abort();
  }, [me, revision]);
  if (!me || authError)
    return (
      <main className="workspaceAuth">
        <p role={authError ? "alert" : "status"}>
          {authError || "업무 권한을 확인하고 있습니다."}
        </p>
        {authError && <a href="/login">로그인으로 이동</a>}
      </main>
    );
  const management = overview?.management;
  const targets: BindingTarget[] = !management
    ? []
    : kind === "account"
      ? management.accounts.map((account) => ({
          ...account,
          label: `${account.subject} (${account.provider === "password" ? "비밀번호" : "SSO"})${account.active ? "" : " / 비활성"}`,
        }))
      : management.organizations.map((org) => ({
          id: org.id,
          orgId: org.id,
          employeeId: org.managerEmployeeId,
          rowVersion: org.rowVersion,
          label: `${org.name} (${org.code})`,
          active: true,
        }));
  const target = targets.find((item) => item.id === targetId) ?? targets[0];
  const labels = bindingLabels[kind];
  const feedback = notice && (
    <p className="orgNotice" role="status">
      {notice}
    </p>
  );
  return (
    <WorkspaceShell
      scopeLabel={scopeLabel(me.dataScope)}
      onSignOut={() => {
        void authClient.signOut().then(() => window.location.assign("/login"));
      }}
      menu={[
        ...(me.permissions.includes("emp.read")
          ? [
              {
                label: "사원관리",
                icon: "people" as const,
                onSelect: () => window.location.assign("/employees"),
              },
            ]
          : []),
        {
          label: "인사/조직",
          icon: "user",
          active: true,
          onSelect: () => {
            if (!busy) reload();
          },
        },
        ...(me.permissions.includes("education.draft")
          ? [
              {
                label: "내 신청함",
                icon: "inbox" as const,
                onSelect: () => window.location.assign("/my-requests"),
              },
            ]
          : []),
        ...(me.permissions.includes("audit.read")
          ? [
              {
                label: "감사 기록",
                icon: "audit" as const,
                onSelect: () => window.location.assign("/audit"),
              },
            ]
          : []),
        {
          label: "디자인 시스템",
          icon: "layout",
          onSelect: () => window.location.assign("/design-system"),
        },
      ]}
    >
      <section className="workspaceMain orgWorkspace">
        <header className="workspaceHeader">
          <h1>인사/조직</h1>
        </header>
        {!management && overview && feedback}
        {error ? (
          <div className="orgLoadError">
            <p role="alert">{error}</p>
            <ActionButton onClick={() => reload()}>다시 조회</ActionButton>
          </div>
        ) : !overview ? (
          <p role="status">인사/조직 정보를 불러오고 있습니다.</p>
        ) : (
          <Affiliation self={overview.self} />
        )}
        {management && (
          <section
            className="orgPanel orgAdmin"
            aria-labelledby="org-management"
          >
            <h2 id="org-management">기준정보 관리</h2>
            <Tabs.Root
              value={kind}
              onValueChange={(value) => {
                if (busy || (value !== "account" && value !== "manager"))
                  return;
                setKind(value);
                setTargetId("");
                setNotice("");
              }}
            >
              <Tabs.List className="workExamples" aria-label="관리 업무">
                <Tabs.Tab value="account" disabled={busy}>
                  {bindingLabels.account.tab}
                </Tabs.Tab>
                <Tabs.Tab value="manager" disabled={busy}>
                  {bindingLabels.manager.tab}
                </Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value={kind} key={kind}>
                {feedback}
                {!target ? (
                  <p>{labels.target} 정보가 없습니다.</p>
                ) : (
                  <BindingForm
                    key={`${kind}-${target.id}-${target.rowVersion}`}
                    kind={kind}
                    target={target}
                    targets={targets}
                    targetRef={targetRef}
                    onTargetChange={(id) => {
                      restoreTargetFocus.current = true;
                      setTargetId(id);
                      setNotice("");
                    }}
                    data={management}
                    busy={busy}
                    onBusy={setBusy}
                    onRefresh={reload}
                  />
                )}
              </Tabs.Panel>
            </Tabs.Root>
          </section>
        )}
      </section>
    </WorkspaceShell>
  );
}
