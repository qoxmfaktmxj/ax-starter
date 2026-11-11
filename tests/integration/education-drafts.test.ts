import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { educationReasonMaxLength } from "../../packages/contracts/education-requests";
import { resolveActorContext } from "../../packages/server/auth/context";
import { db } from "../../packages/server/db";
import {
  appUsers,
  auditEvents,
  commandResults,
  educationDrafts,
} from "../../packages/server/db/schema";
import {
  getEducationDraft,
  listEducationDrafts,
  saveEducationDraft,
} from "../../packages/server/education-requests/service";

const ownerId = randomUUID();
const adminId = randomUUID();
const ownerIds = [ownerId, adminId];
const courseId = "2";

beforeAll(async () => {
  await db.insert(appUsers).values(
    ownerIds.map((id) => ({
      id,
      issuer: `draft-test-${id}`,
      subject: id,
      orgId: "11111111-1111-4111-8111-111111111111",
      employeeId: "00000000-0000-4000-8000-000000000002",
      roleCode: id === ownerId ? "ORG_MANAGER" : "HR_ADMIN",
      dataScope: id === ownerId ? "ORG" : "ALL",
    })),
  );
});

afterAll(async () => {
  await db.transaction(async (tx) => {
    await tx
      .delete(educationDrafts)
      .where(inArray(educationDrafts.ownerId, ownerIds));
    await tx
      .delete(commandResults)
      .where(inArray(commandResults.actorId, ownerIds));
    await tx.delete(appUsers).where(inArray(appUsers.id, ownerIds));
  });
});

