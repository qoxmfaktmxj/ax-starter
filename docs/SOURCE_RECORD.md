# 원본과 결정 추적 기록

기준일: 2026-09-24. 이 문서는 삭제 예정 원본의 판단 근거를 보존한다. 제품 동작은 PRODUCT, MVP_PLAN, DESIGN_BRIEF, CODING_HANDOFF에 명시되어 있으므로 원본 파일이 없어도 구현할 수 있다. 원본 경로/줄번호는 유래를 설명하는 증거이며 실행 의존성이 아니다.

## 1. 원본 우선순위와 무결성

`kickoff` 6행은 'v4 이후 3차 리뷰 반영분'이며 충돌 시 우선한다고 명시한다. 따라서 kickoff > v4이며, 나머지 두 이전 검토문서는 배경 자료다. 이전 문서의 대안 검토를 현재 결정으로 되살리지 않는다. 최신 사용자 확인인 로컬 가상 데이터 MVP와 디자인 선택은 이번 계획에 반영했다.

| 원본 파일 | SHA-256 |
| --- | --- |
| enterprise_ai_starter_kickoff_20260924.md | 5202CFE7956C34DA3236EFAEB877066B5A2DF2F2B6F6F98428C38CD7FA15F111 |
| enterprise_ai_starter_confirmed_v4_review_request_20260924.md | E1DA150F73126BA77A56EBCB2634911FA14E50D7F3ED448B7DE2F806B094AF09 |
| enterprise_ai_starter_rereview_prompt_20260924.md | 3182A65C3CED640EDF52131044EC29EF9FE7BB26CC708E989FC340AA15E39940 |
| enterprise_ai_starter_commercial_review_v2_20260924.md | 57AE7D258F693400203D72B221222B82ED09A153A14EEF96767740AB410C578E |

PowerShell Get-FileHash 결과다. 문서 작성자는 이 원본을 수정하거나 삭제하지 않았다.

## 2. 결정 계보

| ID | 최종 규칙 | 원본 근거 | 이번 계획의 보존 위치 |
| --- | --- | --- | --- |
| R01 | 전체 플랫폼보다 사원관리 Reference와 재사용 계약 우선 | kickoff 10~14 | PRODUCT, MVP 1 |
| R02 | Next 모놀리스 + TS Worker, Python은 실제 필요 시 | v4 48~53, kickoff 72 | MVP 3 |
| R03 | ExecutionContext/TransactionalContext 분리, 서버만 문맥 생성 | kickoff 90~116 | MVP 4.2 |
| R04 | read/write/export 필드 권한과 공통 정책 투영 | kickoff 97~117 | MVP 4.2/7 |
| R05 | TS7 + 도구용 TS6, TS5 유지안 대체 | kickoff 74, v4 63 | 아래 버전 표, T0 |
| R06 | 수정 가능 테이블만 row_version | kickoff 122 | MVP 4 |
| R07 | decimal.js, Decimal.clone, 시행일/버전별 끝수 정책 | kickoff 123~139 | MVP 4.4, 아래 계약 |
| R08 | AbortSignal, 삭제 멱등, 면제 근거, 늦은 검사/삭제 경합 | kickoff 141~158 | MVP 6 |
| R09 | batch requestId, clientRowId/idMap, versions, 전체 성공/실패 | kickoff 160~196 | MVP 4.3 |
| R10 | 실제 대표 PDF, buffer 한계/페이지/시간 제한 | kickoff 198~203, 319~340 | MVP 7 |
| R11 | Blue/Lime는 가설, 실제 레퍼런스에서 디자인 추출 | kickoff 207~252 | DESIGN_BRIEF |
| R12 | Service 인가, Job 실행/다운로드 현재 권한, 감사 별도 경로 | v4 80~129, kickoff 287~294 | MVP 4/7 |
| R13 | FileStorage fs/S3, mount/metadata/백업 경계 | v4 131~155 | MVP 6, 아래 운영 정책 |
| R14 | browse와 batch-edit, AG 전용 타입 차단 | v4 157~189, kickoff 311~317 | MVP 5 |
| R15 | runtime 설정, 의미 코드, 고객별 배포, 오프라인 납품 | v4 212~223 | PRODUCT, 아래 판매 정책 |
| R16 | source + image + 전체 납품물 심사 | v4 225~239 | 아래 라이선스 정책 |
| R17 | 외부 LLM off, telemetry/폰트 포함 전송 목록 | v4 241~251, kickoff 82 | PRODUCT, MVP 11 |
| R18 | 로컬 복구 절차, 실제 NAS 검증은 운영 전 | kickoff 338 | MVP 9 |
| R19 | 실제 Reference 뒤 Skill, 교육 신청으로 재사용 검증 | kickoff 342~348 | MVP 12, PRODUCT 후속 |
| R20 | Keycloak/Valkey/관측 스택/외부 AI/대규모 upload 등 제외 | kickoff 352~358 | PRODUCT 제외 목록 |
| R21 | Vibe HR은 권리 정리 전 화면/동작 참고만. 2026-09-24 사용자가 vibe-hr, landing-minseok91 소유자임을 확인해 해제 | kickoff 57~62, 362~370 | 모든 인계 문서 |
| R22 | 각 Phase/보호 변경 승인, 한국어와 금지 기호 규칙 | kickoff 18~53 | CODING_HANDOFF 4, PRODUCT |

