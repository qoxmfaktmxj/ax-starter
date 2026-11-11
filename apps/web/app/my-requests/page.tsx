"use client";

import { useEffect, useRef, useState } from "react";
import type {
  EducationDraft,
  EducationDraftSummary,
  EducationInbox,
  EducationRequestSave,
} from "../../../../packages/contracts/education-requests";
import { DirtyDialog } from "../../../../packages/ui/DirtyDialog";
import {
  ActionButton,
  SearchPanel,
  TextField,
  WorkspaceShell,
} from "../../../../packages/ui/workspace/Workspace";
import { authClient } from "../../auth-client";
import { clientUuid } from "../clientUuid";
import { scopeLabel, useWorkspaceUser } from "../useWorkspaceUser";
import { EducationDraftForm } from "./EducationDraftForm";
import "./inbox.css";

type Edit = {
  saved: EducationDraft | null;
  courseId: string | null;
  reason: string;
};
type Destination =
  | "list"
  | "latest"
  | "logout"
  | "/employees"
  | "/organization"
  | "/design-system"
  | "/audit";

function courseTitle(draft: Pick<EducationDraftSummary, "course">) {
  return draft.course
    ? `${draft.course.code} / ${draft.course.name}`
    : "과정 미선택";
}

function matchesQuery(
  draft: Pick<EducationDraftSummary, "id" | "course">,
  term: string,
) {
  return `교육 신청 ${courseTitle(draft)} ${draft.id}`
    .toLocaleLowerCase()
    .includes(term.trim().toLocaleLowerCase());
}

function updatedTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(path, { cache: "no-store", signal });
  if (!res.ok) {
    if (res.status === 401) window.location.assign("/login");
    throw new Error(
      res.status === 403
        ? "신청함을 조회할 권한이 없습니다."
        : res.status === 404
          ? "신청서를 찾을 수 없습니다."
          : "정보를 불러오지 못했습니다.",
    );
  }
  return res.json();
}

