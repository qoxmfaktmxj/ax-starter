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

## ISU 로그인 교체 (2026-09-25)

설계: [ISU 로그인 설계](superpowers/specs/2026-09-24-isu-login-design.md). 계획: [구현 계획](superpowers/plans/2026-09-24-isu-login.md).

| 범위 | 실제 확인 |
| --- | --- |
| 비밀번호 로그인 | hr-admin 24명, org-manager 12명, 틀린 비밀번호와 없는 아이디 같은 문구, inactive-user 업무 거부, 공개 가입 거부 |
| SSO | 기존 OIDC e2e가 "SSO로 로그인" 버튼으로 통과 |
| 3D 장면 | 텍스처 지연 중 로그인, WebGL 실패와 모션 감소 시 정지 이미지, 등장 완료 PASS |
| 연출 | 입력 중 calm, 성공 시 share와 1.2초 내 이동, 슬로건 두 줄 상태 PASS |
| 대비 | 슬로건 3:1 이상(e2e 단언 통과), 정확한 값 미기록. 패널 보조 글자 5.4:1(계산) |
| 스크롤바 | 임의 스크롤 영역과 Grid 세로 스크롤 영역 12px |
| 성능 | 텍스처 데스크톱 약 8MB, 모바일 약 1.5MB. SwiftShader 기준 1440x900 1.4fps, 1366x768 1.2fps, 390x844 2.8fps. 실제 GPU 기준은 미측정 |

실행한 명령의 마지막 결과:

- `pnpm check`: exit 0, format/lint/typecheck 통과, architecture 59개 소스 통과.
- `pnpm test`: exit 0, 6개 파일 25개 테스트 통과.
- `pnpm test:integration`: exit 0, 4개 파일 20개 테스트 통과.
- `pnpm e2e`: exit 0, 32개 테스트 통과, skip 0.
- `pnpm build`: exit 0. 기존에 알려진 fs 경로 동적 접근 Turbopack trace 경고 9건은 그대로다(신규 아님).

첫 `pnpm e2e` 실행에서 `grid-interactions.spec.ts` 5개가 로그인 버튼을 찾지 못해 타임아웃으로 실패했다. Docker Desktop의 빌드 컨텍스트 동기화 지연으로 테스트 이미지에 병합 전 코드가 남아 있었던 것이 원인이었다. `docker compose --profile local build --no-cache tools`와 `docker compose --profile test build --no-cache`로 재빌드한 뒤 컨테이너를 다시 만들어 전체 검사를 재실행했고, 위에 기록한 결과는 이 재실행의 최종 값이다. 애플리케이션 코드, 테스트, 타임아웃은 바꾸지 않았다.

캡처: `output/playwright-test/login/login-1440x900.png`, `login-1366x768.png`, `login-390x844.png`.

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

## 2026-09-25 검사 자원 정리와 안내 갱신

성공 기준은 일회성 검사 프로젝트의 컨테이너, 네트워크, 전용 volume과 이미지가 남지 않고 기본 `ax-starter` 실행 환경이 유지되는 것이다. README는 현재 `feat/isu-login` 브랜치의 로그인 코드와 Compose 실행 방식을 설명해야 한다.

- `docker compose ls --all`에서 `ax-starter-grid`는 종료 상태, `ax-starter`는 실행 중임을 확인했다.
- `docker volume inspect ax-starter-grid_test-db ax-starter-grid_test-files`에서 두 volume의 프로젝트 레이블을 확인하고, 두 volume을 참조하는 컨테이너가 없음을 확인했다.
- `docker volume rm ax-starter-grid_test-db ax-starter-grid_test-files`: exit 0.
- 참조 컨테이너가 없는 전용 이미지 `ax-starter-grid-test:latest`와 `ax-starter-grid-test-setup-e2e:latest`를 `docker image rm`으로 제거했다: exit 0.
- 다시 실행한 `docker compose ls --all`에 `ax-starter-grid`는 없고 `ax-starter`의 실행 컨테이너 5개가 남아 있었다. 다른 프로젝트와 공유 이미지, 기본 데이터 volume은 건드리지 않았다.
- `docker compose --profile test config --services`에서 test-db, test-init-files, test-oidc, test-setup-e2e, test-web, test-worker, test 서비스를 확인했다.

