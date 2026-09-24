import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type {
  BatchSaveRequest,
  EmployeeQuery,
} from "../../packages/contracts/employees";
import { db } from "../../packages/server/db";
import {
  appUsers,
  auditEvents,
  employees,
} from "../../packages/server/db/schema";
import { resolveActorContext } from "../../packages/server/auth/context";
import {
  getEmployee,
  queryEmployees,
  saveBatch,
} from "../../packages/server/employees/service";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MANAGER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B_EMPLOYEE = "00000000-0000-4000-8000-000000000013";

const seedEmployeeQuery: EmployeeQuery = {
  filters: { employeeNo: "E" },
  offset: 0,
  limit: 100,
  sort: [],
};

function uniqueEmployeeNo(): string {
  return `IT-${(BigInt(`0x${randomUUID().replaceAll("-", "")}`) % 10n ** 17n).toString().padStart(17, "0")}`;
}

async function insertEmployee() {
  const ctx = await resolveActorContext(ADMIN_ID);
  const clientRowId = `new-${randomUUID()}`;
  const request: BatchSaveRequest = {
    requestId: randomUUID(),
    changes: [
      {
        kind: "insert",
        clientRowId,
        values: {
          employeeNo: uniqueEmployeeNo(),
          name: `통합테스트 ${randomUUID().slice(0, 8)}`,
          orgId: ORG_A,
          position: "테스트",
          hireDate: "2024-01-31",
          status: "ACTIVE",
          email: "",
          monthlySalary: "1234567.89",
        },
      },
    ],
  };
  const saved = await saveBatch(ctx, request);
  if (!saved.result.ok) throw new Error("Integration employee insert failed");
  const rowId = saved.result.idMap.find(
    (item) => item.clientRowId === clientRowId,
  )?.rowId;
  if (!rowId) throw new Error("Integration employee insert returned no row ID");
  return {
    rowId,
    employeeNo:
      request.changes[0].kind === "insert"
        ? request.changes[0].values.employeeNo
        : "",
  };
}

async function auditsFor(correlationId: string) {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.correlationId, correlationId));
}