이전 자료의 역할: commercial_v2 59~75/185~221행은 재배포 범위와 라이선스 검토, rereview 90~94/118~127행은 저장소/선결 조건의 배경이다. 상용 컴포넌트 종속 해소와 판매 가능성은 유지하지만 판매 출시 작업을 오늘 MVP에 합치지 않는다.

## 3. 오늘 범위로 좁히면서 달라진 점

| 원래 착수 범위 | 오늘 결정/이유 | 후속 완료 조건 |
| --- | --- | --- |
| S3 최소 구현 + 공통 계약 테스트 | FileStorage와 fs 실제 구현, S3 계약 문서만 필수. 계정/서버 선택 추가를 오늘 경로에서 제외 | S3 adapter와 실제 endpoint 계약 테스트 |
| DataScope 5종 | ALL/ORG/SELF 구현, ORG_TREE/CUSTOM은 fail-closed | 조직 이력/사용자 정의 범위 확정 및 권한 테스트 |
| 조직 유효기간/공통코드/메뉴/역할 전체 schema | 정적 seed 조직/역할과 실제 사원 흐름만 | 이력 업무 키/겸직 정책, 의미 코드 매핑, 관리 요구 정의 |
| 모든 품질 도구와 fault test | P0 검사 + P1 명시. Testcontainers 대신 전용 Compose PostgreSQL | P1 목록 및 운영 전 검증 |
| A/B 시안 두 개와 사용자 선택 | 실제 저장소 확인 후 사용자가 Vibe HR + 랜딩 타이포 선택 | 구현 screenshot 확인, DESIGN.md 기록 |
| 9개 Skill과 두 번째 모듈 | 실제 경로의 new-module Skill 1개 먼저 | 교육 신청 모듈을 Skill만으로 만들고 동일 기준 검증 |
| DB/NAS 복구 script와 리허설 | 절차는 오늘, script/실제 리허설 P1 | 독립 local volume restore 증거, 이후 실제 NAS |
| ExecutionContext.requestId | 추적명 correlationId로 명확화. batch wire requestId는 유지, 내부 idempotencyKey로 매핑 | DTO/로그 혼용 금지 검사 |

## 4. 공식 자료 확인과 후보 버전

확인일은 모두 2026-09-24다. 확인한 릴리스/기능과 실제 채택 버전을 구분한다. 패키지 설치, peer 호환, Docker image digest, 실제 license 배포물 검사는 아직 하지 않았다. T0에서 exact patch와 조합을 docs/DEPENDENCIES.md 및 lockfile에 기록한다.