## 2026-09-25 공용 SDD 스펙 스킬

성공 기준은 Codex와 Claude Code가 한 스펙 설계 절차를 사용할 수 있게 하고, 공통 작업 규칙은 기존 `AGENTS.md` 하나로 유지하는 것이다. 자연어 요청으로 스킬을 선택할 수 있도록 기능과 적용 범위를 설명에 적고, 첫 실행은 설계와 계획까지만 진행하게 한다.

- `.agents/skills/sdd-spec/SKILL.md`에 스펙 설계 절차를 작성했다. `.claude/skills/sdd-spec/SKILL.md`는 이를 읽는 연결 파일이며 프로젝트 `CLAUDE.md`는 만들지 않았다.
- 두 스킬 폴더에 `python -X utf8`로 `skill-creator/scripts/quick_validate.py`를 실행했다: 각각 `Skill is valid!`.
- `claude --version`: 2.1.281. 자연어 호출 확인을 위해 `claude -p --permission-mode plan --max-turns 3`을 실행했으나 OAuth 세션 만료로 인증에 실패했다. Claude의 실제 자동 선택은 미검증이다.
- Claude Code의 기본 설정에서는 상위 디렉터리에 `CLAUDE.md`가 있으면 프로젝트 `AGENTS.md`가 자동으로 선택되지 않을 수 있다. 이 스킬의 Claude 연결 파일은 `AGENTS.md`를 명시적으로 읽도록 한다. 일반 Claude 작업의 프로젝트 규칙 로드는 별도 확인이 필요하다.
- 이 컴퓨터의 `~/.claude/settings.json`에 `agents-md@builtin`의 `instructionFiles: claude-md-and-agents-md`를 설정했다. JSON 파싱과 Claude Code 2.1.281 버전은 확인했지만 인증 만료로 새 세션에서 실제 규칙 로드는 확인하지 못했다. 이 사용자 설정은 저장소에 포함되지 않는다.

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

## 2026-09-25 로그인과 Grid 통합 검증

성공 기준은 ISU 로그인 브랜치와 `main`의 Grid 확장을 합친 상태에서 정적 검사, 단위 검사, 실제 PostgreSQL 통합 검사, 브라우저 흐름, 빌드가 모두 통과하는 것이다. 미검증 P1과 Claude Code OAuth 인증 상태를 통과로 표시하지 않는다.

- `git merge --no-ff main`에서 `PRODUCT.md`와 이 진행 기록에 충돌이 나 두 브랜치의 후속 결정을 보존해 해결했다. Grid 브라우저 검사는 현재 비밀번호 로그인 도우미를 사용하도록 수정했다.
- `pnpm check`: exit 0, 경계 검사 59개 소스. `pnpm test`: exit 0, 단위 검사 25개.
- `docker compose -p ax-starter-ship-20260925 --profile test build test-web test`: exit 0.
- `docker compose -p ax-starter-ship-20260925 --profile test run --rm test pnpm check`: exit 0, 경계 검사 59개 소스.
- 같은 테스트 프로젝트에서 `pnpm test:integration`: exit 0, PostgreSQL 통합 검사 20개.
- 같은 테스트 프로젝트에서 `pnpm e2e`: exit 0, Chromium 브라우저 검사 32개. WebGL 장면과 슬로건 대비 검사도 실행돼 통과했다.
- SDD 스킬 두 폴더의 `quick_validate.py`: 각각 `Skill is valid!`. Claude Code 자연어 자동 선택은 OAuth 인증 만료로 미검증이다.
- `docker compose -p ax-starter-ship-20260925 --profile test down --volumes --remove-orphans`: exit 0. 전용 컨테이너, 네트워크, DB/파일 volume을 제거했다. 참조 컨테이너가 없는 작업 전용 이미지 두 개도 `docker image rm`으로 제거했다. 기본 `ax-starter` 프로젝트는 유지했다.

## 2026-09-26 ISU 수면 배경 선택 시안

성공 기준은 기존 ISU 블록 모델을 사용하는 수면 배경 PNG 10개와 번호별 비교 화면을 만들고, 실제 이미지와 화면 전환을 확인하는 것이다. 사용자 결정 전 배경 탐색이며 로그인 구현 완료를 뜻하지 않는다.