describe("employee service PostgreSQL integration", () => {
  it("projects 24 seeded employees for admin and 12 for manager without manager salary", async () => {
    const admin = await resolveActorContext(ADMIN_ID);
    const manager = await resolveActorContext(MANAGER_ID);
    const adminResult = await queryEmployees(admin, seedEmployeeQuery);
    const managerResult = await queryEmployees(manager, seedEmployeeQuery);
    const seededAdmin = adminResult.rows.filter((row) =>
      /^E\d{3}$/.test(row.employeeNo),
    );
    const seededManager = managerResult.rows.filter((row) =>
      /^E\d{3}$/.test(row.employeeNo),
    );

    expect(seededAdmin).toHaveLength(24);
    expect(seededManager).toHaveLength(12);
    expect(
      managerResult.rows.every((row) => !Object.hasOwn(row, "monthlySalary")),
    ).toBe(true);
    await expect(auditsFor(admin.correlationId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "employee.sensitive_read",
          outcome: "SUCCESS",
        }),
      ]),
    );
  });

  it("denies manager salary writes without changing the row and records the denial", async () => {
    const { rowId } = await insertEmployee();
    const before = await getEmployee(
      await resolveActorContext(ADMIN_ID),
      rowId,
    );
    const manager = await resolveActorContext(MANAGER_ID);
    const request: BatchSaveRequest = {
      requestId: randomUUID(),
      changes: [
        {
          kind: "update",
          rowId,
          rowVersion: before.rowVersion,
          values: { monthlySalary: "1.00" },
        },
      ],
    };

    await expect(saveBatch(manager, request)).rejects.toMatchObject({
      status: 403,
    });

    const after = await getEmployee(await resolveActorContext(ADMIN_ID), rowId);
    expect(after.monthlySalary).toBe(before.monthlySalary);
    await expect(auditsFor(manager.correlationId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "employee.batch",
          outcome: "DENIED",
        }),
      ]),
    );
  });

  it("rejects an out-of-scope mixed batch without applying its in-scope update", async () => {
    const { rowId } = await insertEmployee();
    const before = await getEmployee(
      await resolveActorContext(ADMIN_ID),
      rowId,
    );
    const manager = await resolveActorContext(MANAGER_ID);
    const request: BatchSaveRequest = {
      requestId: randomUUID(),
      changes: [
        {
          kind: "update",
          rowId,
          rowVersion: before.rowVersion,
          values: { position: "변경되면 안 됨" },
        },
        {
          kind: "update",
          rowId: ORG_B_EMPLOYEE,
          rowVersion: 1,
          values: { position: "범위 밖" },
        },
      ],
    };

    await expect(saveBatch(manager, request)).rejects.toMatchObject({
      status: 404,
    });

    const after = await getEmployee(await resolveActorContext(ADMIN_ID), rowId);
    expect(after.position).toBe(before.position);
    await expect(auditsFor(manager.correlationId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "employee.batch",
          outcome: "FAILED",
        }),
      ]),
    );
  });

  it("allows only one concurrent update using the same rowVersion", async () => {
    const { rowId } = await insertEmployee();
    const before = await getEmployee(
      await resolveActorContext(ADMIN_ID),
      rowId,
    );
    const firstContext = await resolveActorContext(ADMIN_ID);
    const secondContext = await resolveActorContext(ADMIN_ID);
    const firstRequest: BatchSaveRequest = {
      requestId: randomUUID(),
      changes: [
        {
          kind: "update",
          rowId,
          rowVersion: before.rowVersion,
          values: { position: "경쟁 저장 A" },
        },
      ],
    };
    const secondRequest: BatchSaveRequest = {
      requestId: randomUUID(),
      changes: [
        {
          kind: "update",
          rowId,
          rowVersion: before.rowVersion,
          values: { position: "경쟁 저장 B" },
        },
      ],
    };

    const results = await Promise.all([
      saveBatch(firstContext, firstRequest),
      saveBatch(secondContext, secondRequest),
    ]);

    expect(results.map((item) => item.status).sort()).toEqual([200, 409]);
    expect(results.filter((item) => item.result.ok)).toHaveLength(1);
    const conflict = results.find((item) => !item.result.ok);
    expect(conflict?.result).toMatchObject({
      ok: false,
      conflicts: [{ rowId }],
    });
    const after = await getEmployee(await resolveActorContext(ADMIN_ID), rowId);
    expect(after.rowVersion).toBe(before.rowVersion + 1);
    expect(["경쟁 저장 A", "경쟁 저장 B"]).toContain(after.position);
  });

  it("replays a concurrent same-request insert with one row and the same idMap", async () => {
    const firstContext = await resolveActorContext(ADMIN_ID);
    const secondContext = await resolveActorContext(ADMIN_ID);
    const clientRowId = `new-${randomUUID()}`;
    const employeeNo = uniqueEmployeeNo();
    const request: BatchSaveRequest = {
      requestId: randomUUID(),
      changes: [
        {
          kind: "insert",
          clientRowId,
          values: {
            employeeNo,
            name: `멱등성 테스트 ${randomUUID().slice(0, 8)}`,
            orgId: ORG_A,
            position: "테스트",
            hireDate: "2024-01-31",
            status: "ACTIVE",
            email: "",
            monthlySalary: "9876543.21",
          },
        },
      ],
    };

    const results = await Promise.all([
      saveBatch(firstContext, request),
      saveBatch(secondContext, request),
    ]);

    expect(results[0]).toMatchObject({ status: 200, result: { ok: true } });
    expect(results[1]).toEqual(results[0]);
    if (!results[0].result.ok)
      throw new Error("Idempotent insert returned a non-success result");
    const rowId = results[0].result.idMap[0]?.rowId;
    expect(rowId).toBeTruthy();
    const rows = await db
      .select()
      .from(employees)
      .where(eq(employees.employeeNo, employeeNo));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(rowId);

    const successAudits = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "employee.batch"),
          eq(auditEvents.outcome, "SUCCESS"),
        ),
      );
    expect(
      successAudits.filter((event) => event.subjectIds?.includes(rowId!)),
    ).toHaveLength(1);
    await db
      .update(appUsers)
      .set({ authzVersion: sql`${appUsers.authzVersion} + 1` })
      .where(eq(appUsers.id, ADMIN_ID));
    await expect(saveBatch(firstContext, request)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("replays a committed version conflict and accepts a corrected new request", async () => {
    const { rowId } = await insertEmployee();
    const admin = await resolveActorContext(ADMIN_ID);
    const before = await getEmployee(admin, rowId);
    const stale: BatchSaveRequest = {
      requestId: randomUUID(),
      changes: [
        {
          kind: "update",
          rowId,
          rowVersion: before.rowVersion + 5,
          values: { position: "잘못된 버전" },
        },
      ],
    };
    const first = await saveBatch(admin, stale);
    expect(first.status).toBe(409);
    expect(await saveBatch(admin, stale)).toEqual(first);
    expect((await getEmployee(admin, rowId)).position).toBe(before.position);
    const corrected = await saveBatch(admin, {
      requestId: randomUUID(),
      changes: [
        {
          kind: "update",
          rowId,
          rowVersion: before.rowVersion,
          values: { position: "다시 저장" },
        },
      ],
    });
    expect(corrected.status).toBe(200);
    expect((await getEmployee(admin, rowId)).position).toBe("다시 저장");
  });

  it("limits SELF to one employee and rejects an unsupported scope", async () => {
    const selfId = "00000000-0000-4000-8000-000000000001";
    await db
      .update(appUsers)
      .set({
        employeeId: selfId,
        dataScope: "SELF",
        authzVersion: sql`${appUsers.authzVersion} + 1`,
      })
      .where(eq(appUsers.id, MANAGER_ID));
    try {
      const self = await resolveActorContext(MANAGER_ID);
      const result = await queryEmployees(self, seedEmployeeQuery);
      expect(result.rows.map((row) => row.id)).toEqual([selfId]);
      await db
        .update(appUsers)
        .set({
          dataScope: "CUSTOM",
          authzVersion: sql`${appUsers.authzVersion} + 1`,
        })
        .where(eq(appUsers.id, MANAGER_ID));
      await expect(resolveActorContext(MANAGER_ID)).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      await db
        .update(appUsers)
        .set({
          dataScope: "ORG",
          employeeId: null,
          authzVersion: sql`${appUsers.authzVersion} + 1`,
        })
        .where(eq(appUsers.id, MANAGER_ID));
    }
  });

  it("keeps audit events append-only in PostgreSQL", async () => {
    const [event] = await db.select().from(auditEvents).limit(1);
    expect(event).toBeDefined();
    await expect(
      db
        .update(auditEvents)
        .set({ outcome: "CHANGED" })
        .where(eq(auditEvents.id, event.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(auditEvents).where(eq(auditEvents.id, event.id)),
    ).rejects.toThrow();
  });
});
