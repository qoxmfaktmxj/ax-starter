"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { BRAND_NAME } from "../../../../packages/core/brand";
import { employeeUpdate } from "../../../../packages/contracts/employees";
import type {
  BatchSaveRequest,
  BatchSaveResult,
  EmployeeQuery,
  EmployeeRow,
} from "../../../../packages/contracts/employees";
import {
  DataGrid,
  type GridCellChange,
  type GridColumn,
  type GridSort,
} from "../../../../packages/grid/DataGrid";
import { DirtyDialog } from "../../../../packages/ui/DirtyDialog";
import { authClient } from "../../auth-client";
import "./workspace.css";

type Me = {
  actorId: string;
  permissions: string[];
  fields: {
    salary?: { read: boolean; write: boolean };
    contact?: { read: boolean; write: boolean };
  };
  dataScope: string;
};
type FileInfo = {
  id: string;
  originalName: string;
  size: number;
  state: string;
  scanStatus: string;
};
type ExportInfo = {
  jobId: string;
  status: string;
  format: "xlsx" | "pdf";
  snapshotAt?: string | null;
  errorCode?: string | null;
};
type LeaveAction = "search" | "browse" | "batch-edit" | "audit";

const defaultQuery: EmployeeQuery = {
  filters: {},
  offset: 0,
  limit: 50,
  sort: [],
};
const editableFields = [
  "name",
  "position",
  "hireDate",
  "status",
  "email",
  "monthlySalary",
] as const;

type DraftState = {
  rows: EmployeeRow[];
  undo: EmployeeRow[][];
  redo: EmployeeRow[][];
};

type DraftAction =
  | { type: "reset"; rows: EmployeeRow[] }
  | { type: "change"; update: (rows: EmployeeRow[]) => EmployeeRow[] }
  | { type: "undo" | "redo" };

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  if (action.type === "reset") return { rows: action.rows, undo: [], redo: [] };
  if (action.type === "change") {
    const rows = action.update(state.rows);
    if (rows === state.rows) return state;
    return { rows, undo: [...state.undo.slice(-29), state.rows], redo: [] };
  }
  const from = state[action.type];
  if (!from.length) return state;
  const rows = from[from.length - 1];
  return {
    rows,
    undo:
      action.type === "undo"
        ? from.slice(0, -1)
        : [...state.undo.slice(-29), state.rows],
    redo:
      action.type === "redo"
        ? from.slice(0, -1)
        : [...state.redo.slice(-29), state.rows],
  };
}

function clientUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function jsonPost<T>(
  url: string,
  body: unknown,
): Promise<{ status: number; data: T }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (data === null)
    return {
      status: 500,
      data: { message: "서버 응답을 읽지 못했습니다" } as T,
    };
  return { status: response.status, data };
}

