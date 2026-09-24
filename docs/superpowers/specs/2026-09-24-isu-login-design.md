# ISU 로그인 화면 설계

기준일: 2026-09-24. 상태: 사용자와 브레인스토밍으로 섹션별 승인을 마쳤다. 구현 계획은 이 문서를 기준으로 작성한다.

## 1. 목표와 범위

`apps/web/app/login`의 로그인 화면을 ISU 브랜드의 3D 로그인 화면으로 교체한다. 랜딩 `landing-minseok91`의 이글루 장면을 가져와 얼음 블록으로 ISU 글자를 쌓는다.

| 포함 | 제외 |
| --- | --- |
| 얼음 블록 ISU 3D 장면과 연출 | 테마 시스템 전체 (11절, 이 작업 다음 최우선) |
| 아이디/비밀번호 로그인 (Better Auth) | 비밀번호 찾기, 로그인 상태 유지 |
| 기존 OIDC를 작은 "SSO로 로그인"으로 유지 | SSO 계정과 비밀번호 계정을 한 사람으로 묶는 연결 테이블 |
| 앱 전체 스크롤바 스타일과 역할 토큰 | 실제 회사 IdP 연결 |

## 2. 확정 결정

| 항목 | 결정 |
| --- | --- |
| 콘셉트 | 얼음 블록으로 ISU 글자를 쌓는다. i의 점은 연두 발광 블록이다 |
| 슬로건 | 3D ISU 아래에 실제 텍스트로 둔다. 등장 때 Challenge the Future, 로그인 성공 때 Share the Future가 나타난다 |
| 배치 | 화면 전체 3D, 오른쪽에 떠 있는 로그인 패널 |
| 패널 | 서리 유리 패널, 불투명도 86% (가장 어두운 배경에서 보조 글자 4.5:1을 맞춘 값) |
| 장면 밝기 | 해 질 녘 블루아워 |
| 3D 구현 | 랜딩 `arctic-scene.ts`를 가져와 이글루 부분만 ISU 블록으로 바꾼다 |
| 로그인 | 아이디/비밀번호 폼과 그 아래 작은 "SSO로 로그인" |
| 스크롤바 | C안. 브랜드 대표 색 막대와 가는 레일, 앱 전체 적용. 색은 역할 토큰으로 연결해 지금은 코발트, ISU 테마 적용 후 ISU 파랑 |
| 코드와 자산 | landing-minseok91과 vibe-hr은 사용자 소유다. 코드, 이미지, 3D 장면, 로고를 가져와 쓴다 |

ISU 색은 `Downloads/logo.jpg`, `Downloads/introduction_logo.jpg`에서 샘플링한 값이다. 연두 #A0C840, 파랑 #0090D0. 공식 브랜드 가이드 값을 받으면 토큰 값만 교체한다.

## 3. 화면 구성

### 데스크톱

- 3D 캔버스가 화면 전체를 채운다.
- 왼쪽 약 40% 영역에 얼음 블록 ISU가 서 있고, 그 아래에 슬로건 두 줄이 있다.
- 오른쪽에 서리 유리 패널을 세로 가운데에 둔다. 위에서부터 순서는 다음과 같다.
  1. "ISU 업무 시스템" 보조 제목
  2. 제목 "로그인"
  3. 아이디 입력
  4. 비밀번호 입력
  5. 로그인 버튼
  6. "SSO로 로그인" 작은 버튼
  7. "로컬 테스트 계정 전용입니다." 안내
  8. 오류 상태 영역

### 모바일 (폭 768px 미만)

위쪽 약 40%에 ISU와 슬로건, 아래에 패널을 전체 폭으로 둔다. 390x844에서 세로 스크롤 없이 한 화면에 들어가는 것을 목표로 한다. 작은 화면에서 스크롤이 생기면 7절 스크롤바를 쓴다.

### 색과 토큰

로그인 전용 색도 앱 CSS에 직접 쓰지 않는다. `packages/ui/tokens/index.css`에 원색을, `packages/ui/semantic.css`에 역할을 추가하고 `login.css`는 역할 토큰만 쓴다.

| 원색 토큰 | 값 | 역할 토큰과 용도 |
| --- | --- | --- |
| `--brand-isu-lime` | #A0C840 | `--color-login-slogan-challenge`, i 점 블록 |
| `--brand-isu-sky` | #33A9E6 | `--color-login-slogan-share`. 원래 #0090D0은 어두운 하늘에서 대비가 3:1 경계라 밝은 톤을 쓴다 |
| `--brand-isu-blue` | #0090D0 | 3D 블록 색조 기준 |
| `--brand-isu-blue-strong` | #0077B6 | `--color-login-action`. 흰 글자 대비 4.87:1 |

