import { z } from "zod";

const dateString = z.iso.date();
const salary = z.union([
  z.null(),
  z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/),
]);

export const employeeValues = z
  .object({
    employeeNo: z.string().regex(/^[A-Z0-9-]{1,20}$/),
    name: z.string().trim().min(1).max(80),
    orgId: z.uuid(),
    position: z.string().max(50),
    hireDate: dateString,
    status: z.enum(["ACTIVE", "LEAVE"]),
    email: z.union([z.literal(""), z.email().max(254)]),
    monthlySalary: salary.optional(),
  })
  .strict();

export const employeeUpdate = employeeValues
  .pick({
    name: true,
    position: true,
    hireDate: true,
    status: true,
    email: true,
    monthlySalary: true,
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "수정할 필드가 없습니다");

export const batchSaveRequest = z
  .object({
    requestId: z.uuid(),
    changes: z
      .array(
        z.discriminatedUnion("kind", [
          z
            .object({
              kind: z.literal("insert"),
              clientRowId: z.string().min(1).max(100),
              values: employeeValues,
            })
            .strict(),
          z
            .object({
              kind: z.literal("update"),
              rowId: z.uuid(),
              rowVersion: z.number().int().positive(),
              values: employeeUpdate,
            })
            .strict(),
          z
            .object({
              kind: z.literal("delete"),
              rowId: z.uuid(),
              rowVersion: z.number().int().positive(),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((request, ctx) => {
    const keys = new Set<string>();
    request.changes.forEach((change, index) => {
      const key =
        change.kind === "insert"
          ? `new:${change.clientRowId}`
          : `row:${change.rowId}`;
      if (keys.has(key))
        ctx.addIssue({
          code: "custom",
          message: "같은 행을 두 번 변경할 수 없습니다",
          path: ["changes", index],
        });
      keys.add(key);
    });
  });

export const employeeQuery = z
  .object({
    filters: z
      .object({
        employeeNo: z.string().max(20).optional(),
        name: z.string().max(80).optional(),
        orgId: z.uuid().optional(),
        status: z.enum(["ACTIVE", "LEAVE"]).optional(),
      })
      .strict()
      .default({}),
    offset: z.number().int().min(0).max(10000).default(0),
    limit: z.number().int().min(1).max(100).default(50),
    sort: z
      .array(
        z
          .object({
            field: z.enum([
              "employeeNo",
              "name",
              "orgId",
              "hireDate",
              "status",
            ]),
            direction: z.enum(["asc", "desc"]),
          })
          .strict(),
      )
      .max(2)
      .default([]),
  })
  .strict();

export type EmployeeValues = z.infer<typeof employeeValues>;
export type BatchSaveRequest = z.infer<typeof batchSaveRequest>;
export type EmployeeQuery = z.infer<typeof employeeQuery>;

export type EmployeeRow = {
  id: string;
  employeeNo: string;
  name: string;
  orgId: string;
  orgName: string;
  position: string;
  hireDate: string;
  status: "ACTIVE" | "LEAVE";
  rowVersion: number;
  email?: string;
  monthlySalary?: string | null;
};

export type BatchSaveResult =
  | {
      ok: true;
      idMap: { clientRowId: string; rowId: string }[];
      versions: { rowId: string; rowVersion: number }[];
    }
  | {
      ok: false;
      rowErrors: { rowKey: string; field?: string; message: string }[];
      conflicts: { rowId: string; currentVersion: number }[];
    };