| 대상 | 계획 기준/확인 결과 | 공식 근거 |
| --- | --- | --- |
| Node | 24 LTS, host는 별도 22.14.0이므로 container 기준 | [Node 지원 표](https://nodejs.org/en/about/previous-releases) |
| Next | 16.3.6 후보. 문서상 예정인 16.3.7을 출시된 것으로 설치하지 않음 | [Next 공식 릴리스 안내](https://nextjs.org/blog) |
| Drizzle | 0.45.3 / kit 0.31.11 후보, driver는 pg로 검증 | [공식 releases](https://github.com/drizzle-team/drizzle-orm/releases) |
| Drizzle 보안 | 0.45.2 미만 금지, 사용자 식별자 조립도 별도 금지 | [GHSA-gpj5-g38j-94v9](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9) |
| Better Auth | 1.7.3 후보, schema/OIDC는 실제 검증 필요 | [공식 releases](https://github.com/better-auth/better-auth/releases), [계정 schema 변경](https://better-auth.com/blog/1-7-account-schema) |
| TypeScript | 7 CLI + TS API용 6 호환 package 병행 | [공식 TS7 발표와 alias 예제](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) |
| PostgreSQL | 18.x 유지, 공식 release 페이지의 18.6 확인. image는 exact patch/digest 재확인 | [PostgreSQL release notes](https://www.postgresql.org/docs/release/) |
| AG Grid | 공식 문서 36.2.0 후보, Community Client-Side/Infinite 지원 | [Row Models](https://www.ag-grid.com/javascript-data-grid/row-models/) |
| Vibe HR AG Grid | lockfile의 community/react 모두 35.1.0 확인, 패키지 manifest는 ^35.1.0 | 원본 frontend/package-lock.json 5757~5767 |
| Vitest | 5, Node/Vite peer 조합은 T0 검사 | [Vitest 5 공식 발표](https://main.vitest.dev/blog/vitest-5) |
| AI SDK | 7.0.113 release 확인, 오늘 필수 설치 아님 | [공식 releases](https://github.com/vercel/ai/releases) |
| OIDC 연결 | Better Auth Generic OAuth discovery/callback 계약 사용 | [공식 Generic OAuth](https://better-auth.com/docs/plugins/generic-oauth) |
| 로컬 OIDC fixture | navikt/mock-oauth2-server, 프로젝트 MIT, 테스트 전용. 3.1.4 tag를 T0 검증 시작 후보로 사용 | [공식 저장소/Compose/interactive login](https://github.com/navikt/mock-oauth2-server) |
| pg-boss | PostgreSQL 큐 유지, 정확한 버전과 send/worker API는 T0 확인 | [공식 문서](https://pgboss.io/) |
| shadcn | Base UI 선택을 고정, 패키지 생성 결과로 확인 | [공식 설치 문서](https://ui.shadcn.com/docs/installation) |

TS7/6의 공식 병행 방법은 `typescript` 이름을 `@typescript/typescript6` package alias로, 별도 `@typescript/native` 이름을 TypeScript 7 alias로 두는 방식이다. caret 대신 검증한 exact patch를 사용하고 실제 실행되는 tsc/tsc6, Next build, ESLint 경로를 T0에서 확인한다. 호환성을 추측해서 테스트를 끄지 않는다.

AG Grid는 새 코드인 Starter에서 36.2.0 Community를 우선 검증한다. Vibe HR의 35.1.0 코드 이식을 전제로 버전을 낮추지 않는다. 실패하면 실제 API/peer 오류와 대안을 기록한다.

pnpm은 현재 사용 가능한 10.33.0을 우선 검증하고 packageManager로 고정한다. minimumReleaseAge는 1440분을 계획 기본값으로 제안하며 해당 10.x 문법을 확인한다. 긴급 패치는 정확한 버전 예외와 이유/제거 시점을 기록하고 전역 무력화하지 않는다.

## 5. T0 의존성 목록

아래 license는 기대값 또는 원본 정책이다. exact 설치 파일에 대한 검증/승인을 대체하지 않는다. 폰트와 브라우저의 하위 구성요소도 별도로 기록한다.

| 목적 | 후보 | license 확인 상태 |
| --- | --- | --- |
| 앱 | next, react, react-dom, TypeScript alias, pnpm | MIT/Apache-2.0 계열 예상, exact 확인 필요 |
| UI | tailwindcss, shadcn CLI 생성 코드, Base UI 패키지, clsx 등 실제 생성 의존성 | MIT 계열 예상, 실제 도입 목록만 기록 |
| DB/검증 | drizzle-orm, drizzle-kit, pg, zod, decimal.js | Apache-2.0/MIT 예상, exact 확인 필요 |
| 인증/큐/로그 | better-auth, pg-boss, pino | MIT 예상, exact 확인 필요 |
| Grid/출력 | ag-grid-community, ag-grid-react, exceljs, playwright | MIT/Apache-2.0 예상, Chromium/OS 별도 |
| 테스트 | vitest, @playwright/test, PDF 내용 추출 library | exact/전이 license 확인 필요 |
| 코드 검사 | eslint, typescript-eslint, prettier, dependency-cruiser | exact/peer/license 확인 필요 |
| 폰트 | Pretendard, Geist를 정식 upstream에서 취득 | OFL 등 원문/고지/배포 의무 개별 검토 |
| P1 도구 | axe, Knip, MSW, Testcontainers, gitleaks, OSV-Scanner, Trivy, Renovate | 해당 단계에서 필요한 것만 확정 |
| 후속 adapter | AWS SDK v3, AI SDK, OpenTelemetry/Sentry SDK | 실제 사용 단계에서 확정, 외부 exporter 기본 off |

새 의존성을 넣기 전 이름/exact version/license/이유를 기록한다. lockfile의 직접/전이 의존성, 복사 코드 출처와 생성 CLI 버전도 남긴다. 앱 상위 license만으로 이미지 전체를 허용 판정하지 않는다.

## 6. 운영과 판매까지 보존할 계약

### 데이터와 보안

RoundingPolicy는 id, target, effectiveFrom(YYYY-MM-DD), unit(decimal string), mode(HALF_UP/DOWN/UP/HALF_EVEN), negative(SAME/TOWARD_ZERO/AWAY_FROM_ZERO), applyAt(intermediate/final), version을 가진다. 정책 적용 순서와 시행일은 업무별로 검토한다. 유효기간은 valid_from 포함/valid_to 미포함, 중복 금지는 업무 키를 먼저 정한다.

중요 계좌/급여 확정/권한 변경은 재확인과 감사가 필수이고 승인 필요 여부를 업무별로 정한다. 감사 필수 항목 반영과 법적 준수 판정은 구분한다. Cookie cache의 취소 지연, 실제 IdP 비활성화와 앱 세션 차단 전파를 운영 전에 시험한다. system principal은 명시적 작업/범위만 가진다. AGENTS.md 자체를 보안 경계로 보지 않는다.

### 파일과 온프레미스

운영 책임/용량/공동 복구가 확인된 NAS면 fs 기본, 관리형 S3가 표준이면 S3다. backend_id/object_key를 metadata에 보존해 저장소를 바꾼 뒤에도 기존 파일을 읽을 수 있어야 한다. MinIO/AIStor는 프로젝트 기본 선택에서 제외한다.

UUID 불변 키, 경로/symlink 차단, 동일 mount temp/rename, 결과 불명 시 sha256 확인, streaming/backpressure/abort/한도, 시작/쓰기 전 mount marker, 고정 UID/GID non-root를 유지한다. root_squash를 끄지 않고 export 설정/UID를 맞춘다. marker 검사는 실제 NAS 안전성 인증을 대신하지 않는다.

NFS와 SMB는 각각 검증한 조합만 지원한다. 실제 파일을 받기 전 악성코드 검사 또는 보안 담당자의 승인된 대체 통제가 있어야 한다. MIME/시그니처 검증만으로 검사 완료라고 하지 않는다. soft delete/보관 후 삭제/고아 정리, Web/Worker 정지 또는 일관된 복구 시점의 DB+NAS 공동 백업/복원을 검증한다. 복원 시 참조 파일 누락과 삭제 파일 부활을 확인한다.

### Grid와 출력물

래퍼 밖 AG 타입 금지, 조회/편집 모델 구분, 행 상태/일괄 원자성, 제한된 선택 의미를 유지한다. Saved View는 schema version을 저장하며 삭제/권한 회수 컬럼은 제거, 이름 변경은 안정 ID 매핑, 알 수 없는 필터는 폐기하고 사용자에게 알린다. 대규모 조회는 filter-first, whitelist, stable sort, count/offset/timeout/index 한도를 적용한다. 대규모 export는 별도 Job/cursor다.

툴바, 컨텍스트 메뉴, 컬럼 설정, Saved View, 단일 셀 clipboard는 후속 자체 구현 범위다. 다중 셀 영역 붙여넣기/fill/group/pivot은 원래 Starter 제외 범위로 유지한다. 리포트는 versioned data/template/renderer를 분리하고 대표 서식 이후에만 확장한다.

### 판매 구조/라이선스

사내 단일 모노레포에서 시작해 판매 시 플랫폼 package 저장소와 고객 저장소로 분리한다. 고객별 독립 배포가 기본이며 다법인은 별도 검토다. 브랜드/도메인/IdP/조직 sync/file backend/보관/알림은 runtime 설정이다. NEXT_PUBLIC_*에 고객별 설정을 빌드하지 않는다. 의미 코드와 고객 코드 매핑, 공통/고객 migration 책임과 순서, 명시적 확장 지점을 둔다.

오프라인 납품은 이미지, 설치 script가 받는 구성요소, migration, 패키지, 필요한 source, license/notice/복구 자료까지 포함한다. private registry가 고객 복구의 유일한 경로가 되지 않아야 한다.

| 분류 | 규칙 |
| --- | --- |
| 동급 허용 | MIT, Apache-2.0, BSD-2/3-Clause, ISC, PostgreSQL, 0BSD. 기능/품질 동률일 때 MIT 우선 |
| 개별 검토 | LGPL, MPL, GPL, AGPL, OFL, LicenseRef-*의 실제 이용/전달 방식 |
| 내부 기본 거부 | SSPL, BUSL, FSL 서버, 상용 EULA, UNKNOWN. 예외 기록 없는 출고 금지이며 상업 이용의 법적 불가 단정이 아님 |
| 명시 금지 | ag-grid-enterprise, @ag-grid-enterprise/* 직접/전이 의존성, Enterprise 소스/키/워터마크 우회 |

심사는 source/lockfile + 최종 image + 전체 납품물을 합친다. Web/Worker/동봉 이미지, OS/브라우저, 폰트/아이콘/서식, source/복사 코드까지 포함한다. SPDX AND/OR/WITH를 구분하고 선택 조건을 기록한다. 버전/hash/출처/수정 여부/전달 방식/이행 의무를 보존한다. Syft/ScanCode 등의 결과는 최종 판단을 대신하지 않는다. sharp 등의 실제 binary package 의무도 따로 확인한다.

### 패치/외부 전송/관측

월간 patch, 연 1회 major 계획과 별도로 긴급 보안 경로를 둔다. latest 추종 대신 검증 조합을 배포한다. Next/React, Drizzle/kit/driver, Better Auth schema, browser/font는 세트로 검증한다.

개인 AI 구독/OAuth/CLI proxy를 업무 API 경유 수단으로 쓰지 않는다. 실제 사내 LLM을 연결하면 structured output/tool calling/usage 기능을 별도로 검증한다. 외부 AI, Sentry, OTel exporter, 외부 font/resource를 포함한 전송 목록과 허용 endpoint를 관리한다. 관측은 endpoint/보관 위치/알림 수신자가 정해지기 전 운영 중이라고 하지 않는다.

## 7. B1~B6

| ID | 미해결 조건 | 시점 |
| --- | --- | --- |
| B1 | 판매 주체 회사/개인 | 판매 전, 로컬 MVP를 막지 않음 |
| B2 | Vibe HR 및 자체 코드 권리 | 해소: 2026-09-24 사용자 소유 확인 |
| B3 | AI API 공급자 계정/계약 | 실제 외부 LLM 사용 전 |
| B4 | Enterprise 혼입/키/우회/코드 출처 감사 | Vibe HR 자산 이식/플랫폼 전 |
| B5 | 전체 납품물 license 검사 | 판매 전 |
| B6 | 고객 데이터 처리위탁/재위탁/국외 이전 구조 | 실제 데이터 외부 전송 전 |

## 8. 현재 확인 한계

이번 작업은 네 문서 통합, 디자인 저장소 pull/소스/로컬 자산 검토, 주요 공식 자료 확인, 계획 검토까지다. 패키지 채택/설치, 실제 OIDC/DB/Job 실행, 운영 보안, 라이선스 출고 승인, 법률 검토가 완료된 것은 아니다. 금지 기호/문서 링크/원본 해시/계획의 일관성은 문서 검증으로 확인한다.
