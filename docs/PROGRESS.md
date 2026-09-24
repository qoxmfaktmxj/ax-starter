# 구현 진행 기록

기준일: 2026-09-24. 상태: 계획의 로컬 가상 데이터 MVP P0 기능과 제한된 검증 완료. P1과 실제 운영 연결은 아래에 별도로 남긴다. 이 기록은 실행한 명령과 결과를 기준으로 한다.

## 작업 결과

| 단계 | 구현                                                                                          | 대표 경로                                                                          |
| ---- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| T0   | Node 24, pnpm lock, 정확한 패키지와 이미지 digest, 직접 라이선스 기록                         | `package.json`, `pnpm-lock.yaml`, `Dockerfile`, [DEPENDENCIES.md](DEPENDENCIES.md) |
| T1   | local/test Compose, Web/Worker 동일 runtime 이미지, health와 경계 검사                        | `compose.yaml`, `apps`, `scripts/check-boundaries.ts`                              |
| T2   | Better Auth CLI 생성 schema, migration, 가상 사원 24명, OIDC와 기능/행/필드 정책              | `packages/server/auth`, `packages/server/db`, `packages/core/authz.ts`             |
| T3   | 권한 결합 조회, rowVersion, 원자적 batch, 멱등 결과와 감사                                    | `packages/contracts/employees.ts`, `packages/server/employees/service.ts`          |
| T4   | 조회형/일괄편집 Grid, Base UI 미저장 Dialog, 로그인/사원/감사 화면                            | `packages/ui`, `packages/grid`, `apps/web/app`                                     |
| T5   | marker와 symlink 경계 fs, PNG/PDF 업로드, 고정 fixture만 면제, 일반 파일 격리, 즉시 삭제 차단 | `packages/server/storage`, `packages/server/files`                                 |
| T6   | pg-boss dispatcher/Worker, 고정 snapshot, 200행 단위 Excel stream, 실제 PDF, 결과 재인가      | `packages/server/jobs`, `packages/server/exports`, `packages/server/reports`       |
| T7   | 실행 안내, 버전/글꼴/복구 문서, 실제 코드 경로 기반 new-module Skill                          | `README.md`, `docs`, `.agents/skills/new-module`                                   |

## P0 검사 증거

| 범위             | 실제 확인                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC01, AC02       | 두 사용자 OIDC 왕복, 관리자 24명과 조직 담당자 A 12명. 미등록 및 비활성 subject는 업무 API 403. 조직 담당자에게 급여 열/DTO/정렬/필터/Excel/PDF 없음                                                                                                                     |
| AC03, AC04, AC05 | 급여 쓰기와 타 조직 혼합 batch 거부, DB 행 불변. 두 요청의 같은 rowVersion 경쟁은 하나만 성공. 같은 requestId 동시 insert는 idMap 하나. 실패 입력 보존, 새 requestId 재저장, 편집 중 마지막 값 저장 확인                                                                 |
| AC06             | 미저장 상태에서 모드 이동 확인창의 취소와 Escape가 입력을 보존하고 포커스를 돌림. 성공 후 dirty 0 확인                                                                                                                                                                   |
| AC07, AC08       | Linux fs 본문 왕복, 없는 키, 중복 키, 삭제 반복, 경로 탈출, symlink, marker 유실 차단. fixture WAIVED만 다운로드, 일반 파일 QUARANTINED, 면제 만료와 삭제 뒤 다운로드 거부, 늦은 CLEAN 결과 부활 방지                                                                    |
| AC09, AC10       | 같은 Job 순차 재실행과 PENDING 최종 파일의 재공개에서 산출물 하나. 실제 화면 요청이 Worker에서 완료. Job 생성 후 권한 회수는 DENIED, 완료 뒤 권한 버전 또는 대상 조직 범위 변경은 다운로드 403                                                                           |
| AC11             | 실제 xlsx에서 24명, 큰 급여 문자열 타입 확인. 관리자 PDF는 A4 가로 3페이지에서 한글, 첫/마지막 행, 큰 급여 원문 확인. 담당자 Excel/PDF에 급여 없음. 첫/마지막 페이지 PNG 직접 확인                                                                                       |
| AC12             | 성공 변경과 실패/거부/민감 조회 감사. PostgreSQL 감사 행 UPDATE/DELETE 거부. 담당자의 감사 API 403. 입력 오류 응답과 실패 감사의 correlationId 일치                                                                                                                      |
| AC13             | 경계 검사 50개 소스 통과, lockfile에서 AG Grid Enterprise 의존성 없음                                                                                                                                                                                                    |
| AC14             | 데스크톱 정상/입력 오류/충돌 화면, Tab/Enter/Escape, 1366 및 1440 캡처. 390 기본 화면에서 문서 가로 넘침 없음. reduced motion 미디어 조건과 0.01ms 모션 제한 확인. 리소스 요청 origin은 로컬 Web 하나. 본문/주요 버튼 4.5:1 이상, 흰 면의 컨트롤 경계 3:1 이상 계산 확인 |
| AC15             | Node 24 컨테이너의 check/unit/integration/e2e/build exit 0. local Web와 Worker는 동일 이미지 ID `sha256:60799e40ef7d90e67a77ad46fa48225dcfb783525d1bf7a2a4efb4ceb8bb4937`, 실제 UID/GID 10001. Web pool 5, Worker pool 5, queue pool 5로 설정 합산 15                    |

