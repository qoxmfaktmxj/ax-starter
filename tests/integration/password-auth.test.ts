import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auth } from "../../packages/server/auth/auth";
import { user } from "../../packages/server/auth/auth-schema";
import { resolveRequestContext } from "../../packages/server/auth/context";
import { db } from "../../packages/server/db";

const PASSWORD_ADMIN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PASSWORD_MANAGER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function fixturePassword() {
  const value = process.env.LOCAL_FIXTURE_PASSWORD;
  if (!value) throw new Error("LOCAL_FIXTURE_PASSWORD is required");
  return value;
}

async function signIn(username: string, password: string) {
  return auth.api.signInUsername({
    body: { username, password },
    headers: new Headers(),
    asResponse: true,
  });
}

function sessionHeaders(response: Response) {
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}

describe("password sign-in", () => {
  it("maps hr-admin to the local-password business account", async () => {
    const response = await signIn("hr-admin", fixturePassword());
    expect(response.status).toBe(200);
    const ctx = await resolveRequestContext(sessionHeaders(response));
    expect(ctx.principal.actorId).toBe(PASSWORD_ADMIN_ID);
    expect(ctx.dataScope).toBe("ALL");
  });

  it("maps org-manager to the ORG scoped business account", async () => {
    const response = await signIn("org-manager", fixturePassword());
    expect(response.status).toBe(200);
    const ctx = await resolveRequestContext(sessionHeaders(response));
    expect(ctx.principal.actorId).toBe(PASSWORD_MANAGER_ID);
    expect(ctx.dataScope).toBe("ORG");
  });

  it("rejects a wrong password and an unknown username with 401", async () => {
    expect((await signIn("hr-admin", "wrong-password-0000")).status).toBe(401);
    expect((await signIn("no-such-user", "wrong-password-0000")).status).toBe(
      401,
    );
  });

  it("lets inactive-user authenticate but refuses business access", async () => {
    const response = await signIn("inactive-user", fixturePassword());
    expect(response.status).toBe(200);
    await expect(
      resolveRequestContext(sessionHeaders(response)),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("does not allow public sign-up", async () => {
    const email = "integration-signup@example.invalid";
    const response = await auth.api.signUpEmail({
      body: {
        email,
        password: "integration-signup-pass",
        name: "signup",
        username: "integration-signup",
      },
      headers: new Headers(),
      asResponse: true,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    const created = await db.select().from(user).where(eq(user.email, email));
    expect(created).toHaveLength(0);
  });
});
