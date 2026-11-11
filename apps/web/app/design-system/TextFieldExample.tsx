import { useState } from "react";
import { TextField } from "../../../../packages/ui/workspace/Workspace";

export function TextFieldExample() {
  const [employeeNo, setEmployeeNo] = useState("E12345678901234567890");
  return (
    <section
      className="workReading fieldExample"
      aria-labelledby="field-example-title"
    >
      <header className="specimenHeading">
        <h2 id="field-example-title">입력 필드</h2>
        <code>TextField</code>
      </header>
      <p>사원관리에서 사용하는 사번 검색 필드입니다.</p>
      <dl>
        <div>
          <dt>기본</dt>
          <dd>
            <TextField label="사번" placeholder="사번 입력" />
          </dd>
        </div>
        <div>
          <dt>포커스</dt>
          <dd>
            <TextField
              label="사번"
              defaultValue="E001"
              hint="Tab 키로 이동해 포커스 테두리를 확인하세요."
            />
          </dd>
        </div>
        <div>
          <dt>읽기 전용</dt>
          <dd>
            <TextField label="사번" value="E001" readOnly />
          </dd>
        </div>
        <div>
          <dt>비활성</dt>
          <dd>
            <TextField label="사번" value="E001" disabled />
          </dd>
        </div>
        <div>
          <dt>오류</dt>
          <dd>
            <TextField
              label="사번"
              value={employeeNo}
              onChange={(event) => setEmployeeNo(event.target.value)}
              error={
                employeeNo.length > 20
                  ? "사번을 20자 이내로 입력하세요."
                  : undefined
              }
            />
          </dd>
        </div>
      </dl>
    </section>
  );
}
