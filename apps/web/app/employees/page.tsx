"use client";

import ko from "zod/v4/locales/ko.js";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  employeeUpdate,
  employeeValues,
} from "../../../../packages/contracts/employees";
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
import { EmployeeStatusBadge } from "../../../../packages/ui/workspace/EmployeeStatusBadge";
import "./employee-workspace.css";
import { clientUuid } from "../clientUuid";
import { DirtyDialog } from "../../../../packages/ui/DirtyDialog";
import { authClient } from "../../auth-client";
import {
  ExportActions,
  ExportResult,
} from "../../../../packages/ui/workspace/ExportActions";
import { WorkspaceIcon } from "../../../../packages/ui/workspace/WorkspaceIcon";
import {
  WorkspaceShell,
  SearchPanel,
  SaveButton,
  GridLayout,
  GridPanel,
  TextField,
} from "../../../../packages/ui/workspace/Workspace";
import { useWorkspaceUser, scopeLabel } from "../useWorkspaceUser";
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
type LeaveAction =
  | "search"
  | "browse"
  | "batch-edit"
  | "audit"
  | "organization"
  | "templates"
  | "logout";

const organizations = [
  { id: "11111111-1111-4111-8111-111111111111", name: "가상조직A" },
  { id: "22222222-2222-4222-8222-222222222222", name: "가상조직B" },
];
const fieldValidation = { error: ko().localeError };

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
  const { me, authError } = useWorkspaceUser();
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
  const detailId = selectedIds.find((id) => !id.startsWith("new-"));
  const [detail, setDetail] = useState<{
    id: string;
    employee: EmployeeRow | null;
    files: FileInfo[];
  } | null>(null);
  const currentDetail = detail?.id === detailId ? detail : null;
  const currentEmployee = currentDetail?.employee;
  const [fileBusy, setFileBusy] = useState(false);
  const [exportJob, setExportJob] = useState<ExportInfo | null>(null);
  const [exportPending, setExportPending] = useState<{
    format: "xlsx" | "pdf";
    selected: boolean;
  } | null>(null);
  const exportLock = useRef(false);
  const queryGeneration = useRef(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<
    { rowId: string; currentVersion: number }[]
  >([]);
  const [reportedErrors, setRowErrors] = useState<
    { rowKey: string; field?: string; message: string; schemaIssue?: boolean }[]
  >([]);
  const rowErrors = useMemo(
    () =>
      reportedErrors.flatMap((issue) => {
        if (!issue.field) return [issue];
        const row = draftRows.find((item) => item.id === issue.rowKey);
        if (!row) return [];
        if (
          !issue.schemaIssue ||
          !Object.hasOwn(employeeValues.shape, issue.field)
        )
          return [issue];
        const field = issue.field as keyof typeof employeeValues.shape;
        const result = employeeValues.shape[field].safeParse(
          row[field],
          fieldValidation,
        );
        if (result.success) return [];
        const reason = result.error.issues[0];
        let message = reason.message;
        if (
          reason.code === "too_small" &&
          reason.origin === "string" &&
          reason.minimum === 1
        )
          message = "값을 입력하세요.";
        if (reason.code === "too_big" && reason.origin === "string")
          message = `${reason.maximum}자 이내로 입력하세요.`;
        return [{ ...issue, message }];
      }),
    [reportedErrors, draftRows],
  );
  const cellErrors = useMemo(
    () =>
      rowErrors.flatMap((issue) =>
        issue.field
          ? [
              {
                rowId: issue.rowKey,
                field: issue.field === "orgId" ? "orgName" : issue.field,
                message: issue.message,
              },
            ]
          : [],
      ),
    [rowErrors],
  );
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
      const generation = queryGeneration.current;
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
      if (generation !== queryGeneration.current)
        throw new Error("query_replaced");
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

  const loadBatch = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      try {
        const { status, data } = await jsonPost<{
          rows: EmployeeRow[];
          cappedCount: number;
          countCapped: boolean;
          message?: string;
        }>("/api/employees/query", { ...query, offset: 0, limit: 100 });
        if (signal.aborted) return;
        if (status !== 200)
          throw new Error(data.message ?? "편집할 행을 불러오지 못했습니다");
        setBaseRows(data.rows);
        setCount(data.cappedCount);
        setCountCapped(data.countCapped);
        dispatchDraft({ type: "reset", rows: data.rows });
        setError("");
        setRowErrors([]);
        setSelectedIds([]);
        requestRef.current = null;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "편집할 행을 불러오지 못했습니다",
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    if (mode !== "batch-edit" || !me) return;
    const controller = new AbortController();
    void loadBatch(controller.signal);
    return () => controller.abort();
  }, [mode, me, loadBatch, refresh]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      fetch(`/api/employees/${detailId}`, { cache: "no-store" }).then(
        (response) => (response.ok ? response.json() : null),
      ),
      fetch(`/api/employees/${detailId}/files`, { cache: "no-store" }).then(
        (response) => (response.ok ? response.json() : { rows: [] }),
      ),
    ])
      .then(([row, data]) => {
        if (!cancelled) {
          setDetail({
            id: detailId,
            employee: row?.id === detailId ? row : null,
            files: data.rows ?? [],
          });
        }
      })
      .catch(() => {
        if (!cancelled) setDetail({ id: detailId, employee: null, files: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [detailId, refresh]);

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
    if (action !== mode) queryGeneration.current++;
    if (action === "search") {
      setSelectedIds([]);
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
    else if (action === "organization") window.location.assign("/organization");
    else if (action === "templates") window.location.assign("/design-system");
    else if (action === "logout")
      void authClient.signOut().then(() => window.location.assign("/login"));
    else setMode(action);
    setLeaveAction(null);
  }

  function requestAction(action: LeaveAction) {
    if (busy) return;
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
  }

  function restoreDraft(direction: "undo" | "redo") {
    if (busy) return;
    commitEditingRef.current?.();
    dispatchDraft({ type: direction });
    setError("");
    setConflicts([]);
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
        const issues = (data.issues ?? []).flatMap((issue) => {
          const [group, index, , field] = issue.path;
          const change =
            group === "changes" && typeof index === "number"
              ? pendingChanges[index]
              : undefined;
          if (!change) return [];
          return [
            {
              rowKey:
                change.kind === "insert" ? change.clientRowId : change.rowId,
              field: typeof field === "string" ? field : undefined,
              message: issue.message,
              schemaIssue: true,
            },
          ];
        });
        setRowErrors(issues);
        if (issues.length) {
          const { rowKey, field } = issues[0];
          setFocusTarget({
            rowId: rowKey,
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
    if (
      exportLock.current ||
      exportJob?.status === "PENDING" ||
      exportJob?.status === "RUNNING"
    )
      return;
    exportLock.current = true;
    setExportPending({ format, selected });
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
    } finally {
      exportLock.current = false;
      setExportPending(null);
    }
  }

  async function uploadFile() {
    const file = fileInput.current?.files?.[0];
    if (!file || !currentEmployee) return;
    setFileBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(
        `/api/employees/${currentEmployee.id}/files`,
        {
          method: "POST",
          body,
        },
      );
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

  if (!me.permissions.includes("emp.read"))
    return (
      <main className="workspaceAuth">
        <p role="alert">사원을 조회할 권한이 없습니다.</p>
      </main>
    );
  const canEdit = me.permissions.includes("emp.update");
  const canExport = me.permissions.includes("emp.export");
  const exportBusy =
    Boolean(exportPending) ||
    exportJob?.status === "PENDING" ||
    exportJob?.status === "RUNNING";
  const { employeeNo, name, orgId, status } = query.filters;
  const appliedFilters = [
    employeeNo && `사번 ${employeeNo}`,
    name && `이름 ${name}`,
    organizations.find((org) => org.id === orgId)?.name,
    status && (status === "ACTIVE" ? "재직" : "휴직"),
  ].filter(Boolean);

  return (
    <WorkspaceShell
      menu={[
        {
          label: "사원관리",
          icon: "people",
          active: true,
          onSelect: () => requestAction("browse"),
        },
        {
          label: "인사/조직",
          icon: "user",
          onSelect: () => requestAction("organization"),
        },
        ...(me.permissions.includes("audit.read")
          ? [
              {
                label: "감사 기록",
                icon: "audit" as const,
                onSelect: () => requestAction("audit"),
              },
            ]
          : []),
        {
          label: "디자인 시스템",
          icon: "layout",
          onSelect: () => requestAction("templates"),
        },
      ]}
      onSignOut={() => requestAction("logout")}
      scopeLabel={scopeLabel(me.dataScope)}
    >
      <section className="workspaceMain employeeWorkspace">
        <header className="workspaceHeader">
          <h1>사원관리</h1>
          <div className="workspaceActions">
            {canExport && (
              <ExportActions
                onRequest={(format) => void exportData(format)}
                disabled={busy || exportBusy}
                pending={
                  !exportPending?.selected ? exportPending?.format : null
                }
              />
            )}
            {canEdit && (
              <button
                disabled={busy || loading}
                className="modeAction"
                onClick={() =>
                  requestAction(mode === "browse" ? "batch-edit" : "browse")
                }
              >
                <WorkspaceIcon name={mode === "browse" ? "edit" : "list"} />
                {mode === "browse" ? "일괄편집" : "조회형"}
              </button>
            )}
          </div>
        </header>
        <SearchPanel
          pending={loading}
          disabled={busy}
          id="employee-query"
          aria-label="사원 검색"
          onSubmit={(event) => {
            event.preventDefault();
            requestAction("search");
          }}
        >
          <h2>검색 조건</h2>
          <TextField
            label="사번"
            placeholder="사번 입력"
            value={draftFilter.employeeNo}
            onChange={(event) =>
              setDraftFilter({
                ...draftFilter,
                employeeNo: event.target.value,
              })
            }
          />
          <TextField
            label="이름"
            type="search"
            placeholder="사원 이름 검색"
            value={draftFilter.name}
            onChange={(event) =>
              setDraftFilter({ ...draftFilter, name: event.target.value })
            }
          />
          <label>
            조직
            <select
              value={draftFilter.orgId}
              onChange={(event) =>
                setDraftFilter({
                  ...draftFilter,
                  orgId: event.target.value,
                })
              }
            >
              <option value="">전체</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            상태
            <select
              value={draftFilter.status}
              onChange={(event) =>
                setDraftFilter({
                  ...draftFilter,
                  status: event.target.value,
                })
              }
            >
              <option value="">전체</option>
              <option value="ACTIVE">재직</option>
              <option value="LEAVE">휴직</option>
            </select>
          </label>
        </SearchPanel>
        <div className="employeeResults">
          <div className="employeeList">
            <GridLayout>
              <GridPanel>
                <header
                  className="employeeListHeader"
                  id="employee-list"
                  tabIndex={-1}
                >
                  <h2>사원 목록</h2>
                  <span className="resultCount">
                    전체 {countCapped ? "10,000건 이상" : `${count}건`}
                  </span>
                  {selectedIds.length > 0 && (
                    <span className="employeeSelection">
                      선택 {selectedIds.length}건
                    </span>
                  )}
                  {currentEmployee && (
                    <a className="employeeDetailJump" href="#employee-detail">
                      {currentEmployee.name} ({currentEmployee.employeeNo}) 상세
                      보기
                    </a>
                  )}
                </header>
                {appliedFilters.length > 0 && (
                  <p className="employeeApplied">
                    적용한 조건: {appliedFilters.join(", ")}
                  </p>
                )}
                {mode === "batch-edit" && (
                  <div className="workspaceToolbar">
                    <button
                      onClick={addRow}
                      disabled={
                        !me.permissions.includes("emp.create") ||
                        busy ||
                        loading ||
                        draftRows.length >= 100
                      }
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
                    <SaveButton
                      count={changes.length}
                      pending={busy}
                      onPointerDown={() => commitEditingRef.current?.()}
                      onClick={() => void save()}
                      disabled={loading || (!dirty && !editing)}
                    />
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
                    <span className={dirty ? "dirtyCount" : undefined}>
                      변경 {changes.length}건
                    </span>
                  </div>
                )}
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
                      pageSize={20}
                      onQueryPendingChange={setLoading}
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
                      cellErrors={cellErrors}
                      loading={loading || busy}
                    />
                  )}
                </div>
              </GridPanel>
            </GridLayout>
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
              {rowErrors.map((item, index) => (
                <p key={`${item.rowKey}:${item.field ?? ""}:${index}`}>
                  입력 오류{" "}
                  {draftRows.find((row) => row.id === item.rowKey)
                    ?.employeeNo ?? item.rowKey}
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
                <p>
                  조회 조건에 맞는 사원이 없습니다. 조회 조건을 바꿔 주세요.
                </p>
              )}
            </div>
          </div>
          {(selectedIds.length > 0 || exportJob) && (
            <aside
              className="workspaceDetail"
              aria-label="상세와 작업"
              id="employee-detail"
              tabIndex={-1}
            >
              {detailId && (
                <header className="employeeDetailHeader">
                  <h2>사원 상세</h2>
                  <a className="employeeDetailJump" href="#employee-list">
                    목록으로
                  </a>
                </header>
              )}
              {detailId && !currentEmployee && (
                <p role={currentDetail ? "alert" : "status"}>
                  {currentDetail
                    ? "사원 상세를 불러오지 못했습니다."
                    : "사원 상세를 불러오는 중입니다."}
                </p>
              )}
              {currentEmployee && (
                <>
                  <div className="detailCard">
                    <div className="employeeIdentity">
                      <strong>{currentEmployee.name}</strong>
                      <EmployeeStatusBadge status={currentEmployee.status} />
                    </div>
                    <dl>
                      <div>
                        <dt>사번</dt>
                        <dd>{currentEmployee.employeeNo}</dd>
                      </div>
                      <div>
                        <dt>조직</dt>
                        <dd>{currentEmployee.orgName}</dd>
                      </div>
                      <div>
                        <dt>직책</dt>
                        <dd>{currentEmployee.position || "미지정"}</dd>
                      </div>
                      <div>
                        <dt>입사일</dt>
                        <dd>{currentEmployee.hireDate}</dd>
                      </div>
                    </dl>
                  </div>
                  <section>
                    <h3>첨부</h3>
                    {me.permissions.includes("file.upload") && (
                      <>
                        <input
                          ref={fileInput}
                          type="file"
                          accept=".png,.pdf,image/png,application/pdf"
                          aria-label="첨부할 PNG 또는 PDF 파일"
                        />
                        <button
                          onClick={() => void uploadFile()}
                          disabled={fileBusy}
                        >
                          첨부 업로드
                        </button>
                      </>
                    )}
                    <ul>
                      {currentDetail.files.map((file) => (
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
                          {me.permissions.includes("file.download") &&
                            file.state === "AVAILABLE" && (
                              <a href={`/api/files/${file.id}/content`}>
                                다운로드
                              </a>
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
              )}
              {(exportJob || (canExport && selectedIds.length > 0)) && (
                <section>
                  <h3>출력 작업</h3>
                  {canExport && selectedIds.length > 0 && (
                    <div className="selectedExport">
                      <span>선택 {selectedIds.length}건</span>
                      <ExportActions
                        selected
                        onRequest={(format) => void exportData(format, true)}
                        disabled={busy || exportBusy}
                        pending={
                          exportPending?.selected ? exportPending.format : null
                        }
                      />
                    </div>
                  )}
                  {exportJob && (
                    <ExportResult
                      {...exportJob}
                      downloadHref={`/api/exports/${exportJob.jobId}/content`}
                    />
                  )}
                </section>
              )}
            </aside>
          )}
        </div>
      </section>
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
    </WorkspaceShell>
  );
}
