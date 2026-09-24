import type { EmployeeRow } from "../contracts/employees";

export type DataScope = "ALL" | "ORG" | "SELF" | "ORG_TREE" | "CUSTOM";
export type FieldGroup =
  | "salary"
  | "bank"
  | "rrn"
  | "evaluation"
  | "contact"
  | "family"
  | "discipline";
export type FieldGrant = { read: boolean; write: boolean; export: boolean };
export type Permission =
  | "emp.read"
  | "emp.create"
  | "emp.update"
  | "emp.delete"
  | "emp.export"
  | "file.upload"
  | "file.download"
  | "file.delete"
  | "audit.read";

export type ExecutionContext = {
  principal:
    | {
        kind: "user";
        actorId: string;
        employeeId: string | null;
        orgId: string | null;
        authzVersion: number;
      }
    | { kind: "system"; name: string; actorId: string; scope: DataScope };
  permissions: ReadonlySet<Permission>;
  dataScope: DataScope;
  fieldGrants: Partial<Record<FieldGroup, FieldGrant>>;
  correlationId: string;
};

export type TransactionalContext<T> = ExecutionContext & { tx: T };

const adminPermissions: Permission[] = [
  "emp.read",
  "emp.create",
  "emp.update",
  "emp.delete",
  "emp.export",
  "file.upload",
  "file.download",
  "file.delete",
  "audit.read",
];
const managerPermissions: Permission[] = [
  "emp.read",
  "emp.create",
  "emp.update",
  "emp.export",
  "file.upload",
  "file.download",
];

export function policyForRole(roleCode: string): {
  permissions: ReadonlySet<Permission>;
  fieldGrants: ExecutionContext["fieldGrants"];
} {
  if (roleCode === "HR_ADMIN")
    return {
      permissions: new Set(adminPermissions),
      fieldGrants: {
        salary: { read: true, write: true, export: true },
        contact: { read: true, write: true, export: true },
      },
    };
  if (roleCode === "ORG_MANAGER")
    return {
      permissions: new Set(managerPermissions),
      fieldGrants: { contact: { read: true, write: true, export: true } },
    };
  return { permissions: new Set(), fieldGrants: {} };
}

export function can(ctx: ExecutionContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function inScope(
  ctx: ExecutionContext,
  row: { id: string; orgId: string },
): boolean {
  if (ctx.dataScope === "ALL") return true;
  if (ctx.dataScope === "ORG")
    return Boolean(
      ctx.principal.kind === "user" && ctx.principal.orgId === row.orgId,
    );
  if (ctx.dataScope === "SELF")
    return Boolean(
      ctx.principal.kind === "user" && ctx.principal.employeeId === row.id,
    );
  return false;
}

export function canReadField(
  ctx: ExecutionContext,
  field: FieldGroup,
  forExport = false,
): boolean {
  const grant = ctx.fieldGrants[field];
  return Boolean(grant?.read && (!forExport || grant.export));
}

export function projectEmployee(
  ctx: ExecutionContext,
  row: EmployeeRow,
  forExport = false,
): EmployeeRow {
  const { email, monthlySalary, ...safe } = row;
  return {
    ...safe,
    ...(canReadField(ctx, "contact", forExport) ? { email } : {}),
    ...(canReadField(ctx, "salary", forExport) ? { monthlySalary } : {}),
  };
}