- GPT-6 Sol 작업자가 기존 GLB를 Blender에 불러와 1200x750 PNG 10개, 비교 시트, 재현 스크립트와 장면 파일을 생성했다. 주 세션이 비교 시트와 원본을 직접 확인하고 흰 조명 반사 및 06번의 벽처럼 보이는 지형을 제거하도록 검토했다.
- 산출물: `C:/Users/sp20171217yw/.gstack/projects/ax-starter/designs/isu-water-20260926/`. `index.html`은 로그인 폼 표시와 배경 단독 보기를 지원하고 `contact-sheet.jpg`는 전체 비교 이미지다.
- 작업자 실행: `& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b --factory-startup --python 'C:\Users\sp20171217yw\.gstack\projects\ax-starter\designs\isu-water-20260926\render\render_variants.py' -- --all`. 최종 `render/final.log`에서 10개 저장과 Blender 종료를 확인했다. 렌더 합산 147.5초.
- 주 세션 실행: `python -m http.server 8765 --bind 127.0.0.1 --directory C:\Users\sp20171217yw\.gstack\projects\ax-starter\designs\isu-water-20260926`. 브라우저에서 이미지 10개 로딩과 1200x750 해상도, 시안 전환 및 배경 단독 보기 상태를 확인했다.
- 기존 미커밋 로그인 코드와 다른 작업 파일은 수정하지 않았다. 이번 변경은 이 기록뿐이다. 실시간 물결, ISU 상호작용 연결, 실제 GPU 성능, 전체 앱 검사는 이번 시안 작업에서 실행하지 않았다.

## 2026-09-26 ISU 수면 분위기 순환 미리보기

성공 기준은 선택한 04, 05, 06, 08, 09, 10 중 하나로 무작위 시작하고, 같은 3D 장면에서 정해진 순서로 자연스럽게 전환하며 수면과 블록의 포인터 반응을 확인하는 것이다. 유지 45초와 전환 15초를 초기값으로 사용한다.

- GPT-6 Sol이 별도 미리보기를 구현했다. 10 -> 06 -> 05 -> 04 -> 09 -> 08 -> 10 순서이며, 마지막 연결은 라벤더색을 경유한다. 기본 순환은 6분이다.
- 위치: `C:/Users/sp20171217yw/.gstack/projects/ax-starter/designs/isu-water-live-20260926/`. 기존 GLB, 로컬 Three.js와 Draco를 사용한다. `BRIEF.md`, `REVIEW.md`, `report.md`에 범위와 검토 기록을 남겼다.
- 작업자 `node build.cjs`: 번들 생성 완료. 주 세션 `node C:\Users\sp20171217yw\.gstack\projects\ax-starter\designs\isu-water-live-20260926\timeline.test.mjs`: exit 0, `timeline tests passed`.
- 주 세션 `python -m http.server 8766 --bind 127.0.0.1 --directory C:\Users\sp20171217yw\.gstack\projects\ax-starter\designs\isu-water-live-20260926`: 로컬 미리보기 제공. 브라우저에서 무작위 시작 04, 08, 10, 분위기 전환, 포인터 파문, 블록 반응, 일시정지와 재개를 확인했다.
- 1280x720, 1505x1278, 390x844 화면을 확인했다. 모바일 및 세로형 데스크톱의 글자 잘림과 패널 겹침, 전환 버튼 재시작 문제를 수정한 뒤 해당 화면과 버튼 동작을 다시 확인했다.
- 본 로그인 앱에는 아직 반영하지 않았다. 기존 미커밋 로그인 수정과 다른 작업 파일을 보존했다. 전체 앱 검사, 인증 회귀 검사, 실제 GPU 성능 검사 및 모션 감소 설정의 운영 체제 런타임 검사는 미실행이다.

## 2026-09-26 수면 장면과 상호작용 슬로건 실제 로그인 적용

성공 기준은 [수면 로그인 기준](superpowers/specs/2026-09-26-isu-water-login.md)에 따른 실제 로그인 화면의 분위기 순환, 물결, 블록과 글자 반응, 모바일 배치, 인증 회귀 검사다. GPT-6 Sol 구현과 주 세션의 코드 및 실제 화면 검토로 진행했다.