실행한 명령의 마지막 결과:

- `docker compose --profile local build`: exit 0.
- `docker compose --profile local run --rm migrate`와 `seed`: 초기 DB에서 두 번씩 exit 0. 이후 추가 감사 trigger migration도 반복 적용 시 exit 0.
- `docker compose --profile local run --rm tools pnpm check`: exit 0, architecture 50개 소스.
- `docker compose --profile local run --rm tools pnpm test`: exit 0, unit 8개.
- `docker compose --profile test run --rm --build test pnpm test:integration`: exit 0, 실제 PostgreSQL/Linux fs 및 파일 parser 15개.
- `docker compose --profile test run --rm --build test pnpm e2e`: exit 0, 실제 OIDC 브라우저 흐름 8개.
- `docker compose --profile local run --rm tools pnpm build`: exit 0.
- `python -X utf8 C:\Users\sp20171217yw\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents/skills/new-module`: `Skill is valid!`.

시각 증거는 로컬 [1366 화면](../output/playwright/admin-1366.png), [1440 화면](../output/playwright/admin-1440.png), [390 기본 화면](../output/playwright/admin-mobile-390.png), [입력 오류](../output/playwright/validation-error-1366.png), [충돌](../output/playwright/conflict-1366.png), [PDF 첫 페이지](../output/pdf/admin-first-65111e5f-a08b-4119-9882-2169fdef4c77.png), [PDF 마지막 페이지](../output/pdf/admin-last-65111e5f-a08b-4119-9882-2169fdef4c77.png)에 있다. `output/`은 로컬 검사 산출물이며 Git ignore 대상이다.

## 구현 중 확인해 해결한 문제

- 계획 후보 OIDC 이미지 `3.1.4`가 registry에 없어 실제 게시된 3.x `3.0.3`으로 고정했다.
- Docker의 Debian HTTP 패키지 요청이 400을 반환해 CA를 설치하고 apt 소스를 HTTPS로 전환했다.
- fixture hostname이 컨테이너 IP로 해석되어 8090 연결이 거부됐다. 내부와 호스트 포트를 모두 8090으로 맞춰 같은 issuer의 discovery HTTP 200을 확인했다.
- fixture userinfo가 이메일을 주지 않아 Better Auth가 callback을 거부했다. 검증된 subject에서 로컬 placeholder 이메일을 만들고 OIDC 로그인을 확인했다.
- 로컬 HTTP 페이지의 `crypto.randomUUID()` 사용 불가를 `getRandomValues` 기반 UUID로 고쳤다. 화면에서 실제 Excel/PDF Job 완료와 다운로드를 확인했다.
- Next standalone Web에 Worker PDF 렌더러를 함께 import해 Playwright 내부 파일이 빠지던 500을 요청 서비스와 생성 Worker 모듈 분리로 해결했다.
- 테스트 컨테이너 IP가 같아 네 번째 로그인에 429가 났다. trace로 확인하고 local/test fixture의 social sign-in 한도만 늘려 rate limit을 유지했다.
- 첫 PDF에서 큰 급여가 잘려 열 너비와 행 배치를 수정했다. parser와 페이지 이미지로 확인했다.
- 열린 Grid 편집기를 저장 버튼이 닫지 않아 마지막 값이 누락됐다. Grid의 `stopEditing()`을 연결하고 브라우저 회귀 검사를 통과했다.

