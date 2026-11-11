import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveActorContext } from "../../packages/server/auth/context";
import { db } from "../../packages/server/db";
import { appUsers } from "../../packages/server/db/schema";
import { getHomeMode, setHomeMode } from "../../packages/server/home/service";

const member = randomUUID();
const admin = randomUUID();

beforeAll(async () => {
  await db.insert(appUsers).values(
    [member, admin].map((id) => ({
      id,
      issuer: "home-mode-test",
      subject: id,
      roleCode: id === admin ? "HR_ADMIN" : "ORG_MANAGER",
      dataScope: id === admin ? "ALL" : "ORG",
    })),
  );
});

afterAll(async () => {
  await db.delete(appUsers).where(inArray(appUsers.id, [member, admin]));
});

describe("home mode", () => {
  it("starts in work mode and restores each account's last selection", async () => {
    const ctx = await resolveActorContext(member);
    expect(await getHomeMode(ctx)).toBe("work");
    expect(await setHomeMode(ctx, { mode: "portal" })).toBe("portal");
    expect(await getHomeMode(await resolveActorContext(member))).toBe("portal");
    expect(await getHomeMode(await resolveActorContext(admin))).toBe("work");
    expect(await setHomeMode(ctx, { mode: "work" })).toBe("work");
    expect(await getHomeMode(await resolveActorContext(member))).toBe("work");
  });

  it("rejects unsupported modes and updates targeting another account", async () => {
    const ctx = await resolveActorContext(admin);
    await expect(setHomeMode(ctx, { mode: "other" })).rejects.toMatchObject({
      name: "ZodError",
    });
    await expect(
      setHomeMode(ctx, { mode: "portal", actorId: member }),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(await getHomeMode(ctx)).toBe("work");
  });

  it("refuses reads and writes after the account is deactivated", async () => {
    const ctx = await resolveActorContext(member);
    await db.update(appUsers).set({ active: 0 }).where(eq(appUsers.id, member));
    await expect(getHomeMode(ctx)).rejects.toMatchObject({ status: 403 });
    await expect(setHomeMode(ctx, { mode: "portal" })).rejects.toMatchObject({
      status: 403,
    });
  });
});