서리 유리 패널은 `--color-login-panel`(`rgb(244 248 252 / 86%)`), `backdrop-filter: blur(16px) saturate(1.2)`, 1px 밝은 테두리, `--radius-panel`을 쓴다. 패널 위 본문 글자는 4.5:1, 슬로건은 큰 글자 기준 3:1 이상이어야 한다.

- 가장 어두운 하늘(#131C2B) 위에서 패널의 실효 배경은 약 #D4D9DE다. 보조 글자는 `--color-text-on-subtle`(#475569, 5.4:1)을 쓰고 `--color-text-muted`(#64748B, 3.4:1)는 쓰지 않는다.
- 오류 문구는 흰 바탕 상자 안에 둔다. `--color-danger`는 흰 바탕에서만 4.5:1을 넘는다.
- 하늘 색은 `--brand-isu-night` #131C2B, `--brand-isu-dusk` #4A5D7A, 버튼 hover는 `--brand-isu-blue-deep` #005F92다.

## 4. 연출

| 순간 | 동작 |
| --- | --- |
| 진입 | 패널과 입력은 3D와 무관하게 즉시 표시되고 입력할 수 있다. 3D는 윤곽선에서 재질이 위에서 아래로 드러난다. PC 2.6초, 터치 기기 1.8초. 끝날 때 Challenge 줄이 나타난다 |
| 대기 | 위쪽 블록의 조용한 자동 움직임, 눈 입자, 포인터 근처 블록의 벌어짐과 이음새 빛 |
| 입력 중 | 아이디나 비밀번호 입력에 포커스가 있으면 자동 움직임과 포인터 반응을 약하게 한다 |
| 실패 | 패널 안 오류 문구, 블록 0.3초 떨림 |
| 성공 | i 점의 연두 빛이 이음새를 따라 전체 블록으로 퍼지고 Share 줄이 나타난다. 약 1.2초 뒤 `/employees`로 이동한다 |
| 모션 감소, WebGL 오류 | 우리 장면에서 캡처한 정지 이미지를 보여준다. 모션 감소 설정이면 WebGL을 시작하지 않는다. 슬로건 두 줄을 처음부터 보이고 성공 시 바로 이동한다 |

장면 모듈은 폼과 연결되는 동작 세 개를 제공한다. `calm(on: boolean)`, `shake()`, `share(): Promise<void>`. `share`는 모션 감소나 장면 실패 상태에서 즉시 끝난다. 로그인 성공 후 이동은 `share` 완료 또는 1.2초 중 먼저 오는 쪽에서 시작한다.

## 5. 3D 장면 구조

### 파일

| 파일 | 내용 |
| --- | --- |
| `apps/web/app/login/isu-scene.ts` | 랜딩 `src/components/portfolio/arctic-scene.ts` 이식 후 수정 |
| `apps/web/app/login/isu-landscape.ts` | 랜딩 `arctic-landscape.ts` 이식 |
| `apps/web/app/login/LoginScene.tsx` | 랜딩 `HeroScene.tsx` 이식. 지연 import, 모션 감소, 탭 숨김, WebGL 컨텍스트 복구와 실패 처리를 유지하고 IntersectionObserver는 제거한다 |
| `scripts/capture-login-still.ts` | 랜딩 `capture-arctic-loading.mjs`를 바탕으로 정지 이미지 두 장을 만든다. sharp 대신 브라우저 canvas로 WebP를 만든다 |

### arctic-scene.ts에서 바꾸는 부분

- 유지: 지형, 먼 산, 눈 입자, 안개, 서리 재질, 윤곽선 등장 셰이더, 포인터 반응, 자동 움직임, bloom, dispose.
- 제거: 이글루 돔 블록, 입구, 터널, 내부 빛과 발광 돔, 생성 이미지 `surface-plate-six.webp`, `terrain-light-ridges.webp`와 투영 코드(`photoIce`, `plateCamera`, `arctic-terrain-projection.ts`).
- 추가: ISU 블록 배치 함수, 블루아워 조명(어두운 남색 배경과 안개, 약한 차가운 방향광, 블록 안쪽의 은은한 발광), `calm`, `shake`, `share`.

### ISU 블록 배치

글자는 눈 위에 선 벽이며 블록 두께는 이글루 블록과 같다.

- i: 둥근 직육면체 5단 기둥, 간격을 두고 위에 연두 발광 큐브 1개.
- S: 위아래 반원을 이글루 입구 아치 방식의 쐐기 블록으로 만든다. 위 반원은 오른쪽, 아래 반원은 왼쪽이 열린다.
- U: 양쪽 기둥은 쌓은 블록, 바닥은 쐐기 블록 반원.
- 전체 30~40개(i 6, S 14, U 11 기준). 글자 비율은 logo.jpg를 참고한다. 판정 기준은 기본 카메라 캡처에서 ISU로 읽히는 것이다.
- 카메라: 정면에서 살짝 왼쪽, 약간 아래에서 올려다보는 각도. 포인터 회전 폭을 이글루보다 줄여 글자가 항상 읽히게 한다.
- 지형: 가운데 평평한 영역을 글자 폭만큼 넓힌다.

### 자산, 의존성, 성능

- 텍스처: 랜딩 `public/images/arctic`의 Poly Haven CC0 텍스처 5종과 모바일 축소본을 `apps/web/public/images/login/`으로 복사한다. 데스크톱 약 8MB, 모바일 약 1.5MB. `provenance.json`의 해당 항목을 함께 옮긴다.
- 정지 이미지: `login-still-desktop.webp`, `login-still-mobile.webp`. 우리 장면에서 캡처한다.
- 의존성: `three`, `@types/three`를 정확한 버전으로 추가하고 `docs/DEPENDENCIES.md`에 이름, 버전, 라이선스(MIT), 이유를 기록한다.
- 로딩: 3D 모듈은 동적 import로 폼 코드 다음에 받는다. 텍스처는 비동기로 받는다.
- 품질 설정: 랜딩과 같다. PC는 픽셀 비율 최대 1.5, 그림자 2048px, MSAA 최대 2. 터치 기기는 1.25, 1024px.

## 6. 인증

### 서버와 클라이언트

- `packages/server/auth/auth.ts`: `emailAndPassword: { enabled: true, disableSignUp: true }`와 `username()` 플러그인(`better-auth/plugins/username`)을 추가한다. 기존 `genericOAuth` 설정은 그대로 둔다.
- `apps/web/auth-client.ts`: `usernameClient()`를 추가한다. 폼은 `authClient.signIn.username({ username, password })`를 호출한다.
- `packages/server/auth/auth-schema.ts`: `user`에 `username`(unique), `display_username`을 추가한다. 마이그레이션 `0002`를 만든다.

### 테스트 계정

- seed가 `hr-admin`, `org-manager`, `inactive-user` 세 비밀번호 계정을 만든다. Better Auth `user`의 email은 `<아이디>@password.example.invalid`, `account`는 `providerId: "credential"`이다.
- 비밀번호는 `better-auth/crypto`의 `hashPassword`로 해시해 넣는다. 값은 환경변수 `LOCAL_FIXTURE_PASSWORD`에서 읽고, 없으면 seed가 실패한다. `compose.yaml`에 로컬 전용 값을 두고 README에 적는다.
- seed가 `app_users`에 `issuer: "local-password"`, `subject: <아이디>` 세 행을 기존 OIDC 행과 같은 역할, 조직, 범위로 추가한다.

### 업무 계정 연결

`packages/server/auth/context.ts`의 `resolveRequestContext`가 세션 사용자의 account를 찾는 방식을 바꾼다.

- `local-oidc` account: 지금처럼 (`OIDC_ISSUER`, `accountId`)로 `app_users`를 찾는다.
- `credential` account: (`local-password`, `user.username`)로 `app_users`를 찾는다.
- 둘 다 없거나 `app_users`가 없으면 지금처럼 403 "업무 계정이 없습니다".

SSO로 들어온 `hr-admin`과 비밀번호로 들어온 `hr-admin`은 서로 다른 업무 계정이며 감사 기록도 분리된다.

### 보안

- 로그인 시도 제한: `customRules`에 `"/sign-in/username": { window: 60, max: 30 }`을 추가한다. e2e가 한 컨테이너 IP에서 연속 로그인해 429가 났던 기록(PROGRESS)에 따라 기존 `/sign-in/social` 규칙과 같은 값을 쓴다.
- 아이디 형식: 기본 검사기는 하이픈을 막으므로 `username({ usernameValidator })`로 영문 소문자, 숫자, `.`, `_`, `-` 3~30자를 허용한다.
- 오류 문구: 아이디 오류와 비밀번호 오류 모두 "아이디 또는 비밀번호가 올바르지 않습니다." 429는 "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요."
- 공개 가입 차단: `disableSignUp`으로 가입 엔드포인트를 막는다.
- 운영 차단: `auth.ts`의 local/test 외 운영 차단 규칙을 유지한다. 테스트 비밀번호는 local, test 프로필에서만 동작한다.
- 폼: `<form>`, 연결된 `<label>`, `autocomplete="username"`, `autocomplete="current-password"`, Enter 제출, 처리 중 버튼 비활성, 오류는 `role="alert"`. 비밀번호는 POST 본문으로만 보내고 로그에 남기지 않는다.
- 비활성 계정: 인증은 되지만 업무 화면에서 "업무 계정에 접근할 수 없습니다."를 보인다. 기존 OIDC 동작과 같다.

### SSO 버튼

기존 `authClient.signIn.social({ provider: "local-oidc", callbackURL: "/employees" })`를 유지하고 이름을 "SSO로 로그인"으로 바꾼다.

## 7. 앱 전체 스크롤바

### 모양 (C안)

- 막대 영역 폭 12px. 가운데 2px 레일(`--color-scrollbar-track`).
- 막대는 투명 테두리 4px와 `background-clip: padding-box`로 보이는 폭 4px, 둥근 끝.
- 스크롤 영역에 마우스를 올리면 막대 색이 진해지고, 막대에 올리거나 잡으면 테두리 2px로 보이는 폭 8px가 된다.
- 가로 스크롤도 같은 규칙이다(높이 12px).

### 토큰

`packages/ui/semantic.css`에 역할 토큰을 추가하고 브랜드 대표 색(`--color-action`)에 연결한다. 테마가 바뀌면 막대 색이 자동으로 따라간다.

| 역할 토큰 | 연결 |
| --- | --- |
| `--color-scrollbar-thumb` | `color-mix(in srgb, var(--color-action) 55%, transparent)` |
| `--color-scrollbar-thumb-hover` | `color-mix(in srgb, var(--color-action) 80%, transparent)` |
| `--color-scrollbar-thumb-active` | `var(--color-action-hover)` |
| `--color-scrollbar-track` | `var(--color-border)` |

현재 브랜드 대표 색은 코발트 #3C6DEE이므로 이번 작업 후 막대는 코발트로 보인다. ISU 테마(11절)가 들어오면 ISU 파랑이 된다. 로그인 화면은 어두운 장면에 맞게 루트에서 `--color-scrollbar-track`만 재정의한다.

### 적용 방식

- `packages/ui/base.css`에 전역으로 둔다. AG Grid 스크롤 영역도 같은 규칙을 받는다.
- Chrome, Edge, Safari: `::-webkit-scrollbar`, `-track`, `-thumb`, `-corner`.
- Firefox: `@supports not selector(::-webkit-scrollbar)` 안에서만 `scrollbar-width: thin`, `scrollbar-color`를 지정한다. Chrome은 표준 속성이 지정되면 webkit 꾸밈을 무시하므로 표준 속성을 Chrome에 적용하지 않는다.

## 8. 변경 파일 요약

| 구분 | 파일 |
| --- | --- |
| 새 파일 | `apps/web/app/login/isu-layout.ts`, `login-motion.ts`, `isu-scene.ts`, `isu-landscape.ts`, `LoginScene.tsx`, `apps/web/public/images/login/*`, `scripts/capture-login-still.ts`, `packages/server/db/migrations/0002_*.sql`, `tests/unit/isu-layout.test.ts`, `tests/unit/login-motion.test.ts`, `tests/integration/password-auth.test.ts`, `tests/e2e/login.ts`, `tests/e2e/password-login.spec.ts`, `tests/e2e/login-layout.spec.ts`, `tests/e2e/login-scene.spec.ts`, `tests/e2e/scrollbar.spec.ts` |
| 수정 | `apps/web/app/login/page.tsx`, `login.css`, `apps/web/auth-client.ts`, `packages/server/auth/auth.ts`, `auth-schema.ts`, `context.ts`, `scripts/seed.ts`, `compose.yaml`, `packages/ui/tokens/index.css`, `semantic.css`, `base.css`, `package.json`, `pnpm-lock.yaml`, `tests/e2e/auth-and-workspace.spec.ts`, `tests/e2e/batch-save.spec.ts`, `.gitignore` |
| 문서 | `README.md`, `docs/DESIGN_BRIEF.md`, `docs/DEPENDENCIES.md`, `docs/PROGRESS.md` |

## 9. 테스트와 검증

### 기존 e2e 수정

`auth-and-workspace.spec.ts`와 `batch-save.spec.ts`의 버튼 이름을 "테스트 계정으로 로그인"에서 "SSO로 로그인"으로 바꾼다. 나머지 OIDC 흐름은 그대로 통과해야 한다.

### 새 e2e: password-login.spec.ts

| 경우 | 기대 결과 |
| --- | --- |
| hr-admin | `/employees`, 전체 24건, 월급 열 표시 |
| org-manager | 전체 12건, 월급 열 없음 |
| 틀린 비밀번호, 없는 아이디 | 같은 오류 문구, `/login` 유지, `/api/me` 401 |
| inactive-user | 로그인 후 "업무 계정에 접근할 수 없습니다." |
| 가입 차단 | `POST /api/auth/sign-up/email` 실패, 계정 미생성 |
| 키보드 | Tab 순서 아이디, 비밀번호, 로그인, SSO. Enter 제출 |

### 새 e2e: login-scene.spec.ts

| 경우 | 기대 결과 |
| --- | --- |
| 텍스처 응답 지연 | 3D 준비 전에도 입력과 로그인 가능 |
| WebGL 강제 실패 | 정지 이미지 표시, 폼 정상 |
| `prefers-reduced-motion` | 정지 이미지, 슬로건 두 줄 표시 |
| 정상 | 캔버스 `data-ready="true"`, `data-intro="complete"` |
| 1366x768, 1440x900, 390x844 | 가로 overflow 없음 |
| 스크롤바 | Chromium에서 Grid 세로 스크롤 영역의 `offsetWidth - clientWidth - 좌우 테두리 폭`이 12px |

"정상" 경우는 테스트 브라우저의 소프트웨어 WebGL에 의존한다. 컨테이너에서 WebGL이 동작하지 않으면 오류와 함께 PROGRESS에 기록하고 통과로 표시하지 않는다.

### 눈으로 하는 확인

- 1440x900, 1366x768(P0), 390x844(P1) 캡처.
- 대비 측정: 슬로건 3:1 이상, 서리 패널 위 글자 4.5:1 이상. 뒤 배경이 가장 밝은 위치 기준.
- 성능: 한 번 측정한 프레임 시간과 텍스처 용량을 PROGRESS에 기록한다. 랜딩 성능 측정 스크립트는 가져오지 않는다.

### 완료 조건

`pnpm check`, `pnpm test`, `pnpm test:integration`, `pnpm e2e`, `pnpm build`가 모두 통과한다.

## 10. 문서 갱신

- `README.md`: 테스트 계정 세 개, `LOCAL_FIXTURE_PASSWORD`, SSO 로그인 방법.
- `docs/DESIGN_BRIEF.md`: 로그인 절을 이 문서 기준으로 갱신한다.
- `docs/DEPENDENCIES.md`: three, @types/three.
- `apps/web/public/images/login/provenance.json`: 텍스처 출처와 체크섬.
- `docs/PROGRESS.md`: 변경 파일, 실제 검사 결과, 미검증 항목.

## 11. 다음 작업: 테마 시스템 (최우선)

사용자 결정(2026-09-24): 이 로그인 작업이 끝나면 **테마 시스템 전체를 최우선으로 별도 설계하고 진행한다.**

- 범위: 여러 테마(기본 코발트, ISU), 테마 전환 화면, 다크 모드.
- 이 작업이 남기는 연결점: 원색과 역할 토큰 2단계 구조, 스크롤바 역할 토큰, 로그인 역할 토큰.
- 그 설계에서 정할 것: 테마를 고르는 주체(고객별 실행 설정 또는 사용자별 선택)와 저장 위치, 다크 모드에서 AG Grid와 상태색 대비, 테마별 3D 로그인 장면 조명.
- 그 설계를 시작할 때 `PRODUCT.md`와 `docs/DESIGN_BRIEF.md`의 여러 팔레트, Dark Mode 관련 문장을 결정에 맞게 고친다.

## 12. 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 컨테이너 e2e에서 WebGL 미동작 | 폼과 대체 화면 검사는 WebGL 없이 통과해야 한다. 정상 3D 검사는 결과를 그대로 기록한다 |
| 로그인 화면 텍스처 약 8MB | 폼 먼저 표시, 텍스처 비동기, 모바일 축소본 |
| AG Grid 버전 변경으로 스크롤 영역 구조 변경 | 전역 규칙을 쓰고 스크롤바 e2e로 확인한다 |
| ISU 색이 JPG 샘플 값 | 공식 값을 받으면 원색 토큰만 교체한다 |
| 로그인 화면이 실제 사내 인증처럼 보임 | "로컬 테스트 계정 전용입니다." 안내를 패널 안에 항상 둔다 |
