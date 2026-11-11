import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OrganizationUpdate } from "../../packages/contracts/organization";
import { resolveActorContext } from "../../packages/server/auth/context";
import { db } from "../../packages/server/db";
import {
  appUsers,
  auditEvents,
  commandResults,
  employees,
  organizations,
} from "../../packages/server/db/schema";
import {
  getOrganizationOverview,
  updateOrganization,
} from "../../packages/server/organization/service";

const adminId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const managerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherOrgEmployee = "00000000-0000-4000-8000-000000000013";
const org = randomUUID();
const first = randomUUID();
const second = randomUUID();
const onLeave = randomUUID();
const removed = randomUUID();
const target = randomUUID();
const sameIssuer = randomUUID();
const otherIssuer = randomUUID();
const inactive = randomUUID();
const observer = randomUUID();
const tempAdmin = randomUUID();
const issuer = `fixture-${org}`;

beforeAll(async () => {
  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values({ id: org, code: org.slice(0, 18), name: "연결 검사 조직" });
    await tx.insert(employees).values(
      [first, second, onLeave, removed].map((id, index) => ({
        id,
        orgId: org,
        employeeNo: `IT-${id.slice(0, 15)}`,
        name: `기준정보 검사 ${index + 1}`,
        hireDate: "2024-01-01",
        status: id === onLeave ? "LEAVE" : "ACTIVE",
        deletedAt: id === removed ? new Date() : null,
      })),
    );
    await tx.insert(appUsers).values(
      [target, sameIssuer, otherIssuer, inactive].map((id) => ({
        id,
        orgId: org,
        issuer: id === otherIssuer ? `${issuer}-second` : issuer,
        subject: id,
        roleCode: "ORG_MANAGER",
        dataScope: "ORG",
        active: id === inactive ? 0 : 1,
      })),
    );
    await tx.insert(appUsers).values([
      {
        id: observer,
        orgId: org,
        issuer: `${issuer}-observer`,
        subject: observer,
        employeeId: first,
        roleCode: "ORG_MANAGER",
        dataScope: "ORG",
      },
      {
        id: tempAdmin,
        orgId: org,
        issuer: `${issuer}-admin`,
        subject: tempAdmin,
        roleCode: "HR_ADMIN",
        dataScope: "ALL",
      },
    ]);
  });
});

afterAll(async () => {
  await db.transaction(async (tx) => {
    await tx
      .delete(commandResults)
      .where(eq(commandResults.actorId, tempAdmin));
    await tx
      .delete(appUsers)
      .where(
        inArray(appUsers.id, [
          target,
          sameIssuer,
          otherIssuer,
          inactive,
          observer,
          tempAdmin,
        ]),
      );
    await tx
      .update(organizations)
      .set({ managerEmployeeId: null })
      .where(eq(organizations.id, org));
    await tx.delete(employees).where(eq(employees.orgId, org));
    await tx.delete(organizations).where(eq(organizations.id, org));
  });
});

