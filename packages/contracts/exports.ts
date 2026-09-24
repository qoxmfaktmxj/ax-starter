import { z } from "zod";
import { employeeQuery } from "./employees";

export const exportRequest = z
  .object({
    requestId: z.uuid(),
    format: z.enum(["xlsx", "pdf"]),
    query: employeeQuery.optional(),
    selectedIds: z.array(z.uuid()).min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.query) !== Boolean(value.selectedIds),
    "조회 조건 또는 선택 행 중 하나를 지정하세요",
  );

export type ExportRequest = z.infer<typeof exportRequest>;
