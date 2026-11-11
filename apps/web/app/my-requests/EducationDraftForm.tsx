import { useId, useRef, useState } from "react";
import {
  educationReasonMaxLength,
  type EducationCourse,
} from "../../../../packages/contracts/education-requests";
import { ActionButton } from "../../../../packages/ui/workspace/Workspace";
import { CoursePickerDialog } from "./CoursePickerDialog";

type DraftFormProps = {
  courses: EducationCourse[];
  applicant: string;
  courseId: string | null;
  reason: string;
  onChange: (courseId: string | null, reason: string) => void;
} & (
  | { example: true }
  | {
      example?: false;
      onSave: () => void;
      onCancel: () => void;
      saving: boolean;
      saveDisabled: boolean;
      locked?: boolean;
    }
);

export function EducationDraftForm(props: DraftFormProps) {
  const { courses, applicant, courseId, reason, onChange } = props;
  const [reviewing, setReviewing] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const courseButton = useRef<HTMLButtonElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const reasonId = id + "-reason";
  const reasonError = attempted && !reason.trim();
  const course = courses.find((item) => item.id === courseId);
  const locked = !props.example && (props.saving || props.locked);
  const title = props.example ? "교육 신청서" : "교육 신청";

  function showReview(next: boolean) {
    setReviewing(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  const draftActions = !props.example && (
    <>
      <ActionButton
        primary
        pending={props.saving}
        pendingLabel="저장 중"
        disabled={props.saveDisabled}
        onClick={props.onSave}
      >
        임시저장
      </ActionButton>
      <ActionButton disabled={props.saving} onClick={props.onCancel}>
        취소
      </ActionButton>
    </>
  );

  return (
    <section className="workReading requestExample" aria-labelledby={id}>
      <h2 id={id} tabIndex={-1} ref={heading}>
        {title} {reviewing ? "검토" : "작성"}
      </h2>
      <p>
        {props.example
          ? "가상 교육 과정의 신청서 예시입니다. 입력한 내용은 이 화면에서만 사용합니다."
          : "임시저장한 신청은 내 신청함에서 이어서 작성할 수 있습니다."}
      </p>
      <dl className="workflowSelection">
        <dt>신청자</dt>
        <dd>{applicant}</dd>
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
          <div className="requestActions">
            <ActionButton disabled={locked} onClick={() => showReview(false)}>
              다시 수정
            </ActionButton>
            {draftActions}
          </div>
        </>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (locked) return;
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
          <fieldset className="requestCourse" disabled={locked}>
            <legend>
              교육 과정 ({props.example ? "필수" : "검토 시 필수"})
            </legend>
            <span>{course ? `${course.code} / ${course.name}` : "미선택"}</span>
            <CoursePickerDialog
              courses={courses}
              value={course}
              onApply={(next) => onChange(next.id, reason)}
              triggerRef={courseButton}
              error={
                attempted && !course ? "교육 과정을 선택하세요." : undefined
              }
            />
          </fieldset>
          <label htmlFor={reasonId}>
            신청 사유 ({props.example ? "필수" : "검토 시 필수"})
          </label>
          <textarea
            id={reasonId}
            ref={reasonInput}
            rows={4}
            value={reason}
            readOnly={locked}
            required
            maxLength={props.example ? undefined : educationReasonMaxLength}
            aria-invalid={reasonError || undefined}
            aria-describedby={reasonError ? reasonId + "-error" : undefined}
            onChange={(event) => onChange(courseId, event.target.value)}
          />
          {reasonError && (
            <p
              className="requestFieldError"
              id={reasonId + "-error"}
              role="alert"
            >
              신청 사유를 입력하세요.
            </p>
          )}
          <div className="requestActions">
            <ActionButton
              primary={props.example}
              disabled={locked}
              type="submit"
            >
              검토하기
            </ActionButton>
            {draftActions}
          </div>
        </form>
      )}
    </section>
  );
}
