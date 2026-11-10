"use client";
import { useCallback, useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { SaveButtonExample } from "./SaveButtonExample";
import { TextFieldExample } from "./TextFieldExample";
import { EmployeeStatusBadge } from "../../../../packages/ui/workspace/EmployeeStatusBadge";
import { authClient } from "../../auth-client";
import {
  DataGrid,
  type GridColumn,
  type GridSort,
} from "../../../../packages/grid/DataGrid";
import {
  WorkspaceShell,
  ActionButton,
  GridLayout,
  GridPanel,
  TextField,
  SearchPanel,
  type MenuLayout,
} from "../../../../packages/ui/workspace/Workspace";
import {
  scopeLabel,
  useWorkspaceUser,
  type WorkspaceUser,
} from "../useWorkspaceUser";
import type { Permission } from "../../../../packages/core/authz";

type ExampleRow = { id: string; code: string; name: string };
type PanelData = {
  title: string;
  labels: [string, string];
  rows: ExampleRow[];
};
const courses = Array.from({ length: 24 }, (_, i) => ({
  id: String(i + 1),
  code: "ED-" + String(i + 1).padStart(3, "0"),
  name:
    ["서비스 기획", "데이터 분석", "고객 응대", "프로젝트 관리"][i % 4] +
    " " +
    (Math.floor(i / 4) + 1) +
    "차",
}));
const descriptions = [
  "",
  "과정을 선택하면 교육 일정이 열립니다.",
  "과정을 선택하면 교육 일정과 신청자 목록이 열립니다.",
  "선택한 과정의 일정, 신청자, 준비 자료를 함께 비교합니다.",
];

function ExampleGrid({
  panel,
  onSelect,
  pageSize = 10,
}: {
  panel: PanelData;
  pageSize?: number;
  onSelect?: (ids: string[]) => void;
}) {
  const [first, second] = panel.labels;
  const columns: GridColumn[] = [
    { field: "code", label: first, kind: "text", editable: false },
    { field: "name", label: second, kind: "text", editable: false },
  ];
  const load = useCallback(
    async (start: number, end: number, sort: GridSort[]) => {
      const rows = panel.rows.slice();
      if (sort.length)
        rows.sort((a, b) => {
          for (const { field, direction } of sort) {
            const key = field === "code" ? "code" : "name";
            const result = a[key].localeCompare(b[key], "ko", {
              numeric: true,
            });
            if (result) return direction === "asc" ? result : -result;
          }
          return 0;
        });
      return { rows: rows.slice(start, end), total: rows.length };
    },
    [panel.rows],
  );
  return (
    <GridPanel title={panel.title}>
      <div className="workspaceGridArea">
        <DataGrid
          mode="browse"
          pageSize={pageSize}
          singleSelection
          label={panel.title}
          columns={columns}
          loadRows={load}
          onSelectedIdsChange={onSelect}
        />
      </div>
    </GridPanel>
  );
}
const permissionNames: Record<Permission, string> = {
  "emp.read": "사원 조회",
  "emp.create": "사원 추가",
  "emp.update": "사원 수정",
  "emp.delete": "사원 삭제",
  "emp.export": "명부 출력",
  "file.upload": "첨부 업로드",
  "file.download": "첨부 다운로드",
  "file.delete": "첨부 삭제",
  "audit.read": "감사 기록 조회",
};
function PermissionSummary({ me }: { me: WorkspaceUser }) {
  return (
    <div className="workReading">
      <section>
        <h2>사용할 수 있는 기능</h2>
        <p>조회 범위는 {scopeLabel(me.dataScope)}입니다.</p>
        <ul>
          {me.permissions.map((p) => (
            <li key={p}>{permissionNames[p] ?? p}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>사원 필드 권한</h2>
        <table>
          <caption>현재 계정의 항목별 권한</caption>
          <thead>
            <tr>
              {["항목", "조회", "수정", "출력"].map((h) => (
                <th scope="col" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["salary", "contact"] as const).map((group) => (
              <tr key={group}>
                <th scope="row">{group === "salary" ? "급여" : "연락처"}</th>
                {(["read", "write", "export"] as const).map((op) => (
                  <td key={op}>{me.fields[group]?.[op] ? "허용" : "제한"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

type ExampleSettings = { title: string; pageSize: number };
function SettingsExample({
  value,
  onApply,
}: {
  value: ExampleSettings;
  onApply: (settings: ExampleSettings) => void;
}) {
  const [title, setTitle] = useState(value.title);
  const [pageSize, setPageSize] = useState(value.pageSize);
  const [error, setError] = useState("");
  return (
    <form
      className="workReading workSettings"
      aria-label="템플릿 표시 설정"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) {
          setError("목록 제목을 입력하세요.");
          return;
        }
        onApply({ title: title.trim(), pageSize });
      }}
    >
      <h2>템플릿 표시 설정</h2>
      <p>이 탭에서 보는 예시 목록에 적용합니다.</p>
      <TextField
        label="목록 제목"
        value={title}
        maxLength={35}
        hint="최대 35자"
        error={error}
        onChange={(e) => {
          setTitle(e.target.value);
          setError("");
        }}
      />
      <label>
        페이지당 행 수
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {[10, 20, 50].map((n) => (
            <option key={n} value={n}>
              {n}행
            </option>
          ))}
        </select>
      </label>
      <ActionButton primary type="submit">
        목록에 적용
      </ActionButton>
    </form>
  );
}

export default function DesignSystemPage() {
  const { me, authError } = useWorkspaceUser();
  const [layout, setLayout] = useState<MenuLayout>("side");
  const [section, setSection] = useState("templates");
  const [count, setCount] = useState(1);
  const [view, setView] = useState<"grids" | "permissions" | "settings">(
    "grids",
  );
  const [draft, setDraft] = useState("");
  const [rows, setRows] = useState(courses);
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState<ExampleSettings>({
    title: "교육 과정",
    pageSize: 10,
  });
  const [revision, setRevision] = useState(0);
  if (authError || !me)
    return (
      <main className="workspaceAuth">
        <p role={authError ? "alert" : "status"}>
          {authError || "업무 권한을 확인하고 있습니다."}
        </p>
        {authError && <a href="/login">로그인으로 이동</a>}
      </main>
    );
  const course = rows.find((item) => item.id === selected);
  const details: PanelData[] = [
    {
      title: "교육 일정",
      labels: ["회차", "내용"],
      rows: ["오전 강의", "오후 실습"].map((name, i) => ({
        id: String(i),
        code: String(i + 1),
        name,
      })),
    },
    {
      title: "신청자",
      labels: ["접수 번호", "이름"],
      rows: ["가상 신청자 A", "가상 신청자 B"].map((name, i) => ({
        id: String(i),
        code: course?.code + "-" + (i + 1),
        name,
      })),
    },
    {
      title: "준비 자료",
      labels: ["구분", "자료명"],
      rows: [
        { id: "guide", code: "안내", name: (course?.name ?? "") + " 안내서" },
      ],
    },
  ];
  return (
    <WorkspaceShell
      layout={layout}
      scopeLabel={scopeLabel(me.dataScope)}
      onSignOut={() =>
        void authClient.signOut().then(() => window.location.assign("/login"))
      }
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
          active: true,
          onSelect: () => {
            setSection("templates");
            if (view !== "grids") setSelected(null);
            setView("grids");
          },
        },
      ]}
    >
      <Tabs.Root
        className="workspaceMain workCatalog"
        value={section}
        onValueChange={(value) => {
          setSection(String(value));
          setSelected(null);
        }}
      >
        <header className="workspaceHeader">
          <h1>디자인 시스템</h1>
          <label className="workMenuChoice">
            메뉴 배치
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value as MenuLayout)}
            >
              <option value="side">A. 왼쪽 메뉴</option>
              <option value="top">B. 상단 메뉴</option>
            </select>
          </label>
        </header>
        <Tabs.List className="workExamples" aria-label="디자인 시스템">
          <Tabs.Tab value="templates">화면 템플릿</Tabs.Tab>
          <Tabs.Tab value="components">컴포넌트</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="components">
          <SaveButtonExample />
          <TextFieldExample />
          <section
            className="workReading badgeExample"
            aria-labelledby="badge-example-title"
          >
            <h2 id="badge-example-title">상태 배지</h2>
            <table aria-label="사원 상태별 그리드 표시">
              <thead>
                <tr>
                  <th scope="col">상태 코드</th>
                  <th scope="col">그리드 표시</th>
                </tr>
              </thead>
              <tbody>
                {["ACTIVE", "LEAVE"].map((status) => (
                  <tr key={status}>
                    <th scope="row">{status}</th>
                    <td>
                      <EmployeeStatusBadge status={status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </Tabs.Panel>
        <Tabs.Panel value="templates">
          <nav className="templateChoices" aria-label="화면 유형">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                aria-pressed={view === "grids" && count === n}
                onClick={() => {
                  if (view !== "grids") setSelected(null);
                  setView("grids");
                  setCount(n);
                }}
              >
                그리드 {n}개
              </button>
            ))}
            <button
              aria-pressed={view === "settings"}
              onClick={() => setView("settings")}
            >
              입력 폼
            </button>
            <button
              aria-pressed={view === "permissions"}
              onClick={() => setView("permissions")}
            >
              내 권한
            </button>
          </nav>
          {view === "settings" ? (
            <SettingsExample
              value={settings}
              onApply={(value) => {
                setSettings(value);
                setSelected(null);
                setView("grids");
                setRevision((v) => v + 1);
              }}
            />
          ) : view === "permissions" ? (
            <PermissionSummary me={me} />
          ) : (
            <>
              <p className="workTemplateNote">
                교육 업무 예시 데이터입니다. {descriptions[count - 1]}
              </p>
              <SearchPanel
                aria-label="예시 과정 검색"
                onSubmit={(e) => {
                  e.preventDefault();
                  setRows(
                    courses.filter(
                      (c) =>
                        c.name.includes(draft.trim()) ||
                        c.code.includes(draft.trim()),
                    ),
                  );
                  setSelected(null);
                  setRevision((v) => v + 1);
                }}
              >
                <TextField
                  label="교육 과정"
                  value={draft}
                  placeholder="과정명 또는 코드"
                  onChange={(e) => setDraft(e.target.value)}
                />
              </SearchPanel>
              <GridLayout>
                <ExampleGrid
                  key={revision}
                  pageSize={settings.pageSize}
                  panel={{
                    title: settings.title,
                    labels: ["과정 코드", "과정명"],
                    rows,
                  }}
                  onSelect={(ids) => setSelected(ids[0] ?? null)}
                />
                {details.slice(0, count - 1).map((panel) =>
                  course ? (
                    <ExampleGrid
                      key={course.id + panel.title}
                      panel={{
                        ...panel,
                        title: course.code + " " + panel.title,
                      }}
                    />
                  ) : (
                    <GridPanel key={panel.title} title={panel.title}>
                      <p className="workEmpty">
                        교육 과정에서 행을 선택하세요.
                      </p>
                    </GridPanel>
                  ),
                )}
              </GridLayout>
            </>
          )}
        </Tabs.Panel>
      </Tabs.Root>
    </WorkspaceShell>
  );
}
