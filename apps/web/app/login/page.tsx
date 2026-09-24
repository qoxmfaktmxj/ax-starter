"use client";

import { useState } from "react";
import { BRAND_NAME } from "../../../../packages/core/brand";
import "./login.css";
import { authClient } from "../../auth-client";

export default function LoginPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function loginWithFixture() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider: "local-oidc",
        callbackURL: "/employees",
      });
      if (result.error)
        setError(
          "테스트 계정 로그인을 시작하지 못했습니다. 다시 시도해 주세요.",
        );
    } catch {
      setError(
        "테스트 계정 로그인에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="loginPage">
      <section className="loginIntro" aria-labelledby="loginTitle">
        <p className="loginEyebrow">사내 업무 시스템 시작점</p>
        <h1 id="loginTitle">{BRAND_NAME}</h1>
        <p className="loginDescription">
          현업의 요청을 검증 가능한 업무 시스템으로 연결합니다.
        </p>
      </section>

      <section className="loginPanel" aria-labelledby="loginActionTitle">
        <p className="loginEyebrow">EMPLOYEE WORKSPACE</p>
        <h2 id="loginActionTitle">업무 공간에 들어가기</h2>
        <p className="loginCopy">
          테스트 계정으로 로그인해 사원관리 흐름을 확인할 수 있습니다.
        </p>
        <button
          className="loginButton"
          type="button"
          onClick={loginWithFixture}
          disabled={pending}
        >
          {pending ? "로그인 연결 중..." : "테스트 계정으로 로그인"}
        </button>
        <p className="loginNotice">
          로컬 개발용 OIDC 테스트 계정입니다. 실제 사내 인증이나 운영 계정과
          연결되지 않습니다.
        </p>
        <p className="loginStatus" role="status" aria-live="polite">
          {error}
        </p>
      </section>
    </main>
  );
}