describe("education drafts", () => {
  it("creates one partial draft on concurrent duplicate sends and preserves the exact reason", async () => {
    const owner = await resolveActorContext(ownerId);
    const reason = "  첫 번째 줄\n\n두 번째 줄  ";
    const command = { requestId: randomUUID(), courseId: null, reason };
    const [first, retry] = await Promise.all([
      saveEducationDraft(owner, command),
      saveEducationDraft(owner, command),
    ]);
    expect(retry).toEqual(first);
    expect(first.rowVersion).toBe(1);
    const freshContext = await resolveActorContext(ownerId);
    const draft = await getEducationDraft(freshContext, first.id);
    expect(draft).toMatchObject({
      id: first.id,
      rowVersion: 1,
      course: null,
      reason,
      status: "DRAFT",
    });
    const inbox = await listEducationDrafts(freshContext);
    expect(inbox.drafts.filter((row) => row.id === first.id)).toHaveLength(1);
    expect(inbox.drafts.find((row) => row.id === first.id)).not.toHaveProperty(
      "reason",
    );
    expect(inbox.courses).toContainEqual(
      expect.objectContaining({
        id: courseId,
        code: "ED-002",
        name: "데이터 분석 1차",
      }),
    );
    const events = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.correlationId, owner.correlationId),
          eq(auditEvents.action, "education.draft.save"),
          eq(auditEvents.outcome, "SUCCESS"),
        ),
      );
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("두 번째 줄");
    await expect(
      saveEducationDraft(owner, { ...command, reason: "다른 요청 내용" }),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("updates the same version once; a losing editor cannot overwrite the winner", async () => {
    const owner = await resolveActorContext(ownerId);
    const initial = await saveEducationDraft(owner, {
      requestId: randomUUID(),
      courseId,
      reason: "",
    });
    const edit = {
      id: initial.id,
      rowVersion: initial.rowVersion,
      courseId: "4",
      reason: "수정한 사유\n두 번째 줄",
      requestId: randomUUID(),
    };
    const result = await saveEducationDraft(owner, edit);
    expect(await saveEducationDraft(owner, edit)).toEqual(result);
    expect(result).toMatchObject({ id: initial.id, rowVersion: 2 });
    expect(await getEducationDraft(owner, initial.id)).toMatchObject({
      course: { code: "ED-004" },
      reason: edit.reason,
      rowVersion: 2,
    });
    const attempts = await Promise.allSettled(
      ["첫 화면", "두 번째 화면"].map((reason) =>
        saveEducationDraft(owner, {
          ...edit,
          rowVersion: 2,
          requestId: randomUUID(),
          reason,
        }),
      ),
    );
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(attempts.find((item) => item.status === "rejected")).toMatchObject({
      reason: { status: 409, code: "VERSION_CONFLICT" },
    });
    const latest = await getEducationDraft(owner, initial.id);
    expect(latest.rowVersion).toBe(3);
    expect(latest.reason).toBe(
      attempts[0].status === "fulfilled" ? "첫 화면" : "두 번째 화면",
    );
  });

  it("lists, opens and edits only the authenticated account's own drafts", async () => {
    const owner = await resolveActorContext(ownerId);
    const admin = await resolveActorContext(adminId);
    const saved = await saveEducationDraft(owner, {
      requestId: randomUUID(),
      courseId,
      reason: "본인만 볼 수 있는 사유",
    });
    expect(
      (await listEducationDrafts(admin)).drafts.map((item) => item.id),
    ).not.toContain(saved.id);
    await expect(getEducationDraft(admin, saved.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      saveEducationDraft(admin, {
        ...saved,
        courseId,
        reason: "남의 신청 변경",
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await getEducationDraft(owner, saved.id)).toMatchObject({
      rowVersion: 1,
      reason: "본인만 볼 수 있는 사유",
    });
  });

  it("rejects a missing course without creating a draft or changing the previous version", async () => {
    const owner = await resolveActorContext(ownerId);
    const count = (await listEducationDrafts(owner)).drafts.length;
    await expect(
      saveEducationDraft(owner, {
        courseId: "999",
        reason: "미등록 과정",
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect((await listEducationDrafts(owner)).drafts).toHaveLength(count);
    const saved = await saveEducationDraft(owner, {
      courseId,
      reason: "이전 사유",
      requestId: randomUUID(),
    });
    await expect(
      saveEducationDraft(owner, {
        ...saved,
        courseId: "999",
        reason: "새 사유",
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(await getEducationDraft(owner, saved.id)).toMatchObject({
      rowVersion: 1,
      course: { code: "ED-002" },
      reason: "이전 사유",
    });
  });

  it("validates reason length and rejects client-supplied ownership and incomplete update keys", async () => {
    const owner = await resolveActorContext(ownerId);
    const request = {
      requestId: randomUUID(),
      courseId: null,
      reason: "가".repeat(educationReasonMaxLength),
    };
    const saved = await saveEducationDraft(owner, request);
    const next = { ...request, ...saved, requestId: randomUUID() };
    for (const invalid of [
      { ...next, reason: request.reason + "나" },
      { ...next, ownerId: adminId },
      { ...request, id: saved.id },
      { ...request, rowVersion: 1 },
    ])
      await expect(saveEducationDraft(owner, invalid)).rejects.toBeInstanceOf(
        ZodError,
      );
    expect(await getEducationDraft(owner, saved.id)).toMatchObject({
      reason: request.reason,
      rowVersion: 1,
    });
  });

  it("rechecks an account's current authorization before returning saved content or replaying a save", async () => {
    const owner = await resolveActorContext(ownerId);
    const request = {
      requestId: randomUUID(),
      courseId: null,
      reason: "권한 재확인",
    };
    const saved = await saveEducationDraft(owner, request);
    try {
      await db
        .update(appUsers)
        .set({ authzVersion: 2 })
        .where(eq(appUsers.id, ownerId));
      await expect(getEducationDraft(owner, saved.id)).rejects.toMatchObject({
        status: 403,
      });
      await expect(saveEducationDraft(owner, request)).rejects.toMatchObject({
        status: 403,
      });
      const current = await resolveActorContext(ownerId);
      await db
        .update(appUsers)
        .set({ active: 0 })
        .where(eq(appUsers.id, ownerId));
      await expect(listEducationDrafts(current)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        saveEducationDraft(current, { ...request, requestId: randomUUID() }),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      await db
        .update(appUsers)
        .set({ authzVersion: 1, active: 1 })
        .where(eq(appUsers.id, ownerId));
    }
  });
});