export default function MyRequestsPage() {
  const { me, authError } = useWorkspaceUser();
  const [inbox, setInbox] = useState<EducationInbox | null>(null);
  const [listError, setListError] = useState("");
  const [revision, refresh] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<EducationDraft | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailRevision, refreshDetail] = useState(0);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [intent, setIntent] = useState<Destination | null>(null);
  const command = useRef<EducationRequestSave | null>(null);
  const inFlight = useRef(false);
  const skipUnload = useRef(false);
  const focusDetail = useRef(false);
  const permitted = Boolean(me?.permissions.includes("education.draft"));
  const dirty =
    !!edit &&
    (edit.courseId !== (edit.saved?.course?.id ?? null) ||
      edit.reason !== (edit.saved?.reason ?? "") ||
      uncertain);

  useEffect(() => {
    if (!permitted) return;
    const c = new AbortController();
    read<EducationInbox>("/api/requests", c.signal)
      .then((result) => {
        if (!c.signal.aborted) setInbox(result);
      })
      .catch((error: Error) => {
        if (!c.signal.aborted) setListError(error.message);
      });
    return () => c.abort();
  }, [permitted, revision]);

  useEffect(() => {
    if (!selectedId || !permitted) return;
    const c = new AbortController();
    read<EducationDraft>(`/api/requests/${selectedId}`, c.signal)
      .then((result) => {
        if (!c.signal.aborted) setDetail(result);
      })
      .catch((error: Error) => {
        if (!c.signal.aborted) setDetailError(error.message);
      });
    return () => c.abort();
  }, [permitted, selectedId, detailRevision]);

  useEffect(() => {
    if (!edit && inbox && (detail || detailError) && focusDetail.current) {
      document.getElementById("request-detail-title")?.focus();
      focusDetail.current = false;
    }
  }, [detail, detailError, inbox, edit]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (skipUnload.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function loadList() {
    setInbox(null);
    setListError("");
    refresh((v) => v + 1);
  }
  function loadDetail(id: string, moveFocus = true) {
    focusDetail.current = moveFocus;
    setDetail(null);
    setDetailError("");
    setSelectedId(id);
    refreshDetail((v) => v + 1);
  }
  function openForm(saved: EducationDraft | null) {
    command.current = null;
    setSaveError("");
    setConflict(false);
    setUncertain(false);
    setNotice("");
    setEdit({
      saved,
      courseId: saved?.course?.id ?? null,
      reason: saved?.reason ?? "",
    });
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(".requestExample h2")?.focus(),
    );
  }
  function go(destination: Destination) {
    setIntent(null);
    if (destination === "latest") {
      setEdit(null);
      setNotice("");
      loadList();
      loadDetail(selectedId);
      return;
    }
    if (destination === "list") {
      setEdit(null);
      if (uncertain || conflict) {
        if (uncertain && !edit?.saved) {
          setInput("");
          setQuery("");
        }
        loadList();
        loadDetail(edit?.saved?.id ?? "");
        return;
      }
      requestAnimationFrame(() =>
        (
          document.getElementById(`draft-${selectedId}`) ??
          document.getElementById("request-list-title")
        )?.focus(),
      );
      return;
    }
    skipUnload.current = true;
    if (destination === "logout")
      void authClient.signOut().then(() => window.location.assign("/login"));
    else window.location.assign(destination);
  }
  function navigate(destination: Destination) {
    if (inFlight.current) return;
    if (dirty) setIntent(destination);
    else go(destination);
  }
  async function save(after?: Destination) {
    if (!edit || inFlight.current || conflict) return;
    setIntent(null);
    inFlight.current = true;
    setBusy(true);
    setSaveError("");
    if (!command.current) {
      command.current = {
        requestId: clientUuid(),
        courseId: edit.courseId,
        reason: edit.reason,
        ...(edit.saved
          ? { id: edit.saved.id, rowVersion: edit.saved.rowVersion }
          : {}),
      };
    }
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command.current),
      });
      if (res.status === 401) {
        skipUnload.current = true;
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        if (res.status >= 500) throw new Error();
        command.current = null;
        setUncertain(false);
        setConflict(res.status === 404 || problem.code === "VERSION_CONFLICT");
        setSaveError(problem.message ?? "초안을 저장하지 못했습니다.");
        return;
      }
      const result = (await res.json()) as { id: string };
      command.current = null;
      setUncertain(false);
      setEdit(null);
      setNotice("교육 신청 초안을 임시저장했습니다.");
      const savedCourse =
        inbox?.courses.find((item) => item.id === edit.courseId) ?? null;
      if (
        query &&
        !matchesQuery({ id: result.id, course: savedCourse }, query)
      ) {
        setInput("");
        setQuery("");
      }
      loadList();
      loadDetail(result.id);
      if (after && after !== "list") go(after);
    } catch {
      setUncertain(true);
      setSaveError(
        "저장 결과를 확인하지 못했습니다. 임시저장을 다시 누르면 같은 요청을 확인합니다.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (!me || authError || !permitted) {
    const message =
      authError || (me ? "내 신청함을 사용할 권한이 없습니다." : "");
    return (
      <main className="workspaceAuth">
        <p role={message ? "alert" : "status"}>
          {message || "업무 권한을 확인하고 있습니다."}
        </p>
        {message && <a href="/login">로그인으로 이동</a>}
      </main>
    );
  }
  const rows = inbox?.drafts.filter((row) => matchesQuery(row, query)) ?? [];
  const current = detail?.id === selectedId ? detail : null;
  const applicant = inbox?.applicant.employee;
  const applicantName = applicant
    ? `${applicant.name} (${applicant.employeeNo})`
    : (inbox?.applicant.account ?? "");
  return (
    <WorkspaceShell
      scopeLabel={scopeLabel(me.dataScope)}
      onSignOut={() => navigate("logout")}
      menu={[
        ...(me.permissions.includes("emp.read")
          ? [
              {
                label: "사원관리",
                icon: "people" as const,
                onSelect: () => navigate("/employees"),
              },
            ]
          : []),
        {
          label: "인사/조직",
          icon: "user",
          onSelect: () => navigate("/organization"),
        },
        {
          label: "내 신청함",
          icon: "inbox",
          active: true,
          onSelect: () => navigate("list"),
        },
        ...(me.permissions.includes("audit.read")
          ? [
              {
                label: "감사 기록",
                icon: "audit" as const,
                onSelect: () => navigate("/audit"),
              },
            ]
          : []),
        {
          label: "디자인 시스템",
          icon: "layout",
          onSelect: () => navigate("/design-system"),
        },
      ]}
    >
      <section className="workspaceMain inboxWorkspace">
        <header className="workspaceHeader">
          <h1>내 신청함</h1>
          {!edit && !!inbox?.drafts.length && (
            <ActionButton primary onClick={() => openForm(null)}>
              새 신청
            </ActionButton>
          )}
        </header>
        {notice && (
          <p className="inboxNotice" role="status">
            {notice}
          </p>
        )}
        {listError ? (
          <div className="inboxPanel inboxEmpty">
            <p role="alert">{listError}</p>
            <ActionButton onClick={loadList}>다시 조회</ActionButton>
          </div>
        ) : !inbox ? (
          <p role="status">신청 목록을 불러오고 있습니다.</p>
        ) : edit ? (
          <>
            <EducationDraftForm
              courses={inbox.courses}
              applicant={applicantName}
              courseId={edit.courseId}
              reason={edit.reason}
              onChange={(courseId, reason) => {
                if (!inFlight.current && !uncertain) {
                  command.current = null;
                  setEdit({ ...edit, courseId, reason });
                  if (!conflict) setSaveError("");
                }
              }}
              onSave={() => void save()}
              saving={busy}
              locked={uncertain}
              saveDisabled={conflict || (!dirty && !!edit.saved)}
              onCancel={() => navigate("list")}
            />
            {saveError && (
              <p role="alert" className="inboxError">
                {saveError}
              </p>
            )}
            {conflict && (
              <ActionButton onClick={() => navigate("latest")}>
                최신 내용 다시 조회
              </ActionButton>
            )}
          </>
        ) : (
          <>
            {inbox.drafts.length > 0 && (
              <SearchPanel
                aria-label="내 신청 검색"
                onSubmit={(e) => {
                  e.preventDefault();
                  setQuery(input);
                  loadDetail("", false);
                  setNotice("");
                }}
              >
                <TextField
                  id="request-search"
                  label="신청 검색"
                  placeholder="과정명, 과정 코드 또는 초안 ID"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
              </SearchPanel>
            )}
            <div className="inboxColumns">
              <section
                className="inboxPanel"
                aria-labelledby="request-list-title"
              >
                <header>
                  <h2 id="request-list-title" tabIndex={-1}>
                    신청 목록
                  </h2>
                  <span>{rows.length}건</span>
                </header>
                {!inbox.drafts.length ? (
                  <div className="inboxEmpty">
                    <p>작성한 교육 신청이 없습니다.</p>
                    <ActionButton primary onClick={() => openForm(null)}>
                      새 신청
                    </ActionButton>
                  </div>
                ) : !rows.length ? (
                  <div className="inboxEmpty">
                    <p>검색 결과가 없습니다.</p>
                    <ActionButton
                      onClick={() => {
                        setInput("");
                        setQuery("");
                        document.getElementById("request-search")?.focus();
                      }}
                    >
                      조건 초기화
                    </ActionButton>
                  </div>
                ) : (
                  <ul className="inboxRows">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          id={`draft-${row.id}`}
                          aria-pressed={selectedId === row.id}
                          aria-controls="request-detail"
                          onClick={() => {
                            setNotice("");
                            loadDetail(row.id);
                          }}
                        >
                          <strong>{courseTitle(row)}</strong>
                          <span>작성 중</span>
                          <time dateTime={row.updatedAt}>
                            {updatedTime(row.updatedAt)}
                          </time>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {inbox.drafts.length > 0 && rows.length > 0 && (
                <section
                  className="inboxPanel"
                  id="request-detail"
                  aria-labelledby="request-detail-title"
                >
                  <header>
                    <h2 id="request-detail-title" tabIndex={-1}>
                      신청 상세
                    </h2>
                  </header>
                  {!selectedId ? (
                    <p className="inboxEmpty">
                      목록에서 확인할 신청을 선택하세요.
                    </p>
                  ) : detailError ? (
                    <div className="inboxEmpty">
                      <p role="alert">{detailError}</p>
                      <ActionButton onClick={() => loadDetail(selectedId)}>
                        다시 조회
                      </ActionButton>
                    </div>
                  ) : !current ? (
                    <p role="status" className="inboxEmpty">
                      신청 내용을 불러오고 있습니다.
                    </p>
                  ) : (
                    <div className="inboxDetail">
                      <dl>
                        <dt>교육 과정</dt>
                        <dd>{courseTitle(current)}</dd>
                        <dt>신청 사유</dt>
                        <dd>{current.reason || "미입력"}</dd>
                        <dt>수정 시각</dt>
                        <dd>
                          <time dateTime={current.updatedAt}>
                            {updatedTime(current.updatedAt)}
                          </time>
                        </dd>
                        <dt>초안 ID</dt>
                        <dd className="inboxId">{current.id}</dd>
                      </dl>
                      <div className="inboxActions">
                        <ActionButton primary onClick={() => openForm(current)}>
                          이어서 작성
                        </ActionButton>
                        <ActionButton
                          className="inboxBack"
                          onClick={() =>
                            document
                              .getElementById(`draft-${selectedId}`)
                              ?.focus()
                          }
                        >
                          목록으로
                        </ActionButton>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </section>
      <DirtyDialog
        open={intent !== null}
        count={1}
        onContinue={() => setIntent(null)}
        onDiscard={() => intent && go(intent)}
        canSave={!conflict && intent !== "latest"}
        onSave={() => {
          if (intent) void save(intent);
        }}
      />
    </WorkspaceShell>
  );
}
