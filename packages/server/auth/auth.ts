import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { genericOAuth, username } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "../db";
import * as authSchema from "./auth-schema";

const appOrigin = process.env.APP_ORIGIN ?? "http://host.docker.internal:3000";
const issuer =
  process.env.OIDC_ISSUER ?? "http://host.docker.internal:8090/default";

if (
  process.env.NODE_ENV === "production" &&
  process.env.APP_PROFILE !== "local" &&
  process.env.APP_PROFILE !== "test"
) {
  throw new Error("OIDC fixture is only available in local or test profiles");
}

export const auth = betterAuth({
  baseURL: appOrigin,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [appOrigin],
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/social": { window: 60, max: 30 },
      "/sign-in/username": { window: 60, max: 30 },
    },
  },
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  session: { cookieCache: { enabled: false } },
  // 테스트 계정은 seed만 만든다. 공개 가입 엔드포인트는 막는다.
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "local-oidc",
          discoveryUrl: `${issuer}/.well-known/openid-configuration`,
          clientId: process.env.OIDC_CLIENT_ID ?? "ax-starter",
          clientSecret: process.env.OIDC_CLIENT_SECRET ?? "local-secret",
          scopes: ["openid", "profile", "email"],
          pkce: true,
          mapProfileToUser: (profile) => {
            const subject = String(profile.sub ?? "");
            if (!subject) throw new Error("OIDC subject missing");
            return {
              email: `fixture-${createHash("sha256").update(subject).digest("hex").slice(0, 24)}@example.invalid`,
              name: subject,
              emailVerified: false,
            };
          },
        },
      ],
    }),
    // 기본 검사기는 하이픈을 막는다. hr-admin 같은 아이디를 허용한다.
    username({
      usernameValidator: (value) => /^[a-z0-9._-]{3,30}$/.test(value),
    }),
  ],
});