describe("organization directory", () => {
  it("returns only the caller's minimal profile and checks management access in the service", async () => {
    const ctx = await resolveActorContext(managerId);
    const overview = await getOrganizationOverview(ctx);
    expect(overview.management).toBeNull();
    expect(overview.self.employee?.employeeNo).toBe("E002");
    expect(overview.self.manager?.employeeNo).toBe("E002");
    expect(overview.self.employee).not.toHaveProperty("monthlySalary");
    expect(overview.self.employee).not.toHaveProperty("email");
    for (const kind of ["manager", "account"] as const) {
      await expect(
        updateOrganization(ctx, {
          requestId: randomUUID(),
          kind,
          targetId: kind === "manager" ? org : target,
          employeeId: first,
          rowVersion: 1,
        }),
      ).rejects.toMatchObject({ status: 403 });
    }
  });

  it("commits an account link once for concurrent retries and rejects another payload", async () => {
    const admin = await resolveActorContext(adminId);
    const cmd: OrganizationUpdate = {
      requestId: randomUUID(),
      kind: "account",
      targetId: target,
      employeeId: first,
      rowVersion: 1,
    };
    const results = await Promise.all([
      updateOrganization(admin, cmd),
      updateOrganization(admin, cmd),
    ]);
    expect(results[0]).toEqual(results[1]);
    const [saved] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.id, target));
    expect(saved).toMatchObject({
      employeeId: first,
      rowVersion: 2,
      authzVersion: 2,
    });
    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.correlationId, admin.correlationId));
    expect(audits.filter((event) => event.outcome === "SUCCESS")).toHaveLength(
      1,
    );
    await expect(
      updateOrganization(admin, { ...cmd, employeeId: second }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateOrganization(admin, {
        ...cmd,
        requestId: randomUUID(),
        employeeId: second,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateOrganization(admin, {
        ...cmd,
        requestId: randomUUID(),
        targetId: sameIssuer,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await updateOrganization(admin, {
      ...cmd,
      requestId: randomUUID(),
      targetId: otherIssuer,
    });
    const overview = await getOrganizationOverview(
      await resolveActorContext(otherIssuer),
    );
    expect(overview.self.employee?.id).toBe(first);
    expect(overview.self.organization?.id).toBe(org);
    await updateOrganization(admin, {
      ...cmd,
      requestId: randomUUID(),
      employeeId: null,
      rowVersion: 2,
    });
    const cleared = await getOrganizationOverview(
      await resolveActorContext(target),
    );
    expect(cleared.self).toEqual({
      employee: null,
      organization: null,
      manager: null,
    });
  });

  it("allows only one concurrent manager change with a version and supports vacancy", async () => {
    const admin = await resolveActorContext(adminId);
    const cmd: OrganizationUpdate = {
      requestId: randomUUID(),
      kind: "manager",
      targetId: org,
      employeeId: first,
      rowVersion: 1,
    };
    const attempts = await Promise.allSettled([
      updateOrganization(admin, cmd),
      updateOrganization(admin, {
        ...cmd,
        requestId: randomUUID(),
        employeeId: second,
      }),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { status: 409 } });
    const [saved] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, org));
    expect(saved.rowVersion).toBe(2);
    expect([first, second]).toContain(saved.managerEmployeeId);
    await updateOrganization(admin, {
      ...cmd,
      requestId: randomUUID(),
      employeeId: null,
      rowVersion: 2,
    });
    const [cleared] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, org));
    expect(cleared).toMatchObject({ managerEmployeeId: null, rowVersion: 3 });
  });

  it("refuses inactive accounts, employees on leave, deleted employees and cross-organization assignments", async () => {
    const admin = await resolveActorContext(adminId);
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, org));
    for (const employeeId of [otherOrgEmployee, onLeave, removed]) {
      await expect(
        updateOrganization(admin, {
          kind: "account",
          targetId: sameIssuer,
          employeeId,
          rowVersion: 1,
          requestId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        updateOrganization(admin, {
          kind: "manager",
          targetId: org,
          employeeId,
          rowVersion: organization.rowVersion,
          requestId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 422 });
    }
    await expect(
      updateOrganization(admin, {
        kind: "account",
        targetId: inactive,
        employeeId: second,
        rowVersion: 1,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 422 });
    const [account] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.id, sameIssuer));
    expect(account).toMatchObject({
      employeeId: null,
      rowVersion: 1,
      authzVersion: 1,
    });
    const [unchanged] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, org));
    expect(unchanged).toEqual(organization);
  });

  it("hides an assigned manager on leave from members while allowing an admin to replace or clear the assignment", async () => {
    const admin = await resolveActorContext(adminId);
    const member = await resolveActorContext(observer);
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, org));
    const assign = (employeeId: string | null, rowVersion: number) =>
      updateOrganization(admin, {
        kind: "manager",
        targetId: org,
        employeeId,
        rowVersion,
        requestId: randomUUID(),
      });
    const assigned = await assign(second, organization.rowVersion);
    expect((await getOrganizationOverview(member)).self.manager?.id).toBe(
      second,
    );
    await db
      .update(employees)
      .set({ status: "LEAVE" })
      .where(eq(employees.id, second));
    try {
      const personal = await getOrganizationOverview(member);
      expect(personal.self.organization?.id).toBe(org);
      expect(personal.self.manager).toBeNull();
      const management = (await getOrganizationOverview(admin)).management!;
      expect(
        management.organizations.find((item) => item.id === org)
          ?.managerEmployeeId,
      ).toBe(second);
      expect(
        management.employees.find((item) => item.id === second)?.status,
      ).toBe("LEAVE");
      const replaced = await assign(first, assigned.rowVersion);
      expect((await getOrganizationOverview(member)).self.manager?.id).toBe(
        first,
      );
      await assign(null, replaced.rowVersion);
      expect((await getOrganizationOverview(member)).self.manager).toBeNull();
    } finally {
      await db
        .update(employees)
        .set({ status: "ACTIVE" })
        .where(eq(employees.id, second));
    }
  });

  it("replays a self-link with its new authorization version and denies it after a later authorization change", async () => {
    const before = await resolveActorContext(tempAdmin);
    const command: OrganizationUpdate = {
      kind: "account",
      targetId: tempAdmin,
      employeeId: first,
      rowVersion: 1,
      requestId: randomUUID(),
    };
    const saved = await updateOrganization(before, command);
    const after = await resolveActorContext(tempAdmin);
    expect(after.principal).toMatchObject({
      employeeId: first,
      authzVersion: 2,
    });
    await expect(updateOrganization(after, command)).resolves.toEqual(saved);
    await expect(
      updateOrganization(before, {
        ...command,
        employeeId: null,
        rowVersion: 2,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 403 });
    const admin = await resolveActorContext(adminId);
    await updateOrganization(admin, {
      ...command,
      employeeId: second,
      rowVersion: saved.rowVersion,
      requestId: randomUUID(),
    });
    await expect(updateOrganization(after, command)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      updateOrganization(await resolveActorContext(tempAdmin), command),
    ).rejects.toMatchObject({ status: 403 });
    const [account] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.id, tempAdmin));
    expect(account).toMatchObject({
      employeeId: second,
      authzVersion: 3,
      rowVersion: 3,
    });
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorId, tempAdmin));
    expect(events.filter((event) => event.outcome === "SUCCESS")).toHaveLength(
      1,
    );
  });
});