export default function EmployeesPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [authError, setAuthError] = useState("");
  const [mode, setMode] = useState<"browse" | "batch-edit">("browse");
  const [draftFilter, setDraftFilter] = useState({
    employeeNo: "",
    name: "",
    orgId: "",
    status: "",
  });
  const [query, setQuery] = useState<EmployeeQuery>(defaultQuery);
  const [count, setCount] = useState(0);
  const [countCapped, setCountCapped] = useState(false);
  const [baseRows, setBaseRows] = useState<EmployeeRow[]>([]);
  const [draftState, dispatchDraft] = useReducer(draftReducer, {
    rows: [],
    undo: [],
    redo: [],
  });
  const draftRows = draftState.rows;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRow, setSelectedRow] = useState<EmployeeRow | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [exportJob, setExportJob] = useState<ExportInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<
    { rowId: string; currentVersion: number }[]
  >([]);
  const [rowErrors, setRowErrors] = useState<
    { rowKey: string; field?: string; message: string }[]
  >([]);
  const [focusTarget, setFocusTarget] = useState<{
    rowId: string;
    field?: string;
    nonce: number;
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [leaveAction, setLeaveAction] = useState<LeaveAction | null>(null);
  const requestRef = useRef<{ payload: string; id: string } | null>(null);
  const savingRef = useRef(false);
  const commitEditingRef = useRef<(() => void) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch("/api/me", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (!response.ok) {
          setAuthError("업무 계정에 접근할 수 없습니다.");
          return;
        }
        setMe(await response.json());
      })
      .catch(() => setAuthError("인증 상태를 확인하지 못했습니다."));
  }, []);

  const changes = useMemo<BatchSaveRequest["changes"]>(() => {
    const original = new Map(baseRows.map((row) => [row.id, row]));
    const current = new Map(draftRows.map((row) => [row.id, row]));
    const result: BatchSaveRequest["changes"] = [];
    for (const row of draftRows) {
      if (row.id.startsWith("new-")) {
        result.push({
          kind: "insert",
          clientRowId: row.id,
          values: {
            employeeNo: row.employeeNo,
            name: row.name,
            orgId: row.orgId,
            position: row.position,
            hireDate: row.hireDate,
            status: row.status,
            email: row.email ?? "",
            ...(me?.fields.salary?.write
              ? { monthlySalary: row.monthlySalary ?? null }
              : {}),
          },
        });
        continue;
      }
      const before = original.get(row.id);
      if (!before) continue;
      const values: Record<string, string | null> = {};
      for (const field of editableFields) {
        if (row[field] !== before[field]) values[field] = row[field] ?? null;
      }
      if (Object.keys(values).length)
        result.push({
          kind: "update",
          rowId: row.id,
          rowVersion: before.rowVersion,
          values,
        });
    }
    for (const row of baseRows)
      if (!current.has(row.id))
        result.push({
          kind: "delete",
          rowId: row.id,
          rowVersion: row.rowVersion,
        });
    return result;
  }, [baseRows, draftRows, me]);
  const dirty = changes.length > 0;
  const changesRef = useRef(changes);
  changesRef.current = changes;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const columns = useMemo<GridColumn[]>(
    () => [
      { field: "employeeNo", label: "사번", kind: "text", editable: false },
      { field: "name", label: "이름", kind: "text", editable: true },
      { field: "orgName", label: "조직", kind: "text", editable: false },
      { field: "hireDate", label: "입사일", kind: "date", editable: true },
      ...(me?.fields.salary?.read
        ? [
            {
              field: "monthlySalary" as const,
              label: "월급",
              kind: "decimal" as const,
              editable: Boolean(me.fields.salary.write),
            },
          ]
        : []),
      { field: "position", label: "직책", kind: "text", editable: true },
      { field: "status", label: "상태", kind: "status", editable: true },
      ...(me?.fields.contact?.read
        ? [
            {
              field: "email" as const,
              label: "이메일",
              kind: "text" as const,
              editable: Boolean(me.fields.contact.write),
            },
          ]
        : []),
    ],
    [me],
  );

  const loadRows = useCallback(
    async (startRow: number, endRow: number, sort: GridSort[]) => {
      const { status, data } = await jsonPost<{
        rows: EmployeeRow[];
        cappedCount: number;
        countCapped: boolean;
        message?: string;
      }>("/api/employees/query", {
        ...query,
        offset: startRow,
        limit: Math.min(endRow - startRow, 100),
        sort: sort.slice(0, 2),
      });
      if (status === 401) {
        window.location.assign("/login");
        throw new Error("로그인이 필요합니다");
      }
      if (status !== 200) {
        setError(data.message ?? "조회를 완료하지 못했습니다");
        throw new Error("query_failed");
      }
      setError("");
      setCount(data.cappedCount);
      setCountCapped(data.countCapped);
      return { rows: data.rows, total: data.cappedCount };
    },
    [query],
  );

  const loadBatch = useCallback(async () => {
    setLoading(true);
    try {
      const { status, data } = await jsonPost<{
        rows: EmployeeRow[];
        message?: string;
      }>("/api/employees/query", { ...query, offset: 0, limit: 100 });
      if (status !== 200)
        throw new Error(data.message ?? "편집할 행을 불러오지 못했습니다");
      setBaseRows(data.rows);
      dispatchDraft({ type: "reset", rows: data.rows });
      setError("");
      setSelectedIds([]);
      requestRef.current = null;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "편집할 행을 불러오지 못했습니다",
      );
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (mode === "batch-edit" && me) void loadBatch();
  }, [mode, me, loadBatch, refresh]);

  useEffect(() => {
    const id = selectedIds.find((value) => !value.startsWith("new-"));
    if (!id) {
      setSelectedRow(null);
      setFiles([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      fetch(`/api/employees/${id}`, { cache: "no-store" }).then((response) =>
        response.ok ? response.json() : null,
      ),
      fetch(`/api/employees/${id}/files`, { cache: "no-store" }).then(
        (response) => (response.ok ? response.json() : { rows: [] }),
      ),
    ])
      .then(([row, data]) => {
        if (!cancelled) {
          setSelectedRow(row);
          setFiles(data.rows ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) setError("상세 정보를 불러오지 못했습니다");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedIds, refresh]);

  useEffect(() => {
    if (
      !exportJob ||
      ["SUCCEEDED", "FAILED", "DENIED"].includes(exportJob.status)
    )
      return;
    const timer = setInterval(() => {
      void fetch(`/api/exports/${exportJob.jobId}`, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("status_failed");
          return response.json();
        })
        .then((data) => {
          setExportJob({
            ...data,
            jobId: exportJob.jobId,
            format: exportJob.format,
          });
        })
        .catch(() =>
          setError("출력 작업 상태를 확인하지 못했습니다. 다시 확인 중입니다."),
        );
    }, 2000);
    return () => clearInterval(timer);
  }, [exportJob]);

  function applyAction(action: LeaveAction) {
    setNotice("");
    setError("");
    setConflicts([]);
    setRowErrors([]);
    if (action === "search") {
      setQuery({
        filters: {
          ...(draftFilter.employeeNo
            ? { employeeNo: draftFilter.employeeNo }
            : {}),
          ...(draftFilter.name ? { name: draftFilter.name } : {}),
          ...(draftFilter.orgId ? { orgId: draftFilter.orgId } : {}),
          ...(draftFilter.status
            ? { status: draftFilter.status as "ACTIVE" | "LEAVE" }
            : {}),
        },
        offset: 0,
        limit: 50,
        sort: [],
      });
      setRefresh((value) => value + 1);
    } else if (action === "audit") window.location.assign("/audit");
    else setMode(action);
    setLeaveAction(null);
  }

  function requestAction(action: LeaveAction) {
    if (dirty) setLeaveAction(action);
    else applyAction(action);
  }

  function editCell(id: string, field: string, value: unknown) {
    if (
      !editableFields.includes(field as (typeof editableFields)[number]) ||
      busy
    )
      return;
    dispatchDraft({
      type: "change",
      update: (rows) => {
        const nextValue =
          field === "monthlySalary" && (value == null || value === "")
            ? null
            : String(value ?? "");
        if (
          !rows.some(
            (row) =>
              row.id === id && row[field as keyof EmployeeRow] !== nextValue,
          )
        )
          return rows;
        return rows.map((row) =>
          row.id === id ? { ...row, [field]: nextValue } : row,
        );
      },
    });
    setError("");
    setConflicts([]);
    setRowErrors([]);
  }

  function applyCells(changes: GridCellChange[]) {
    if (mode !== "batch-edit" || busy)
      throw new Error("지금은 붙여넣을 수 없습니다.");
    const patches = new Map<string, Record<string, string | null>>();
    for (const { rowId, field, value } of changes) {
      const column = columns.find((item) => item.field === field);
      if (!column?.editable || !draftRows.some((row) => row.id === rowId))
        throw new Error("편집할 수 없는 셀이 포함돼 있습니다.");
      const input =
        field === "status"
          ? value === "재직"
            ? "ACTIVE"
            : value === "휴직"
              ? "LEAVE"
              : value
          : field === "monthlySalary" && value === ""
            ? null
            : value;
      const parsed = employeeUpdate.safeParse({ [field]: input });
      if (!parsed.success)
        throw new Error(
          `${column.label}: ${parsed.error.issues[0]?.message ?? "값을 확인하세요."}`,
        );
      patches.set(rowId, {
        ...patches.get(rowId),
        [field]: (parsed.data as Record<string, string | null>)[field],
      });
    }
    dispatchDraft({
      type: "change",
      update: (rows) => {
        let changed = false;
        const next = rows.map((row) => {
          const patch = patches.get(row.id);
          if (
            !patch ||
            !Object.entries(patch).some(
              ([field, value]) => row[field as keyof EmployeeRow] !== value,
            )
          )
            return row;
          changed = true;
          return { ...row, ...patch };
        });
        return changed ? next : rows;
      },
    });
    setError("");
    setConflicts([]);
    setRowErrors([]);
  }

  function restoreDraft(direction: "undo" | "redo") {
    if (busy) return;
    commitEditingRef.current?.();
    dispatchDraft({ type: direction });
    setError("");
    setConflicts([]);
    setRowErrors([]);
  }

  function addRow() {
    const org = draftRows[0] ?? baseRows[0];
    if (!org) {
      setError("조회 결과가 없어 추가할 조직을 확인할 수 없습니다");
      return;
    }
    const employeeNo = window.prompt(
      "새 사번을 입력하세요. 영문 대문자, 숫자, 하이픈을 사용할 수 있습니다.",
    );
    if (!employeeNo) return;
    const name = window.prompt("새 사원의 이름을 입력하세요.");
    if (!name) return;
    const newRow: EmployeeRow = {
      id: `new-${clientUuid()}`,
      employeeNo,
      name,
      orgId: org.orgId,
      orgName: org.orgName,
      position: "",
      hireDate: new Date().toISOString().slice(0, 10),
      status: "ACTIVE",
      email: "",
      ...(me?.fields.salary?.read ? { monthlySalary: null } : {}),
      rowVersion: 1,
    };
    dispatchDraft({
      type: "change",
      update: (rows) => [newRow, ...rows],
    });
    setNotice("새 행을 추가했습니다. 필요한 항목을 확인한 뒤 저장하세요.");
  }

  function deleteSelected() {
    if (!selectedIds.length) return;
    const names = draftRows
      .filter((row) => selectedIds.includes(row.id))
      .map((row) => row.name)
      .join(", ");
    if (
      !window.confirm(
        `${names} 사원을 삭제 예정으로 표시할까요? 저장 전에는 복구할 수 있습니다.`,
      )
    )
      return;
    dispatchDraft({
      type: "change",
      update: (rows) => rows.filter((row) => !selectedIds.includes(row.id)),
    });
    setSelectedIds([]);
    setNotice("삭제 예정 행은 저장할 때 반영됩니다.");
  }

  async function save(): Promise<boolean> {
    if (savingRef.current) return false;
    savingRef.current = true;
    commitEditingRef.current?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const pendingChanges = changesRef.current;
    if (!pendingChanges.length) {
      savingRef.current = false;
      return true;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setConflicts([]);
    setRowErrors([]);
    try {
      const payload = JSON.stringify(pendingChanges);
      if (!requestRef.current || requestRef.current.payload !== payload)
        requestRef.current = { payload, id: clientUuid() };
      const { status, data } = await jsonPost<
        BatchSaveResult & {
          message?: string;
          issues?: { path: (string | number)[]; message: string }[];
        }
      >("/api/employees/batch", {
        requestId: requestRef.current.id,
        changes: pendingChanges,
      });
      if (status === 200 && data.ok) {
        setNotice(`${pendingChanges.length}건을 저장했습니다.`);
        setBaseRows([]);
        dispatchDraft({ type: "reset", rows: [] });
        setSelectedIds([]);
        requestRef.current = null;
        setRefresh((value) => value + 1);
        return true;
      }
      if (data.ok === false && Array.isArray(data.conflicts)) {
        setConflicts(data.conflicts);
        setRowErrors(data.rowErrors);
        if (data.conflicts[0]) setSelectedIds([data.conflicts[0].rowId]);
        const first =
          data.rowErrors[0] ??
          (data.conflicts[0] ? { rowKey: data.conflicts[0].rowId } : undefined);
        if (first)
          setFocusTarget({
            rowId: first.rowKey,
            field:
              "field" in first && first.field === "orgId"
                ? "orgName"
                : "field" in first
                  ? first.field
                  : undefined,
            nonce: Date.now(),
          });
        setError(
          data.conflicts.length
            ? "다른 저장으로 내용이 변경됐습니다. 입력을 유지했습니다. 최신 값을 확인하고 수정하세요."
            : (data.rowErrors[0]?.message ?? "입력값을 확인하세요"),
        );
      } else {
        const issue = data.issues?.[0];
        const changedRow = issue && pendingChanges[Number(issue.path[1])];
        if (issue && changedRow) {
          const rowId =
            changedRow.kind === "insert"
              ? changedRow.clientRowId
              : changedRow.rowId;
          const field =
            typeof issue.path[3] === "string" ? issue.path[3] : undefined;
          setRowErrors([{ rowKey: rowId, field, message: issue.message }]);
          setFocusTarget({
            rowId,
            field: field === "orgId" ? "orgName" : field,
            nonce: Date.now(),
          });
        }
        setError(data.message ?? "저장을 완료하지 못했습니다");
      }
      return false;
    } catch {
      setError(
        "응답을 받지 못했습니다. 같은 요청으로 다시 저장할 수 있습니다.",
      );
      return false;
    } finally {
      setBusy(false);
      savingRef.current = false;
    }
  }

  async function exportData(format: "xlsx" | "pdf", selected = false) {
    setError("");
    try {
      if (selected && selectedIds.some((id) => id.startsWith("new-")))
        throw new Error("저장된 사원만 선택 출력할 수 있습니다");
      const { status, data } = await jsonPost<{
        jobId: string;
        status: string;
        message?: string;
      }>("/api/exports", {
        requestId: clientUuid(),
        format,
        ...(selected ? { selectedIds } : { query }),
      });
      if (status !== 202)
        throw new Error(data.message ?? "출력 요청이 거부됐습니다");
      setExportJob({ jobId: data.jobId, status: data.status, format });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "출력 요청에 실패했습니다",
      );
    }
  }

  async function uploadFile() {
    const file = fileInput.current?.files?.[0];
    if (!file || !selectedRow) return;
    setFileBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/employees/${selectedRow.id}/files`, {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "업로드 실패");
      setNotice(
        data.state === "AVAILABLE"
          ? "가상 테스트 파일 검사 면제로 업로드했습니다."
          : "파일을 격리했습니다. 검사 전에는 다운로드할 수 없습니다.",
      );
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "업로드 실패");
    } finally {
      setFileBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function deleteFile(id: string) {
    try {
      const response = await fetch(`/api/files/${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.message ?? "첨부 삭제에 실패했습니다");
      setNotice("첨부 삭제를 접수했습니다.");
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "첨부 삭제에 실패했습니다",
      );
    }
  }

  if (authError)
    return (
      <main className="workspaceAuth">
        <p role="alert">{authError}</p>
        <a href="/login">로그인으로 이동</a>
      </main>
    );
  if (!me)
    return (
      <main className="workspaceAuth" role="status">
        업무 권한을 확인하고 있습니다.
      </main>
    );

  return (
    <main className="workspaceShell">
      <aside className="workspaceSidebar">
        <div className="workspaceBrand">
          {BRAND_NAME}
          <span>LOCAL MVP</span>
        </div>
        <nav aria-label="주 메뉴">
          <button className="active" onClick={() => requestAction("browse")}>
            사원관리
          </button>
          {me.permissions.includes("audit.read") && (
            <button onClick={() => requestAction("audit")}>감사 기록</button>
          )}
        </nav>
        <div className="workspaceProfile">
          <span>{me.dataScope === "ALL" ? "전체 조직" : "소속 조직"}</span>
          <button
            onClick={() =>
              void authClient
                .signOut()
                .then(() => window.location.assign("/login"))
            }
          >
            로그아웃
          </button>
        </div>
      </aside>
      <section className="workspaceMain">
        <header className="workspaceHeader">
          <div>
            <p>EMPLOYEE WORKSPACE</p>
            <h1>사원관리</h1>
          </div>
          <span>가상 데이터 전용 로컬 환경</span>
        </header>
        <form
          className="workspaceFilters"
          onSubmit={(event) => {
            event.preventDefault();
            requestAction("search");
          }}
        >
          <label>
            사번
            <input
              value={draftFilter.employeeNo}
              onChange={(event) =>
                setDraftFilter({
                  ...draftFilter,
                  employeeNo: event.target.value,
                })
              }
            />
          </label>
          <label>
            이름
            <input
              value={draftFilter.name}
              onChange={(event) =>
                setDraftFilter({ ...draftFilter, name: event.target.value })
              }
            />
          </label>
          <label>
            조직
            <select
              value={draftFilter.orgId}
              onChange={(event) =>
                setDraftFilter({ ...draftFilter, orgId: event.target.value })
              }
            >
              <option value="">전체</option>
              <option value="11111111-1111-4111-8111-111111111111">
                가상조직A
              </option>
              <option value="22222222-2222-4222-8222-222222222222">
                가상조직B
              </option>
            </select>
          </label>
          <label>
            상태
            <select
              value={draftFilter.status}
              onChange={(event) =>
                setDraftFilter({ ...draftFilter, status: event.target.value })
              }
            >
              <option value="">전체</option>
              <option value="ACTIVE">재직</option>
              <option value="LEAVE">휴직</option>
            </select>
          </label>
          <button type="submit" className="primary">
            조회
          </button>
        </form>
        <div className="workspaceSummary">
          <span>
            현재 조회 조건:{" "}
            {Object.keys(query.filters).length
              ? JSON.stringify(query.filters)
              : "전체"}
          </span>
          <span>전체 {countCapped ? "10,000건 이상" : `${count}건`}</span>
          <span>변경 {changes.length}건</span>
        </div>
        <div className="workspaceToolbar">
          <div role="group" aria-label="표 모드">
            <button
              className={mode === "browse" ? "selected" : ""}
              onClick={() => requestAction("browse")}
            >
              조회형
            </button>
            <button
              className={mode === "batch-edit" ? "selected" : ""}
              onClick={() => requestAction("batch-edit")}
            >
              일괄편집
            </button>
          </div>
          {mode === "batch-edit" && (
            <>
              <button
                onClick={addRow}
                disabled={busy || draftRows.length >= 100}
              >
                추가
              </button>
              <button
                onClick={deleteSelected}
                disabled={
                  busy ||
                  !selectedIds.length ||
                  !me.permissions.includes("emp.delete")
                }
              >
                삭제
              </button>
              <button
                className="primary"
                onPointerDown={() => commitEditingRef.current?.()}
                onClick={() => void save()}
                disabled={busy || (!dirty && !editing)}
              >
                저장 {changes.length}건
              </button>
              <button
                onClick={() => restoreDraft("undo")}
                disabled={busy || draftState.undo.length === 0}
              >
                실행 취소
              </button>
              <button
                onClick={() => restoreDraft("redo")}
                disabled={busy || draftState.redo.length === 0}
              >
                다시 실행
              </button>
            </>
          )}
          <button onClick={() => void exportData("xlsx")} disabled={busy}>
            Excel
          </button>
          <button onClick={() => void exportData("pdf")} disabled={busy}>
            PDF
          </button>
        </div>
        {mode === "batch-edit" && (
          <p className="workspaceGridGuide">
            셀을 드래그해 범위를 선택하세요. Ctrl+C로 복사하고 Ctrl+V로
            붙여넣습니다. 선택 끝의 점을 드래그하면 자동으로 채웁니다.
          </p>
        )}
        <div className="workspaceGridArea" aria-busy={loading}>
          {mode === "browse" ? (
            <DataGrid
              key={`browse-${JSON.stringify(query)}-${refresh}`}
              mode="browse"
              columns={columns}
              loadRows={loadRows}
              onCellChange={editCell}
              onGridMessage={(message, isError) => {
                if (isError) setError(message);
                else setNotice(message);
              }}
              onSelectedIdsChange={setSelectedIds}
              loading={loading}
            />
          ) : (
            <DataGrid
              mode="batch-edit"
              columns={columns}
              rows={draftRows}
              onCellChange={editCell}
              onCellsChange={applyCells}
              onUndo={() => restoreDraft("undo")}
              onRedo={() => restoreDraft("redo")}
              onGridMessage={(message, isError) => {
                if (isError) setError(message);
                else setNotice(message);
              }}
              onSelectedIdsChange={setSelectedIds}
              onEditingChanged={setEditing}
              commitEditingRef={commitEditingRef}
              focusTarget={focusTarget}
              loading={loading || busy}
            />
          )}
        </div>
        <div className="workspaceMessages" aria-live="polite">
          {loading && <p role="status">행을 불러오고 있습니다.</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {conflicts.map((item) => (
            <p key={item.rowId}>
              충돌 행{" "}
              {draftRows.find((row) => row.id === item.rowId)?.employeeNo ??
                item.rowId}
              : 현재 버전 {item.currentVersion}
            </p>
          ))}
          {rowErrors.map((item) => (
            <p key={`${item.rowKey}:${item.field ?? ""}`}>
              입력 오류{" "}
              {draftRows.find((row) => row.id === item.rowKey)?.employeeNo ??
                item.rowKey}
              {item.field
                ? ` ${item.field === "orgId" ? "조직" : (columns.find((column) => column.field === item.field)?.label ?? item.field)}`
                : ""}
              : {item.message}
            </p>
          ))}
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          {mode === "batch-edit" && !draftRows.length && !loading && (
            <p>조회 조건에 맞는 사원이 없습니다. 조회 조건을 바꿔 주세요.</p>
          )}
        </div>
      </section>
      <aside className="workspaceDetail">
        <h2>상세와 작업</h2>
        {selectedRow ? (
          <>
            <div className="detailCard">
              <strong>{selectedRow.name}</strong>
              <span>
                {selectedRow.employeeNo} / {selectedRow.orgName}
              </span>
              <span>입사일 {selectedRow.hireDate}</span>
            </div>
            <section>
              <h3>첨부</h3>
              <input
                ref={fileInput}
                type="file"
                accept=".png,.pdf,image/png,application/pdf"
                aria-label="첨부할 PNG 또는 PDF 파일"
              />
              <button onClick={() => void uploadFile()} disabled={fileBusy}>
                첨부 업로드
              </button>
              <ul>
                {files.map((file) => (
                  <li key={file.id}>
                    <span>{file.originalName}</span>
                    <small>
                      {file.state === "AVAILABLE"
                        ? file.scanStatus === "WAIVED"
                          ? "테스트 파일 검사 면제"
                          : "검사 완료, 다운로드 가능"
                        : file.state === "QUARANTINED"
                          ? "검사 대기, 격리"
                          : "삭제 중"}
                    </small>
                    {file.state === "AVAILABLE" && (
                      <a href={`/api/files/${file.id}/content`}>다운로드</a>
                    )}
                    {me.permissions.includes("file.delete") && (
                      <button onClick={() => void deleteFile(file.id)}>
                        삭제
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <p>표에서 사원을 선택하면 상세와 첨부를 볼 수 있습니다.</p>
        )}
        <section>
          <h3>출력 작업</h3>
          {selectedIds.length > 0 && (
            <div className="selectedExport">
              <span>선택 {selectedIds.length}건</span>
              <button onClick={() => void exportData("xlsx", true)}>
                선택 Excel
              </button>
              <button onClick={() => void exportData("pdf", true)}>
                선택 PDF
              </button>
            </div>
          )}
          {exportJob ? (
            <div role="status">
              <p>
                {exportJob.format.toUpperCase()}{" "}
                {exportJob.status === "PENDING"
                  ? "대기"
                  : exportJob.status === "RUNNING"
                    ? "생성 중"
                    : exportJob.status === "SUCCEEDED"
                      ? "완료"
                      : exportJob.status === "DENIED"
                        ? "권한 회수"
                        : "실패"}
              </p>
              {exportJob.snapshotAt && (
                <small>
                  기준 시각{" "}
                  {new Date(exportJob.snapshotAt).toLocaleString("ko-KR")}
                </small>
              )}
              {exportJob.status === "SUCCEEDED" && (
                <a href={`/api/exports/${exportJob.jobId}/content`}>
                  출력물 다운로드
                </a>
              )}
            </div>
          ) : (
            <p>Excel 또는 PDF를 요청하면 작업 상태가 표시됩니다.</p>
          )}
        </section>
      </aside>
      <DirtyDialog
        open={Boolean(leaveAction)}
        count={changes.length}
        onContinue={() => setLeaveAction(null)}
        onDiscard={() => {
          if (!leaveAction) return;
          const action = leaveAction;
          setBaseRows([]);
          dispatchDraft({ type: "reset", rows: [] });
          applyAction(action);
        }}
        onSave={() => {
          if (!leaveAction) return;
          const action = leaveAction;
          void save().then((ok) => {
            if (ok) applyAction(action);
          });
        }}
      />
    </main>
  );
}
