"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../auth-client";
import LoginScene, { type LoginSceneHandle } from "./LoginScene";
import "./login.css";

const INVALID_CREDENTIALS = "아이디 또는 비밀번호가 올바르지 않습니다.";
const TOO_MANY_ATTEMPTS = "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.";
const UNREACHABLE =
  "로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const SHARE_WAIT_MS = 1200;

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState<"password" | "sso" | null>(null);
  const [error, setError] = useState("");
  const [shared, setShared] = useState(false);
  const scene = useRef<LoginSceneHandle>(null);

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("password");
    setError("");
    try {
      const result = await authClient.signIn.username({
        username: String(form.get("username") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      if (result.error) {
        setError(
          result.error.status === 429 ? TOO_MANY_ATTEMPTS : INVALID_CREDENTIALS,
        );
        setPending(null);
        scene.current?.shake();
        return;
      }
      setShared(true);
      // 연두 빛이 퍼지는 동안 기다리되 1.2초를 넘기지 않는다.
      await Promise.race([
        scene.current?.share() ?? Promise.resolve(),
        new Promise((resolve) => window.setTimeout(resolve, SHARE_WAIT_MS)),
      ]);
      router.push("/employees");
    } catch {
      setError(UNREACHABLE);
      setPending(null);
    }
  }

  async function signInWithSso() {
    setPending("sso");
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider: "local-oidc",
        callbackURL: "/employees",
      });
      if (result.error)
        setError("SSO 로그인을 시작하지 못했습니다. 다시 시도해 주세요.");
    } catch {
      setError("SSO 로그인에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="loginPage" data-shared={shared}>
      <LoginScene ref={scene} />
      <section className="loginBrand" aria-label="ISU 슬로건">
        <p className="loginSlogan">
          <span className="loginSloganChallenge">Challenge the Future</span>
          <span className="loginSloganShare">Share the Future</span>
        </p>
      </section>
      <section className="loginPanel" aria-labelledby="loginTitle">
        <p className="loginEyebrow">ISU 업무 시스템</p>
        <h1 id="loginTitle">로그인</h1>
        <form
          className="loginForm"
          onSubmit={signInWithPassword}
          onFocus={() => scene.current?.calm(true)}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              scene.current?.calm(false);
          }}
        >
          <label className="loginField">
            <span>아이디</span>
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </label>
          <label className="loginField">
            <span>비밀번호</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button
            className="loginButton"
            type="submit"
            disabled={pending !== null}
          >
            {pending === "password" ? "로그인 중..." : "로그인"}
          </button>
        </form>
        <button
          className="loginSso"
          type="button"
          onClick={signInWithSso}
          disabled={pending !== null}
        >
          {pending === "sso" ? "SSO 연결 중..." : "SSO로 로그인"}
        </button>
        <p className="loginNotice">
          로컬 테스트 계정 전용입니다. 실제 사내 인증과 연결되지 않습니다.
        </p>
        {error ? (
          <p className="loginError" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