- `LoginScene.tsx`가 새 수면 모듈을 사용한다. 여섯 분위기 무작위 시작, 45초 유지와 15초 전환, 흑요석에서 화이트로 돌아올 때의 라벤더 연결을 적용했다. 미리보기의 고정 발광판을 제거해 블록 접촉 시 흰 막대가 노출되는 원인을 없앴다.
- 슬로건은 로컬 Geist 글리프를 사용하는 실제 3D 객체다. 사각 배경 없이 수면에 반사되고, 포인터 주변 글자가 파문을 따라 움직인 뒤 복귀한다. Share의 기본 세기 0.35와 로그인 성공 시 1을 유지한다. 밝은 장면을 위한 글자 윤곽과 정지 DOM 대체 표시도 제공한다.
- 실제 캡처에서 큰 글자와 모바일 폼 겹침을 발견해 슬로건 크기와 위치, 모바일 상단 장면 영역을 조정했다. 최종 1440x900과 390x844 화면에서 전체 로고, 슬로건과 폼의 분리를 확인했다. 초기 브라우저 검사에서 포인터 파문, 슬로건 접촉 횟수 증가와 콘솔 오류 0건을 확인했다.
- Blender로 생성한 수면 대체 이미지 두 장을 갱신했다. 데스크톱 1920x1080, 모바일 780x1688이며 슬로건을 이미지에 굽지 않아 DOM 대체 글자와 중복되지 않는다. 출처는 `apps/web/public/images/login/provenance.json`과 [재현 기록](../output/water-production/test-plan.md)에 남겼다.
- `pnpm check`: 첫 실행은 새 `isu-water-scene.ts`의 포맷 경고로 실패했다. 해당 파일만 정리한 뒤 최종 exit 0, format/lint/typecheck와 architecture 67개 소스 통과. [로그](../output/water-production/check-final.log).
- `pnpm test`: exit 0, 9개 파일 35개 검사 통과. 순환 경계, 무작위 시작 후보와 반복 글자 산개 후 복귀를 포함한다. [로그](../output/water-production/unit.log).
- Docker 명령 공통 접두사는 `docker compose -p ax-water-20260926 -f compose.yaml -f output/water-production/compose.test.yaml --profile test`다. `build test-web test`: exit 0, Next 빌드 완료. 빌드 시 기존 fs trace 경고 9건과 빌드 환경의 기본 auth secret 경고가 남았으며 실행 환경에서는 Compose의 local/test secret을 사용한다. [최종 빌드 로그](../output/water-production/build-final.log).
- 같은 접두사에서 `run --rm test pnpm test:integration`: exit 0, 4개 파일 20개 검사 통과. [로그](../output/water-production/integration.log).
- 같은 접두사에서 `run --rm test pnpm e2e`: exit 0, 36개 모두 통과, 실패와 건너뜀 0개, 3.7분. SSO, 비밀번호 로그인, 권한, 로딩 중 로그인, 실패 및 모션 감소 대체 화면, 물/블록/슬로건 반응과 복귀를 포함한다. 흰색과 흑요석 장면의 Challenge 및 성공 Share는 실제 글리프와 주변 윤곽 픽셀을 사용한 국소 대비 3:1 이상 검사에 통과했다. [로그](../output/water-production/e2e.log).
- Windows 예약 포트 범위에 걸린 3106 바인딩은 실패했다. 시스템 설정 변경 없이 검사 서버를 18766으로 옮겼다.
- 확인용 실제 앱은 별도 `ax-water-demo-20260926` 프로젝트의 가상 데이터로 `http://127.0.0.1:18700/login`에 실행 중이다. 기본 local volume과 기존 `isu-visual`, `jarvis` 자원은 사용하거나 변경하지 않았다. 실행 방법은 [로컬 실행 기록](../output/water-production/README.md)에 있다.
- 로컬 앱의 OIDC 연결은 외부 18790과 컨테이너 내부 8090의 불일치로 처음 실패했다. 별도 실행 설정에서 둘 다 18790으로 맞춘 뒤 호스트와 Web 컨테이너의 discovery HTTP 200, SSO 시작 HTTP 200을 확인했다. 실제 브라우저에서 SSO 로그인 후 전체 24건 조회와 로그아웃을 확인했다. 비밀번호 로그인과 인증된 `/api/me`도 HTTP 200이었다. 인증 코드는 변경하지 않았다.
- 검사 프로젝트의 컨테이너, 네트워크, volume 소유 라벨을 확인하고 같은 접두사의 `down --volumes --remove-orphans`를 실행해 정리했다. 테스트 이미지 태그도 제거했다. 초기 이미지 두 개는 삭제 조회 때 이미 존재하지 않았다. 실행 중인 확인용 앱의 이미지와 volume, `output/` 증거는 유지했다. [정리 로그](../output/water-production/cleanup.log).
- 작업 전후 SHA-256 비교로 기존 미커밋 `isu-scene.ts`, `isu-blocks.ts`, `isu-glow.ts`, `login-motion.ts`, `next-env.d.ts`, Grid 단위 테스트 두 파일이 바뀌지 않았음을 확인했다. 커밋과 병합은 하지 않았다.
- 실제 GPU의 50fps 기준은 이번에 측정하지 않았으므로 성능 합격으로 표시하지 않는다. 최종 확인용 앱은 가상 계정을 사용하는 로컬 환경이다.

