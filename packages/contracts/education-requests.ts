import { z } from "zod";

export const educationReasonMaxLength = 4000;
export type EducationCourse = { id: string; code: string; name: string };

// 화면 템플릿과 로컬 교육 과정 원장의 공통 가상 데이터다.
export const exampleEducationCourses: EducationCourse[] = Array.from(
  { length: 24 },
  (_, index) => ({
    id: String(index + 1),
    code: "ED-" + String(index + 1).padStart(3, "0"),
    name:
      ["서비스 기획", "데이터 분석", "고객 응대", "프로젝트 관리"][index % 4] +
      " " +
      (Math.floor(index / 4) + 1) +
      "차",
  }),
);

const createDraft = z
  .object({
    requestId: z.uuid(),
    courseId: z.string().min(1).max(20).nullable(),
    reason: z.string().max(educationReasonMaxLength),
  })
  .strict();
export const educationRequestSave = z.union([
  createDraft,
  createDraft.extend({ id: z.uuid(), rowVersion: z.number().int().positive() }),
]);
export type EducationRequestSave = z.infer<typeof educationRequestSave>;
export type EducationDraftSummary = {
  id: string;
  course: EducationCourse | null;
  status: "DRAFT";
  rowVersion: number;
  updatedAt: string;
};
export type EducationDraft = EducationDraftSummary & { reason: string };
export type EducationInbox = {
  drafts: EducationDraftSummary[];
  courses: EducationCourse[];
  applicant: {
    account: string;
    employee: { employeeNo: string; name: string } | null;
  };
};
