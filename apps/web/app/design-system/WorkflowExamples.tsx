import { useState } from "react";
import type { EducationCourse } from "../../../../packages/contracts/education-requests";
import { CoursePickerDialog } from "../my-requests/CoursePickerDialog";
import { EducationDraftForm } from "../my-requests/EducationDraftForm";
import "./workflow-examples.css";

export function CoursePickerExample({
  courses,
}: {
  courses: EducationCourse[];
}) {
  const [course, setCourse] = useState<EducationCourse>();
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

export function EducationRequestExample({
  courses,
}: {
  courses: EducationCourse[];
}) {
  const [draft, setDraft] = useState<{
    courseId: string | null;
    reason: string;
  }>({ courseId: null, reason: "" });
  return (
    <EducationDraftForm
      example
      courses={courses}
      applicant="가상 신청자 A"
      {...draft}
      onChange={(courseId, reason) => setDraft({ courseId, reason })}
    />
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