## 2026-09-26 작업 저장과 브랜치 푸시 준비

사용자는 여기까지 작업을 저장하고 푸시하도록 요청했다. 성공 기준은 로그인 관련 변경을 커밋하고 현재 `feat/isu-login-visual` 브랜치의 로컬 HEAD와 원격 HEAD가 일치하는지 확인하는 것이다. `main` 병합과 PR 생성은 이번 요청 범위에 포함하지 않는다.

- `git fetch origin`과 `git ls-remote --heads origin main feat/isu-login-visual`: exit 0. 원격 main은 `a03a6ed6c671afbbcc555eecd24ccc8f08f2ba08`이고 현재 작업 브랜치는 아직 원격에 없었다.
- 인계된 기존 빛 효과 초안 세 파일은 이력 보존용 커밋으로 구분한다. 실제 로그인 적용과 해당 검사, 문서는 별도 커밋으로 묶는다.
- 다른 작업의 `apps/web/next-env.d.ts`, Grid 단위 테스트 두 파일과 `.claude/launch.json`, 내용 차이가 없는 `login-motion.ts`는 커밋 대상에서 제외한다. 로컬 실행 환경과 `output/` 검증 증거는 그대로 유지한다.
- 실행 이미지와 SHA-256을 비교해 앱 소스가 검증 당시와 같음을 확인했다. 새 수면 e2e 파일에 검사 종료 무렵 추가된 `hasWebGL2` 및 선택적 skip 두 곳은 작성자 확인 후 제외하고, 실제 36개 검사를 통과한 이미지 안의 테스트 원본으로 저장했다. 앱 구현을 추가 변경하지 않았다.
- `git diff --cached --check`와 명시한 파일 목록 확인은 통과했다. 다른 작업 파일 및 로컬 전용 실행 자료는 스테이징하지 않았다.

## 2026-09-26 main 병합

사용자가 작업 브랜치의 main 병합을 승인했다. 성공 기준은 검증된 작업 브랜치를 main에 반영하고 원격 main과 로컬 main이 일치하며 기존 미커밋 파일이 보존되는 것이다.

- `git fetch origin` 후 `git rev-list --left-right --count origin/main...origin/feat/isu-login-visual`: `0 31`. main의 새 변경은 없었다.
- GitHub check-runs는 빈 목록, commit status의 total_count는 0이었다. 등록된 원격 CI가 없으므로 원격 CI 통과로 표시하지 않는다.
- 기존 작업 폴더를 유지하고 임시 worktree에서 `git merge --ff-only origin/feat/isu-login-visual`: exit 0. main을 `097eda44b9e8510e61a1d4eb006b12d96744e9ef`로 fast-forward했다.
- `git diff --exit-code origin/feat/isu-login-visual HEAD`: exit 0. 병합 결과가 직전 검증한 브랜치와 같으므로 앱 검사를 다시 실행하지 않았다. 단위 35개, 통합 20개, e2e 36개와 빌드 통과 증거는 앞 절에 있다. 이 병합 기록만 추가한다.
