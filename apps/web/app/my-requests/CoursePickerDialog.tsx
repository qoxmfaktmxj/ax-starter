import { useId, useState, type Ref } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { EducationCourse } from "../../../../packages/contracts/education-requests";
import {
  ActionButton,
  TextField,
} from "../../../../packages/ui/workspace/Workspace";
import "./education-form.css";

export function CoursePickerDialog({
  courses,
  value,
  onApply,
  triggerRef,
  error,
}: {
  courses: EducationCourse[];
  value?: EducationCourse;
  onApply: (course: EducationCourse) => void;
  triggerRef?: Ref<HTMLButtonElement>;
  error?: string;
}) {
  const errorId = useId();
  const [candidateId, setCandidateId] = useState("");
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const matches = courses.filter(
    (item) =>
      item.name.includes(term) || item.code.toLowerCase().includes(term),
  );
  const candidate = matches.find((item) => item.id === candidateId);

  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (open) {
          setCandidateId(value?.id ?? "");
          setQuery("");
        }
      }}
    >
      <Dialog.Trigger
        ref={triggerRef}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        render={<ActionButton />}
      >
        과정 찾기
      </Dialog.Trigger>
      {error && (
        <p className="requestFieldError" id={errorId} role="alert">
          {error}
        </p>
      )}
      <Dialog.Portal>
        <Dialog.Backdrop className="workspaceModalBackdrop" />
        <Dialog.Popup className="workspaceModalPopup coursePicker">
          <Dialog.Title>교육 과정 찾기</Dialog.Title>
          <Dialog.Description>
            과정을 고른 뒤 ‘선택 적용’을 누르세요.
          </Dialog.Description>
          <TextField
            label="과정 검색"
            type="search"
            placeholder="과정명 또는 코드"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <fieldset className="courseOptions">
            <legend>검색 결과 {matches.length}건</legend>
            <div>
              {matches.map((item) => (
                <label key={item.id}>
                  <input
                    type="radio"
                    name="example-course"
                    checked={candidateId === item.id}
                    onChange={() => setCandidateId(item.id)}
                  />
                  <span>{item.code}</span> {item.name}
                </label>
              ))}
              {matches.length === 0 && (
                <p role="status">
                  일치하는 과정이 없습니다. 검색어를 바꿔 주세요.
                </p>
              )}
            </div>
          </fieldset>
          <div className="workspaceModalActions">
            <Dialog.Close>취소</Dialog.Close>
            <Dialog.Close
              className="primary"
              disabled={!candidate}
              onClick={() => {
                if (candidate) onApply(candidate);
              }}
            >
              선택 적용
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
