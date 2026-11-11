import { useId, useRef, useState, type Ref } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  ActionButton,
  TextField,
} from "../../../../packages/ui/workspace/Workspace";
import "./workflow-examples.css";

type Course = { id: string; code: string; name: string };

export function CoursePickerExample({ courses }: { courses: Course[] }) {
  const [course, setCourse] = useState<Course>();
  return (
    <section
      className="workReading workflowExample"
      aria-labelledby="picker-example"
    >
      <h2 id="picker-example">과정 선택 팝업</h2>
      <p>가상 교육 과정에서 하나를 골라 이 화면에 적용합니다.</p>
      <dl className="workflowSelection">
        <dt>선택한 과정</dt>
        <dd>{course ? `${course.code} / ${course.name}` : "미선택"}</dd>
      </dl>
      <CoursePickerDialog
        courses={courses}
        value={course}
        onApply={setCourse}
      />
    </section>
  );
}

export function CoursePickerDialog({
  courses,
  value,
  onApply,
  triggerRef,
  error,
}: {
  courses: Course[];
  value?: Course;
  onApply: (course: Course) => void;
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

export function EducationRequestExample({ courses }: { courses: Course[] }) {
  const [course, setCourse] = useState<Course>();
  const [reason, setReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const courseButton = useRef<HTMLButtonElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reasonId = useId();
  const reasonError = attempted && !reason.trim();

  function showReview(next: boolean) {
    setReviewing(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  return (
    <section
      className="workReading workflowExample requestExample"
      aria-labelledby="education-request-title"
    >
      <h2 id="education-request-title" tabIndex={-1} ref={heading}>
        {reviewing ? "교육 신청서 검토" : "교육 신청서 작성"}
      </h2>
      <p>
        가상 교육 과정의 신청서 예시입니다. 입력한 내용은 이 화면에서만
        사용합니다.
      </p>
      <dl className="workflowSelection">
        <dt>신청자</dt>
        <dd>가상 신청자 A</dd>
      </dl>
      {reviewing && course ? (
        <>
          <dl className="requestReview">
            <dt>교육 과정</dt>
            <dd>
              {course.code} / {course.name}
            </dd>
            <dt>신청 사유</dt>
            <dd>{reason}</dd>
          </dl>
          <ActionButton onClick={() => showReview(false)}>
            다시 수정
          </ActionButton>
        </>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            if (!course) {
              courseButton.current?.focus();
              return;
            }
            if (!reason.trim()) {
              reasonInput.current?.focus();
              return;
            }
            showReview(true);
          }}
        >
          <fieldset className="requestCourse">
            <legend>교육 과정 (필수)</legend>
            <span>{course ? `${course.code} / ${course.name}` : "미선택"}</span>
            <CoursePickerDialog
              courses={courses}
              value={course}
              onApply={setCourse}
              triggerRef={courseButton}
              error={
                attempted && !course ? "교육 과정을 선택하세요." : undefined
              }
            />
          </fieldset>
          <label htmlFor={reasonId}>신청 사유 (필수)</label>
          <textarea
            id={reasonId}
            ref={reasonInput}
            rows={4}
            value={reason}
            required
            aria-invalid={reasonError || undefined}
            aria-describedby={reasonError ? reasonId + "-error" : undefined}
            onChange={(event) => setReason(event.target.value)}
          />
          {reasonError && (
            <p
              className="requestFieldError"
              role="alert"
              id={reasonId + "-error"}
            >
              신청 사유를 입력하세요.
            </p>
          )}
          <ActionButton primary type="submit">
            검토하기
          </ActionButton>
        </form>
      )}
    </section>
  );
}

const changes = [
  { label: "과정", before: "서비스 기획 1차", after: "서비스 기획 1차" },
  { label: "교육 장소", before: "가상 교육장 A", after: "가상 교육장 B" },
  { label: "정원", before: "12명", after: "16명" },
];

export function ChangeReviewExample() {
  const [changedOnly, setChangedOnly] = useState(false);
  const rows = changedOnly
    ? changes.filter((item) => item.before !== item.after)
    : changes;
  return (
    <section
      className="workReading workflowExample"
      aria-labelledby="review-example"
    >
      <h2 id="review-example">변경 전후 비교</h2>
      <p>가상 교육 과정의 운영 계획 수정안을 검토합니다.</p>
      <label className="reviewFilter">
        <input
          type="checkbox"
          checked={changedOnly}
          onChange={(e) => setChangedOnly(e.target.checked)}
        />{" "}
        변경 항목만 보기
      </label>
      <table aria-label="교육 운영 계획 변경 전후">
        <thead>
          <tr>
            <th scope="col">항목</th>
            <th scope="col">현재 값</th>
            <th scope="col">변경안</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.label}>
              <th scope="row">{item.label}</th>
              <td>{item.before}</td>
              <td>
                {item.before !== item.after ? (
                  <strong>{item.after}</strong>
                ) : (
                  "변경 없음"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
