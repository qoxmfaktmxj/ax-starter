import { useState } from "react";
import { EmployeeStatusBadge } from "../../../../packages/ui/workspace/EmployeeStatusBadge";
import { SaveButtonExample } from "./SaveButtonExample";
import { TextFieldExample } from "./TextFieldExample";
import "./catalog.css";

const examples = [
  { id: "save", label: "저장 버튼", preview: <SaveButtonExample /> },
  { id: "field", label: "입력 필드", preview: <TextFieldExample /> },
  {
    id: "badge",
    label: "상태 배지",
    preview: (
      <section
        className="workReading badgeExample"
        aria-labelledby="badge-example-title"
      >
        <header className="specimenHeading">
          <h2 id="badge-example-title">상태 배지</h2>
          <code>EmployeeStatusBadge</code>
        </header>
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
    ),
  },
];

export function ComponentCatalog() {
  const [selected, setSelected] = useState("save");
  return (
    <div className="componentCatalog">
      <nav className="catalogIndex" aria-label="컴포넌트 목록">
        <h2>컴포넌트 목록</h2>
        {examples.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={selected === id}
            aria-controls={`catalog-${id}`}
            onClick={() => setSelected(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="catalogPreviews">
        {examples.map(({ id, preview }) => (
          <div key={id} id={`catalog-${id}`} hidden={selected !== id}>
            {preview}
          </div>
        ))}
      </div>
    </div>
  );
}
