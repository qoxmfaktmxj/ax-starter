import { z } from "zod";

export const organizationUpdate = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(["account", "manager"]),
    targetId: z.uuid(),
    employeeId: z.uuid().nullable(),
    rowVersion: z.number().int().positive(),
  })
  .strict();

export type OrganizationUpdate = z.infer<typeof organizationUpdate>;
export type DirectoryOrg = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
};
export type DirectoryEmployee = {
  id: string;
  employeeNo: string;
  name: string;
  orgId: string;
  status: "ACTIVE" | "LEAVE";
};
export type OrganizationManagement = {
  accounts: {
    id: string;
    subject: string;
    provider: "password" | "oidc";
    orgId: string | null;
    employeeId: string | null;
    active: boolean;
    rowVersion: number;
  }[];
  organizations: (DirectoryOrg & {
    managerEmployeeId: string | null;
    rowVersion: number;
  })[];
  employees: DirectoryEmployee[];
};

export type OrganizationOverview = {
  self: {
    employee: DirectoryEmployee | null;
    organization: DirectoryOrg | null;
    manager: DirectoryEmployee | null;
  };
  management: OrganizationManagement | null;
};