## P1과 운영 전 조건

P1 미검증 항목은 AC07의 abort/rename 전체 fault matrix, AC09의 모든 crash 지점 주입, AC11의 자동 PDF 이미지 회귀, AC13의 위반 fixture와 전이 의존성 deny 자동화, AC14의 axe 및 모바일 전수 검사, AC15의 SIGTERM/연결 수 실측, AC16의 DB와 파일 공동 백업 script와 새 volume 복원 리허설이다. [복구 절차](RECOVERY.md)는 작성했으며 리허설 통과로 표시하지 않는다.

Next build는 통과했지만 fs 경로의 동적 접근으로 Turbopack trace 경고 9건이 남았다. 로컬 이미지에 파일을 포함해 동작은 검증했으며, standalone 추적 범위 정리는 후속이다. 최종 이미지와 모든 납품물의 전이 라이선스 심사도 후속이다. 실제 NAS/IdP/악성코드 검사기/S3, 외부 AI, 전체 Skill 목록과 두 번째 모듈은 연결하지 않았다.

## 2026-09-25 Grid 후속 확장

성공 기준은 일괄편집의 최대 100행에서 범위 선택, TSV 복사와 붙여넣기, 자동 채우기, 저장 전 실행 취소와 다시 실행을 제공하고, 편집 불가 셀이 섞인 붙여넣기는 초안 전체를 유지하는 것이다. 조회형은 현재 불러온 셀의 복사만 허용한다. 저장 성공 때 이력을 비우고 실패나 충돌 때는 초안을 유지한다. 업무 Service의 최종 권한과 rowVersion 판정은 그대로 적용한다.

DataGrid가 범위와 클립보드 이벤트를 처리하고 사원 화면이 불변 초안과 최대 30단계 이력을 관리한다. 변경되지 않은 행 객체는 재사용하고 범위 표시 갱신은 프레임당 한 번으로 묶는다. Vibe HR 코드를 복사하지 않고 동작을 참고해 새로 작성했다.

실행 결과:

- `pnpm check`: exit 0, 경계 검사 53개 소스. Windows worktree의 CRLF 파일도 검사할 수 있도록 Prettier의 줄바꿈 판정을 `auto`로 지정했다.
- `pnpm test`: exit 0, 단위 테스트 17개. TSV 따옴표와 빈 셀, 날짜 윤일과 큰 금액 문자열의 자동 채우기를 포함한다.
- `docker compose -p ax-starter-grid --profile test build test-web test`: exit 0. 기존 fs 경로의 Turbopack trace 경고 9건은 그대로다.
- `docker compose -p ax-starter-grid --profile test run --rm test pnpm check`와 `pnpm test`: exit 0, 경계 검사 53개 소스와 단위 테스트 17개.
- `docker compose -p ax-starter-grid --profile test run --rm test pnpm test:integration`: exit 0, 15개.
- `docker compose -p ax-starter-grid --profile test run --rm test pnpm e2e`: exit 0, 13개. 새 브라우저 검사 5개는 붙여넣기와 실행 취소, 잠긴 셀의 전체 거부, 범위 복사, 드래그 채우기, 새 행 추가의 실행 취소와 다시 실행을 확인했다.

별도 Docker 프로젝트 이름을 써서 기존 로그인 작업의 컨테이너와 데이터를 변경하지 않았다. 대량 데이터 성능 수치와 모바일 범위 편집은 측정하거나 검증하지 않았다.
