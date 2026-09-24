# 로컬 MVP 실행 계획

작성일: 2026-09-24. 이 문서는 구현 기준 계획이다. 현재 코드와 검사 결과는 [PROGRESS.md](PROGRESS.md)에 기록한다. 아래 파일 경로와 명령은 계획 작성 시점의 생성 대상이었다.

## 1. 목표와 완료선

가상 사원 데이터로 **로그인 -> 권한별 조회 -> 일괄 편집 -> 충돌/재시도 -> 첨부 -> Excel/PDF Job -> 다운로드 -> 감사**를 로컬 Docker에서 실행한다. 화면 하나가 다음 업무 화면의 Reference가 되어야 한다.

사용자 확정: 로컬 Docker, 가상 데이터, Vibe HR 작업 화면 중심 + 랜딩 타이포. 원본 우선순위는 kickoff > v4 > 이전 검토안이다. 계약의 출처와 변경 이유는 [SOURCE_RECORD.md](SOURCE_RECORD.md)에 보존했다.

| 구분 | 오늘의 처리 |
| --- | --- |
| 필수 구현 P0 | Web/Worker/DB/OIDC fixture, 사원관리 browse/batch-edit, 데이터/필드 권한, 멱등 저장, fs 파일, Excel/PDF, 감사, 핵심 상태와 자동 검증 |
| 후속 강화 P1 | 전체 fault injection, architecture 위반 fixture, 자동 접근성/모바일 전수 검사, 의존성 deny 자동화, 종료/연결 수 실측, 복구 리허설 |
| 작은 공통 기반 | ExecutionContext, FileStorage, Grid 계약, ReportRenderer, decimal 정책, UI 토큰, 런타임 설정, 경계 lint |
| 문서로 보존 | S3 공통 계약, 유효기간 이력 키, Saved View 복원 규칙, 운영/판매 게이트, 복구 절차 |
| 시간 여유 시 | AI mock 제안 하나, S3 최소 어댑터와 HTTP contract test, 추가 Skill |
| 후속 필수 | 실제 S3 통합, 전체 Skill과 교육 신청 모듈, 실제 NAS/IdP/검사기/공동 복구 검증 |

S3 최소 구현과 두 번째 모듈은 원래 착수 범위에 있었다. 오늘의 로컬 MVP에서는 뒤로 옮긴다. 따라서 오늘 완료를 전체 Starter 착수 지시서 완료로 표시하지 않는다. 보안 실패를 우회하거나 PDF/Worker를 mock 결과로 바꿔 완료 처리하지 않는다.

## 2. 계획 작성 시점 상태와 첫 장애물

- 앱 소스, package.json, lockfile, 기존 커밋이 없는 새 저장소다. 원본 문서 네 개와 이번 계획 문서만 있다.
- 호스트 Node `v22.14.0`, pnpm `10.33.0`, Docker CLI `29.1.3`, Compose `v2.40.3-desktop.1`을 확인했다.
- Docker 엔진 연결은 실패했다. 구현 시작 시 Docker Desktop Linux 엔진부터 켠다. 이번 계획 단계에서 기동하거나 패키지를 설치하지 않았다.
- Node 24가 기준이다. 호스트 전체 설정을 임의로 바꾸지 않고 Node 24의 컨테이너 tools 서비스로 설치/검증하는 경로를 제공한다.
- `host.docker.internal` DNS는 현재 호스트에서 해석됐다. 컨테이너와 브라우저 양쪽의 OIDC 접근은 아직 검증하지 않았다.
- 사내 IdP, 실 NAS, S3 계정, AI API 키는 오늘 요구하지 않는다.

## 3. 최소 구조와 책임

```text
apps/web/                      Next.js 페이지와 HTTP 연결부
apps/worker/                   pg-boss dispatcher/consumer, 출력물 생성
packages/contracts/            JSON 입력/출력 스키마, Grid 타입, 오류 코드
packages/core/                 실행 문맥, 권한 정책, 업무 Service, 포트
packages/server/               Drizzle repository, auth resolver, fs, queue, renderer
packages/ui/                   Base UI 공통 UI, tokens/base.css, semantic.css, density.css
packages/grid/                 DataGrid, 변경 내역, AG Grid 어댑터와 theme.ts
tests/unit/                    정책/행 상태/decimal 테스트
tests/integration/             실제 PostgreSQL, fs, Service/Job 경계 테스트
tests/e2e/                     두 사용자 Reference와 상태 UI
tests/fixtures/                재현 가능한 가상 데이터와 파일
infra/oidc/                    로컬 OIDC fixture 설정
scripts/                       seed, 검증, 로컬 백업/복원
docs/                          계약, 출처, 운영 절차, 진행 기록
Dockerfile                     tools/build/runtime 대상, Web/Worker 동일 runtime 이미지
compose.yaml                   local 프로필과 격리된 test-db, test-web, test-worker, test-oidc, test
```

패키지를 이보다 세분화하지 않는다. core는 서비스와 구체 업무에 필요한 포트만 갖는다. 범용 DI 컨테이너, 이벤트 버스, BaseRepository, 자동 CRUD 생성기, 플러그인 레지스트리는 만들지 않는다.

호출 순서는 `Web/Worker 연결부 -> 현재 권한 해석 -> core Service -> repository/storage 포트`다. server는 포트 구현을 조립한다. Web은 server의 공개 서비스 조립점만 import한다. contracts에는 DB/Next/AG Grid 의존성을 넣지 않는다.

경계 검사 예외는 Drizzle schema/migration/seed, auth adapter, queue adapter, 테스트 fixture로 정확히 열거한다. `server-only`는 Next 연결부에만 둔다. Worker와 공유하는 모듈에 Next 전용 import를 넣지 않는다. package exports와 dependency-cruiser로 내부 repository 우회 및 UI의 DB/AG/provider 직접 import를 막는다.

## 4. 데이터와 권한 계약

### 4.1. Reference 데이터

가상 조직 A/B 각각 사원 12명, 총 24명을 seed한다. 긴 한글 조직명, 동명이인, 빈 이메일, 큰 금액 문자열, 월말 입사일을 포함한다. 실제 사람의 정보, 주민번호, 계좌는 쓰지 않는다.

| 사용자 | 범위 | 기능 권한 | 필드 권한 |
| --- | --- | --- | --- |
| hr-admin | ALL | emp.read/create/update/delete/export, file.upload/download/delete, audit.read | salary와 contact의 read/write/export |
| org-manager | ORG=A | emp.read/create/update/export, file.upload/download | contact.read/write/export, salary 없음 |
| inactive-user | 없음 | 없음 | 로그인 후에도 업무 Service 접근 거부 테스트용 |

두 사용자는 실제 OIDC 왕복과 Better Auth 세션을 거친다. auth의 identity와 업무 사용자/권한 테이블을 구분하고 `(issuer, subject)`를 고유 신원 키로 쓴다. IdP role claim이나 클라이언트의 orgId를 업무 권한으로 신뢰하지 않는다. 알 수 없는 identity는 업무 권한을 부여하지 않는다.

| 테이블/데이터 | 최소 내용 |
| --- | --- |
| Better Auth 테이블 | 채택 버전의 adapter schema 그대로 생성, 직접 추정 금지 |
| app_users | identity 연결, employee_id, org_id, active, role_code, data_scope, authz_version |
| organizations | id, code, name, parent_id, row_version. 오늘 조직 구조/발령 관리 화면 없음 |
| role 정책 | DB의 사용자 role/scope와 서버의 고정 권한 매핑. 범용 권한 관리 UI 없음 |
| employees | UUID id, unique employee_no, name, org_id, position, hire_date(date), status(ACTIVE/LEAVE), email, monthly_salary numeric(18,2), row_version, deleted_at, created_at/updated_at(timestamptz) |
| command_results | actor_id, operation, idempotency_key 고유 키, payload_hash, authz_version, 결과 JSON, 생성시각 |
| file_objects | id, owner 업무 참조, 원본명, size, 검증 MIME, sha256, backend_id, object_key, state, scan_status, row_version, waiver 정보, deleted_at |
| export_jobs | id, actor_id, idempotency_key, 요청 hash, format, 필터/선택, 상태, artifact_id, snapshot_at, 생성 권한 버전, subject_ids, projection_version, 오류 코드/시각 |
| export_job_items | job_id + ordinal 고유 키, employee_id, 출력 허용 DTO projected_json. 재시도 snapshot |
| audit_events | append-only, actor, occurred_at, correlation_id, action, outcome, subject_ids, client/source 정보, 변경 필드명 |

급여는 권한/정확성 검증용 월급 값이며 급여 계산 제품을 의미하지 않는다. 금액은 API와 Excel에서 문자열로 보존한다. 원본 민감 값, access token, 파일 본문을 로그/감사에 넣지 않는다.

입력 검증은 employee_no 영문 대문자/숫자/하이픈 1~20자, name 1~80자, org_id 존재/권한, position 최대 50자, hire_date 실제 존재하는 YYYY-MM-DD, status enum, email 공백 또는 유효 주소 최대 254자다. monthly_salary는 null 또는 음수 없는 decimal 문자열로 소수 최대 2자리/정수 최대 16자리다. 비급여 권한자가 신규 등록하면 salary는 null 기본값이며 임의 기본 급여를 넣지 않는다. 사번 고유 제약은 soft delete 후에도 유지한다.

### 4.2. 실행 문맥과 권한

ExecutionContext는 principal(user 또는 범위가 명시된 system), permissions, dataScope, fieldGrants, correlationId를 가진다. TransactionalContext에만 tx를 더한다. 원본의 추적 requestId는 이 계획에서 correlationId로 명확히 이름을 바꾼다. BatchSaveRequest의 wire 필드 requestId는 원본 계약을 유지하되 연결부에서 idempotencyKey로 매핑한다. command_results/export_jobs DB 컬럼은 idempotency_key, 로그/감사/오류 응답은 correlation_id/correlationId다. 두 값은 독립적이다.

FieldGroup은 salary/bank/rrn/evaluation/contact/family/discipline, FieldGrant는 각 그룹의 read/write/export다. 실제 저장은 salary/contact만 한다. 나머지 민감 필드를 추측해 스키마에 추가하지 않는다.

오늘 DataScope는 ALL/ORG/SELF를 구현/테스트한다. ORG_TREE/CUSTOM은 타입과 계약에 보존하되 입력되면 명시적으로 거부한다. 미구현 scope를 ALL로 처리하지 않는다. 조직 이력은 `(org_id, valid_from, valid_to exclusive)` 계약만 보존하고 중복 금지 업무 키와 겸직 정책 확정 전 EXCLUDE 제약/이력 엔진을 만들지 않는다.

Service는 호출될 때마다 기능, 행 범위, 필드 권한을 검사한다. Web 세션은 쿠키 캐시를 끄고 DB에서 active/권한을 새로 읽는다. Worker는 actorId로 다시 해석한다. SQL 조건에 데이터 범위를 결합하고 count에도 적용한다. UI에 없는 필드를 직접 보낸 수정 요청도 거부한다.

조회 DTO는 read, 출력 DTO는 read와 export를 모두 충족하는 필드만 포함한다. 수정은 write가 필요하다. 동일 정책 함수가 UI/Excel/PDF를 투영한다. 권한 없는 필드는 null이나 마스킹 문자열이 아니라 응답에서 제외한다. 필드명 자체를 감춰야 하는 경우 UI 컬럼도 만들지 않는다.

### 4.3. 일괄 저장

입력은 `BatchSaveRequest { requestId, changes }`. insert는 clientRowId/values, update는 rowId/rowVersion/values, delete는 rowId/rowVersion이다. changes는 최대 100건이다.

성공은 `{ok:true,idMap:[{clientRowId,rowId}],versions:[{rowId,rowVersion}]}`. 실패는 `{ok:false,rowErrors:[{rowKey,field?,message}],conflicts:[{rowId,currentVersion}]}`다. 보이지 않는 타 조직 행의 존재/버전은 응답하지 않는다.

1. 현재 권한 확인, 입력 schema 검증, canonical payload hash 계산.
2. DB transaction을 열고 `(actorId, operation, idempotencyKey)`의 서버 계산 64-bit hash로 `pg_advisory_xact_lock`을 얻는다. SQL 값은 parameter로 전달한다. lock 대기는 5초로 제한하고 timeout은 재시도 가능한 503이다. 별도 PENDING 예약 행/lease/takeover 엔진을 만들지 않는다. 프로세스 종료 시 transaction rollback과 lock 해제가 소유권 복구다.
3. lock 뒤 command_results를 조회한다. 같은 hash만 재사용, 다른 hash는 409다. 사용자 정책 행을 잠그고 현재 active/authz_version을 검사한다. 과거 결과도 권한 변경 후 재사용하지 않는다. 대상 ID를 정렬해 범위를 결합한 쿼리로 잠그고 모든 version/필드를 먼저 검증한다.
4. 전체 유효하면 변경, version 증가, 성공 감사, idMap/versions, COMPLETED 결과를 같은 transaction에서 commit한다. 도메인 validation/rowVersion 실패는 업무 DML 없이 실패 결과만 commit한다. 처음부터 구조가 잘못된 422와 인증/권한 401/403, idempotency payload 충돌 409, 일시적 5xx는 저장하지 않는다. tx 내부에서 판정한 행 validation 422와 rowVersion 409만 확정 실패 결과로 저장한다.
5. 실패/권한 거부 감사는 업무 transaction 종료 뒤 별도 writer로 기록한다. DB 실패면 성공 변경과 결과 모두 rollback한다. commit 직후 응답이 유실돼도 다음 요청은 저장된 동일 결과를 읽는다. 다른 idempotencyKey 사이의 동일 사번 충돌은 DB unique 제약으로 전체 rollback 후 422다.
6. 사용자가 입력을 고쳐 저장하면 새 requestId, 응답 유실 재전송만 기존 requestId를 쓴다. insert의 같은 requestId 동시 재전송에서도 사원은 한 번만 생성된다.

수정 가능한 업무 테이블에만 row_version을 쓴다. 감사 행에는 쓰지 않는다. 기존 사원의 employee_no/org_id 변경은 오늘 제외한다. 신규 org_id도 현재 범위 안인지 검사한다. 삭제는 soft delete이며 조회 기본값에서 제외한다.

### 4.4. decimal

decimal.js 하나를 사용한다. 계산 정책별 Decimal.clone()을 쓰고 전역 설정을 바꾸지 않는다. RoundingPolicy의 id/target/effectiveFrom/unit/mode/negative/applyAt/version 계약을 보존한다. DEMO 정책 한 개로 양수/음수/시행일 경계 테스트만 만든다. 법정 세액 정책이라고 명명하지 않는다. JS number/parseFloat로 금액을 계산하거나 Excel 숫자로 강제 변환하지 않는다.

## 5. API와 화면 계약

| 경로 | 역할/응답 |
| --- | --- |
| /login | 테스트용 OIDC 진입, 앱 자체 비밀번호 로그인 없음 |
| /employees | 사원관리, browse/batch-edit 전환, 상세/첨부/출력 작업 패널 |
| /audit | 관리자 감사 조회용 단순 Table, 화면 추가 도메인으로 확장하지 않음 |
| /api/auth/[...all] | Better Auth handler. 업무 wrapper 예외로 목록화 |
| GET /api/runtime-config | 공개 가능한 브랜드명/프로필만 반환. secret/DSN 제외 |
| POST /api/employees/query | 검증된 query JSON -> rows, cappedCount, countCapped |
| POST /api/employees/batch | 멱등 원자적 저장 |
| POST /api/employees/:id/files | multipart 업로드 -> fileId/state/scanStatus |
| GET /api/employees/:id/files | 현재 권한이 있는 첨부 metadata만 |
| GET /api/files/:id/content | 권한/감사 후 stream. 정적 public URL 금지 |
| DELETE /api/files/:id | 권한 확인 후 DELETE_PENDING, 즉시 다운로드 차단 |
| POST /api/exports | format=xlsx/pdf, query 또는 selectedIds, requestId -> 202 jobId |
| GET /api/exports/:id | 소유자만 작업 상태 확인 |
| GET /api/exports/:id/content | 새 권한과 artifact 유효성 검사 후 stream |
| GET /api/audit | audit.read, 기간/행수 제한 |
| GET /api/health/live, /ready | 프로세스 생존, DB/fs marker 준비 상태. 비밀정보 제외 |

JSON 변경 Route는 세션, Content-Type, 허용 Origin을 검사한다. Better Auth callback 예외는 라이브러리의 state/nonce/PKCE 검증을 유지한다. UI에서만 버튼을 비활성화하고 API 검사를 생략하지 않는다.

OIDC fixture는 `ghcr.io/navikt/mock-oauth2-server:3.1.4`를 검증 시작 후보로 고정한다. T0에서 공식 release/tag 존재와 image digest를 확인해 exact digest를 기록한다. 해당 tag가 없으면 임의 latest로 바꾸지 말고 동일 3.x의 존재하는 patch를 근거와 함께 제시한다. 프로젝트는 MIT이지만 image 전체 감사는 별도다.

local 주소는 APP_ORIGIN=`http://host.docker.internal:3000`, issuer=`http://host.docker.internal:8090/default`, discovery=`<issuer>/.well-known/openid-configuration`, callback=`<APP_ORIGIN>/api/auth/callback/local-oidc`로 고정한다. Web은 3000:3000, fixture는 8090:8080을 publish하고 fixture hostname은 host.docker.internal이다. 브라우저도 APP_ORIGIN으로 접속한다. endpoint마다 localhost와 내부 service 이름을 섞지 않는다. 이 publish 구성은 가상 데이터 local 프로필에서만 쓰며 운영 profile은 fixture를 거부한다.

fixture의 interactiveLogin과 subject mapping으로 hr-admin/org-manager/inactive-user를 제공한다. aud는 앱의 clientId와 동일하게 설정하고 각 사용자 email은 example.invalid로 만든다. 권한은 fixture claim이 아닌 앱 seed가 결정한다. T0 통과 조건은 host 브라우저와 Web 컨테이너 모두 같은 discovery/JWKS에 접근하고 issuer/audience/nonce/PKCE를 검증하며 callback까지 성공하는 것이다. 검증을 끄는 fallback은 금지한다.

공통 오류: 401 UNAUTHENTICATED, 403 FORBIDDEN, 404 NOT_FOUND(범위 밖 단일 자원 포함), 409 CONFLICT/IDEMPOTENCY_KEY_REUSED, 422 VALIDATION, 413 FILE_TOO_LARGE, 503 STORAGE_UNAVAILABLE. API 응답은 사용자 문구와 correlationId를 포함하며 SQL/stack trace는 노출하지 않는다.

조회는 offset 0..10000, limit 1..100(기본 50), 정렬 최대 2개 + id tie-breaker. 필터는 employeeNo/name contains, orgId/status eq만 오늘 제공한다. 컬럼/연산자는 서버 enum에서 실제 Drizzle 컬럼으로 매핑한다. 값은 parameter binding, 식별자 사용자 조립 금지. 금액처럼 권한 없는 필드는 정렬/필터도 거부한다. count는 10001에서 끊고 '10,000건 이상'을 표시한다. 쿼리 statement_timeout 5초, 조직/상태/ID 조회 인덱스를 둔다.

DataGrid 화면 계약은 columns(field,label,kind,editable), mode, rowId, query/onQueryChange, changes/onChangesChange, onSave 등 업무 중립 타입이다. ColDef/GridApi/AG 이벤트를 바깥에 노출하지 않는다.

- browse: Infinite Row Model, 서버 정렬/필터, 현재 로딩된 행만 선택. 전체 검색 결과 Export는 선택과 별도 버튼 의미로 제공한다.
- batch-edit: 명시적으로 가져온 최대 100행, Client-Side Row Model. 한 화면 안에서 추가/수정/삭제와 변경 건수를 관리한다.
- 신규 후 삭제는 changes에서 제거, 원래 값 복구는 clean, 수정 후 삭제는 delete 하나, 성공은 idMap/versions 반영과 dirty 초기화, 실패는 입력 보존.
- 검색/모드/메뉴 변경과 브라우저 이탈에 미저장 경고. 저장 중 편집/중복 클릭 차단, 마지막 편집값을 확정한 뒤 요청.
- 초기 MVP에서 범위 붙여넣기, fill handle, pivot/group, 가짜 Enterprise 메뉴는 제외한다. Saved View는 오늘 저장 UI 없이 향후 `{schemaVersion,columnIds,filters,sort}`와 미존재/권한 회수 필드 제거 계약만 남긴다.

## 6. 파일 계약

FileStorage는 put(key,Readable,{size,contentType},AbortSignal?), get(key,AbortSignal?), delete(key), exists(key)다. delete는 이미 없어도 성공한다. 기본 fs 구현의 실제 파일 경로는 `/data/files/YYYY/MM/<uuid>`이며 원본 파일명을 경로로 쓰지 않는다.

- 전용 Docker named volume을 사용한다. trusted 초기화 서비스가 marker를 만들고 고정 UID/GID에 디렉터리를 인계한다. Web/Worker는 non-root다.
- 시작 시와 쓰기 전에 marker/실제 root를 검사한다. root 내부 path 확인, symlink 거부, 동일 mount의 임시 파일 -> rename, 덮어쓰기 금지. marker를 일반 쓰기 코드에서 자동 재생성하지 않는다.
- rename 실패/결과 불명은 목적 파일 size/sha256으로 확인하고 성공 여부를 정한다. 로컬 디스크로 fallback하지 않는다.
- 업로드는 PNG/PDF 두 종류, 최대 5 MiB, 30초. 확장자/MIME/magic bytes 모두 검증한다. streaming/backpressure/요청 취소를 연결하고 임시 파일을 정리한다.
- 상태: PENDING -> QUARANTINED/NOT_SCANNED -> AVAILABLE/CLEAN 또는 AVAILABLE/WAIVED. 검사 실패는 QUARANTINED/FAILED, 감염은 QUARANTINED/INFECTED. DELETE_PENDING -> DELETED. 늦게 끝난 검사는 삭제 상태를 되살릴 수 없다.
- 실제 검사기가 없으므로 임의 업로드를 CLEAN으로 만들지 않는다. 저장소가 제공하는 synthetic fixture의 SHA-256 allowlist만 local/test 정책으로 WAIVED 처리한다. 승인 주체 `system:local-fixture-policy`, 사유, hash 범위, 만료시각을 기록한다. 일반 업로드는 격리 상태로 남는다.
- fixture 면제는 local/test에서만 시작 가능하다. 화면에 '테스트 파일 검사 면제'를 표시한다. 사용자가 요청한 scanStatus/waiver는 입력으로 받지 않는다.
- 다운로드는 현재 업무 권한, 파일 상태, 면제 만료를 다시 확인한 뒤 감사 기록과 stream. `Content-Disposition: attachment`와 한글 `filename*`, nosniff, private/no-store를 쓴다.
- 삭제는 즉시 접근 차단 후 Worker가 물리 삭제한다. 로컬 보관 시간은 0으로 하되 운영 기본 정책으로 간주하지 않는다. 누락/고아 정리는 보고 중심 script로 남기며 참조 중인 파일을 추측해 삭제하지 않는다.

fs와 미래 S3에 공통 적용할 계약은 본문 일치, 미존재 get 오류, 중복 key 거부, abort 정리, 삭제 반복, 존재 판정이다. 오늘은 fs 실제 I/O 테스트를 통과시킨다. S3 미실행을 skip-pass로 감추지 않고 후속으로 표시한다. 이 검증은 NFS/SMB 인증이 아니다.

## 7. Worker, Excel/PDF, 감사

### 7.1. Job과 재시도

Web과 Worker는 같은 runtime 이미지의 다른 명령으로 실행한다. 개발 tools target은 별개다. pg-boss schema와 업무 schema를 구분하고 버전별 초기화는 migrate 단계에서 한 번 수행한다. Web/Worker의 커넥션 풀은 각 5, queue 내부 연결 상한도 기록해 합산 20 이내로 설정/검증한다.

Export 요청은 DB export_jobs 행과 요청 감사를 먼저 commit한다. Worker의 작은 dispatcher가 미전송 PENDING 행을 5초 간격으로 pg-boss에 보낸다. 전송 뒤 표식을 쓰며 중간 crash 시 재전송한다. 단순 fire-and-forget enqueue만 하고 끝내지 않는다. payload에는 exportJobId와 actorId만 전달하고 권한/원본 업무값은 넣지 않는다.

요청의 wire requestId는 idempotencyKey로 매핑한다. `(actorId, idempotencyKey)` + payload hash를 사용해 같은 요청은 같은 jobId, 다른 내용은 409다. Worker는 jobId별 DB advisory lock을 잡고 완료된 Job이면 no-op, 실패 재시도는 같은 artifact ID와 불변 object key를 사용한다. 생성 중 끊긴 파일은 temp/checksum으로 정리한다. 예외 시 lock/DB/browser 자원을 finally에서 해제한다. 오늘 Worker replica와 출력 동시 실행은 1이다.

작업은 PENDING/RUNNING/SUCCEEDED/FAILED/DENIED로 구분한다. 재시도는 최대 3회, 5초부터 backoff. SIGTERM은 새 작업 수신을 멈추고 최대 30초 정리 후 종료하며 미완료 작업은 queue 재시도 대상으로 남긴다. 상태 화면은 2초 간격으로 완료까지 polling한다.

### 7.2. 권한과 산출물

Worker는 실행 시 active, emp.export, row scope, 필드 read/export를 다시 확인한다. 생성 직전/완료 시 권한 버전이 달라지면 결과를 공개하지 않는다. 모든 권한/소속/활성 상태 변경 경로는 app_users.authz_version을 증가시킨다. 오늘 정책 변경은 통합 테스트 fixture에서 수행하고 공개 관리 API를 만들지 않는다.

검색 Export는 요청 순간이 아니라 **Worker 첫 실행 시점**의 데이터다. 짧은 REPEATABLE READ transaction에서 현재 권한으로 대상과 출력 DTO를 확정하고 `export_job_items(job_id,ordinal,employee_id,projected_json)`에 저장한다. export_jobs에 snapshot_at/authz_version/projection_version을 함께 commit한다. 최대 2000행이라 범위가 제한된다. snapshot 이후 파일 생성은 tx 밖이다. 재시도는 고정 DTO를 읽으며 현재 업무값을 다시 조회해 파일 내용을 바꾸지 않는다. UI와 출력물에 snapshot_at을 표시한다.

산출물 metadata에 actorId, authzVersion, subjectIds, 포함 필드, projectionVersion을 남긴다. 다운로드 때 소유자, 현재 active/권한 버전/필드 권한을 확인하고 subjectIds의 현재 존재/조직 범위도 확인한다. 달라졌으면 403과 재생성 안내다. 소유자가 아닌 관리자도 다른 사용자의 파일을 자동으로 받지 않는다.

publish 순서는 1) 고정 snapshot으로 temp 생성, 2) 크기/hash 계산 후 PENDING file_objects metadata commit, 3) 불변 final key로 rename과 hash 확인, 4) 현재 권한 재검사 후 file_objects AVAILABLE 및 export_jobs SUCCEEDED와 성공 감사를 같은 DB tx에서 commit이다. 성공 상태를 먼저 기록하지 않는다. rename 뒤 DB 실패는 PENDING metadata와 final hash가 맞으면 재시도에서 재생성 없이 publish한다. rename 결과 불명도 같은 검사로 판정한다. 다른 hash의 기존 final은 덮어쓰지 않고 실패/격리한다. final이 없고 temp가 사라졌으면 같은 snapshot으로 다시 생성해 PENDING hash를 갱신한다. 완료되지 않은 파일은 다운로드할 수 없다.

`selectedIds`는 최대 100명, 검색 전체 Excel은 최대 2000명, PDF는 최대 100명/10페이지/30초다. 한도 초과는 명시 오류와 필터 축소 안내다. Excel은 id 기준 200행씩 keyset 조회/stream 생성하며 전체 건수를 메모리에 적재하지 않는다. 이 한도는 대규모 운영 성능 보장 수치가 아니다.

### 7.3. 출력물

ExcelJS로 실제 xlsx, Playwright Chromium으로 실제 PDF를 생성한다. `ReportRenderer.render({id,version},data,'pdf')`를 유지한다. 서식은 `employee-list`, version 1 하나, 데이터 contract version 1 하나다. 임의 HTML/URL/서식 ID를 받지 않는다.

화면, Excel, PDF의 권한 판정은 같은 함수다. 이름/조직/일자/급여 문자열의 정합성을 테스트한다. Excel 셀은 문자열/날짜 타입을 명시하고 수식 객체와 외부 링크를 만들지 않는다. PDF 텍스트는 escape하고 외부 리소스 요청을 차단한다. 로컬 폰트/브라우저 버전, A4 가로, 머리글 반복/페이지 번호를 고정한다.

Playwright page.pdf()의 전체 버퍼 메모리 사용을 인정한다. Readable로 감싼다고 생성이 stream이 되는 것은 아니다. 페이지/시간/동시 실행 제한으로 통제한다. 서버 생성 artifact는 사용자 업로드와 구분하고 `WAIVED:APP_GENERATED_REPORT` 이유/서식 범위/만료를 명시한다. 일반 업로드 면제를 공유하지 않는다.

### 7.4. 감사

성공 변경 감사는 업무 tx와 같이 commit/rollback된다. 권한 거부/실패/민감 조회/다운로드 감사는 별도 connection 경로에 남겨 rollback돼도 유지한다. actor, 접속시각, source/client, 처리 subjectIds, action, outcome, correlationId를 기록한다. 법적 준수 인증을 주장하지 않는다.

감사 기록을 못 남기면 민감 조회/다운로드를 시작하지 않는다. 거부는 그대로 거부하고 pino에 감사 저장 실패를 민감값 없이 남긴다. `/audit`는 admin만 접근하고 DB 최대 100행/기간 필터를 사용한다.

## 8. 구현 순서와 파일 소유권

표의 시간은 계획용 추정이며 상한/완료 보장이 아니다. 빈 저장소에서 P0는 약 7~10시간의 집중 구현/검증을 예상하고, 모든 P1까지 포함하면 후속 작업일이 필요할 수 있다. 오늘 목표는 P0다. T0에서 호환성/인증에 45분 이상 걸리면 남은 시간과 미완료 작업을 즉시 보고한다. 마지막 60분은 새 기능을 멈추고 검증/인계에 사용한다.

| 작업 | 예상 | 대상 파일/책임 | 검증과 다음 단계 조건 |
| --- | --- | --- | --- |
| T0 호환성/환경 | 30~45분 | docs/DEPENDENCIES.md, package/lock, Dockerfile tools, OIDC 설정안 | Node24, TS7/6 aliases, Next/React/Base UI, DB 접속, OIDC discovery 확인. exact 버전/라이선스/이미지 digest 기록 |
| T1 뼈대/실행 | 45~60분 | compose, apps/web/health, apps/worker, root scripts/AGENTS | 같은 이미지 Web/Worker 시작, readiness, 핵심 경계 lint 설정. 위반 fixture 전수 시험은 P1 |
| T2 DB/인증/정책 | 60~90분 | contracts, core/authz, server/auth/db/repositories, migration/seed | OIDC 두 계정, active/scope/field matrix, 실제 PostgreSQL migration 2회/seed 2회 안전 |
| T3 사원 Service | 60~75분 | core/employees, employee repository, query/batch Routes | 혼합 조직 batch 전체 거부, rowVersion 경쟁, 같은 requestId 재전송/동시 요청, 성공/거부 감사 |
| T4 UI/Grid | 60~75분 | ui/tokens, grid, web/employees/login/audit, DESIGN.md | 디자인 기준, 2개 모드, insert/update/delete 상태, 실패 입력 보존, 미저장 경고, 1366/1440 화면 |
| T5 파일 | 45~60분 | core/files, server/storage, upload/download Routes | fs roundtrip, 경로/marker 방어, fixture 면제, 임의 파일 격리. 전체 취소/rename fault matrix는 P1 |
| T6 Export/PDF | 60~90분 | core/exports, server/jobs/reports, worker handlers | 실제 xlsx/pdf, 재시도 결과 하나, 실행/다운로드 시 권한 회수, 한글/페이지 검증 |
| T7 전체 검증/인계 | 60분 이상 | tests, README, docs/PROGRESS.md, recovery 문서, new-module Skill | 아래 P0 검사 통과, 새 volume 기동, check/test/e2e/build, 화면/파일 검토, P1 후속 기록 |

T0/T1/T2/T3은 한 구현자가 소유한다. 계약이 고정된 뒤만 UI(T4)와 파일(T5)을 분리할 수 있다. 패키지/lockfile/schema/contracts/compose 변경은 통합 담당자 한 명만 한다. 같은 파일을 여러 모델이 동시에 수정하지 않는다.

저렴한 모델 한 명의 순차 구현을 기본으로 한다. 모델이 두 번 같은 실패를 반복하거나 인증/트랜잭션 계약을 바꾸려 하면 오류/명령/관련 diff를 묶어 상위 모델에 진단을 요청한다. 전체 문서를 매번 다시 설계시키지 않는다. 실제 가격 비교는 하지 않았으며 특정 모델의 비용 우위를 단정하지 않는다.

## 9. 검증 가능한 인수 기준

| ID | 검사 | 증거 |
| --- | --- | --- |
| AC01 | fresh Docker volume에서 migrate/seed 후 두 사용자 OIDC 로그인, 알 수 없는/inactive 신원 업무 접근 거부 | e2e/auth + DB 결과 |
| AC02 | admin 24명, manager A 12명. salary는 manager UI/API/query 정렬/필터/Excel/PDF에 없음 | Service 통합 + 산출물 내용 비교 |
| AC03 | 권한 없는 salary write, 타 조직 ID 포함 batch, 허용되지 않은 필드가 모두 거부되고 정상 행도 불변 | DB before/after, 거부 감사 |
| AC04 | 두 세션이 같은 rowVersion 저장 시 한 요청만 성공, 다른 요청 409와 현재 허용 버전 | PostgreSQL 경쟁 테스트 |
| AC05 | insert/update/delete 혼합 batch 실패 후 입력 유지, 수정 후 새 requestId 성공. 응답 유실/동시 재시도는 같은 idMap/version이고 중복 사원 없음 | Grid unit + 통합 + e2e |
| AC06 | 검색/화면 이동 경고, 취소하면 변경 보존, 성공 후 dirty 해제. 마지막 편집값 저장 | e2e |
| AC07 | fs roundtrip/미존재/중복/abort/delete 반복, 경로 탈출/symlink/marker 유실 차단 | Linux fs 통합 |
| AC08 | fixture만 AVAILABLE/WAIVED, 일반 파일 QUARANTINED, 만료/삭제 상태 다운로드 거부, 늦은 검사로 부활 없음 | 상태 통합 + e2e |
| AC09 | DB commit 후 queue 전송 실패/재시도에서도 Export Job이 처리되고 같은 Job 결과는 하나 | fault injection 통합 |
| AC10 | enqueue 후 권한 회수는 DENIED. 생성 후 권한 변경/대상 scope 변경은 다운로드 거부 | Worker/다운로드 통합 |
| AC11 | 두 사용자의 실제 xlsx/pdf에 이름/건수/허용 금액이 일치. PDF 2페이지 이상 fixture의 한글/행 분할/반복 머리글 확인 | 파일 parser 검사 + 첫/마지막 페이지 이미지 |
| AC12 | 성공 변경/롤백/거부/민감 조회 감사의 보존 의미가 맞고 일반 사용자 감사 API는 403 | DB 통합 |
| AC13 | Next/DB/AG/provider 경계 위반 fixture가 검사 실패, Enterprise 전이 의존성 없음 | architecture test + dependency report |
| AC14 | loading/empty/error/forbidden/conflict/retry/dirty 상태, 키보드 조작, 레이블, reduced motion, 외부 요청 기본 off | e2e + axe serious/critical 0, desktop/mobile 캡처 |
| AC15 | lint/typecheck/unit/integration/e2e/build 통과, Web/Worker 같은 이미지, non-root, pool 합산 설정, SIGTERM 정리 | 명령 로그/이미지 ID/process 확인 |
| AC16 | DB+파일 로컬 공동 백업/새 볼륨 복원 script와 절차. 실제 로컬 리허설 성공 또는 미검증 사유를 별도로 기록 | 복구 결과 및 참조 파일 hash 비교 |

오늘 P0 완료선은 AC01~AC06, AC08, AC10, AC12와 다음의 제한된 검사다: AC07의 roundtrip/미존재/delete 반복 및 path/symlink/marker 차단, AC09의 중복 Job 순차 재실행과 publish 상태, AC11의 실제 xlsx/pdf 내용 및 2페이지 한글/페이지 나눔 수동 확인, AC13의 경계 lint와 Enterprise 의존성 목록 확인, AC14의 desktop 상태/키보드/reduced motion/외부 요청 off, AC15의 check/unit/DB 통합/e2e/build 및 같은 이미지/non-root/설정된 pool 합산 확인.

P1은 AC07의 전체 abort/rename fault matrix, AC09의 모든 crash 지점 주입, AC11의 자동 PDF 이미지 회귀, AC13의 위반 fixture/전이 deny 자동화, AC14의 자동 axe와 모바일 전수 캡처, AC15의 종료 fault/pool 실측, AC16의 복구 script/리허설이다. core 기능은 해당 실패를 처리하도록 구현하되 오늘 검증 범위가 제한됨을 보고한다. P1을 통과/skip-pass로 기록하지 않는다. 필수 P0를 충족하지 못하면 '부분 구현'으로 보고한다.

로컬 복구는 Web/Worker 쓰기 중지, 같은 정지 구간의 pg_dump와 파일 archive, 새 compose project/새 volume에 함께 복원, 참조 파일/hash 및 삭제 파일 부활 확인 순서다. 기존 volume을 지우는 reset 명령을 기본 실행에 넣지 않는다. 실제 NAS 무중단 백업을 구현했다고 주장하지 않는다.

## 10. 구현자가 제공할 명령 계약

아래 명령은 구현 완료 시 지원해야 하는 인터페이스다. 지금 실행할 명령 목록이 아니다. tools/test 서비스는 repo mount, Node24/pnpm, 테스트 browser/runtime을 재현 가능하게 제공한다. 오늘은 Docker 내부 Testcontainers를 사용하지 않는다. 별도 Compose test-db와 전용 volume을 사용해 Windows의 sibling container/mount 문제를 피한다. Testcontainers 전환은 P1 후보이며 요구 기능은 실제 PostgreSQL 통합 검사로 유지한다.

test-web/test-worker는 앱과 같은 image, test-db 전용 DSN, test-oidc 전용 issuer를 쓴다. 테스트 네트워크 canonical APP_ORIGIN은 `http://test-web:3000`, issuer는 `http://test-oidc:8080/default`, callback은 `http://test-web:3000/api/auth/callback/local-oidc`다. test 브라우저도 이 URL을 사용한다. test 서비스는 host 포트를 publish하지 않고 local 프로필 DB/파일 volume을 공유하지 않는다. test-db에는 `ax_integration`과 `ax_e2e`를 별도로 만든다. 전자는 통합 테스트가 직접 Service/Worker handler를 호출하고, 후자는 test-web/test-worker와 브라우저가 사용해 배경 Worker와 테스트가 같은 queue를 가로채지 않게 한다. 테스트 setup은 해당 전용 DB만 migration/seed하며 운영/개발 DB 이름에서는 reset을 거부한다. test container에 Docker socket을 주지 않는다.

```powershell
docker version
docker compose version
docker compose --profile local build
docker compose --profile local up -d db oidc
docker compose --profile local run --rm migrate
docker compose --profile local run --rm seed
docker compose --profile local up -d web worker
docker compose --profile test up -d test-db test-oidc test-web test-worker
docker compose --profile local run --rm tools pnpm check
docker compose --profile local run --rm tools pnpm test
docker compose --profile test run --rm test pnpm test:integration
docker compose --profile test run --rm test pnpm e2e
docker compose --profile local run --rm tools pnpm build
```

`check`는 format check, lint, typecheck, 핵심 architecture 검사다. `test`는 unit, `test:integration`은 전용 PostgreSQL과 Linux fs, `e2e`는 고정 synthetic seed의 브라우저 흐름이다. dependency/license 목록을 T0와 완료 시 검토하고 deny 자동화는 P1로 둔다. tool/script 이름은 인계 뒤 바꾸지 말고 필요한 경우 이 문서도 함께 수정한다.

## 11. 위험과 중단 기준

| 위험 | 대응 |
| --- | --- |
| 하루 범위가 과함 | T2 로그인/권한, T4 저장 흐름, T6 실제 출력물을 중간 checkpoint로 둔다. stretch를 먼저 제거한다. 필수 계약이 남으면 미완료라고 보고한다 |
| TS7/Next/도구 API 충돌 | TS7 CLI + TS6 호환 API를 T0에서 검증. 실패 시 근거와 최소 대안 제시, 묵시적 TS5 회귀 금지 |
| OIDC 내부/외부 주소 불일치 | 동일 issuer, browser/Web 양쪽 discovery/JWKS/token 검증. hostname 변경으로 issuer 검증을 끄지 않는다 |
| mock 환경이 운영에 섞임 | local/test profile만 허용, 외부 배포 금지, fixture IdP/파일 면제 감지 시 production 시작 실패 |
| PDF 이미지 과대/메모리 | 브라우저/폰트 고정, 100행/10페이지/30초/동시 1. 메모리 부족은 한도 축소 제안으로 처리 |
| DB 변경/권한 변경 승인 | 후속 코딩 시작 때 계획/의존성/초기 schema를 한 번에 검토 가능한 자료로 제시. 사용자의 승인 범위 밖 변경만 다시 질문 |
| 모델의 과도한 기능 확장 | 각 작업별 대상 파일과 AC를 같이 전달. 범위 paste/급여 엔진/새 backend/프레임워크 교체 금지 |

원문은 매 Phase 승인과 인증/권한/migration/의존성/새 디자인/외부 전송의 사람 승인을 요구했다. 이 계획 작성은 그 구현 승인을 대신하지 않는다. 사용자가 후속 실행 메시지에서 본 계획의 로컬 범위를 일괄 승인하면 같은 내용을 반복 확인하지 않는다. 운영 출고와 범위 밖 변경은 별도다.

## 12. 완료 보고 형식

docs/PROGRESS.md에 작업 ID별 완료/미완료, 변경 파일, 실제 명령/exit code, 실패 원인, AC 결과, 선택 버전과 hash, 화면/파일 증거 위치를 남긴다. README에는 첫 실행, 테스트 계정, 재실행, 로그 확인, 종료 명령, 미구현 운영 조건을 쓴다.

Reference가 생긴 뒤 `.agents/skills/new-module/SKILL.md` 하나를 실제 코드 경로로 작성한다. 전체 9개 Skill(grid-browse, grid-batch-edit, db-migration, file-storage, authz-review, ui-build, ui-review, release-compliance 포함)과 두 번째 교육 신청 모듈 검증은 후속으로 유지한다. 가상의 파일 경로를 가리키는 Skill은 만들지 않는다.

## 13. 계획 검토 기록

독립 검토에서 범위/시간, 멱등 처리, Export snapshot/publish, OIDC 주소, Docker 테스트 구성을 검토하고 수정했다. 마지막에는 ID 명칭과 P0/P1 디자인 검증의 문서 간 모순 두 건을 재확인하여 인계 가능 판정을 받았다. 이는 설계 문서 검토이며 구현 테스트 통과를 의미하지 않는다.

원본 4개 SHA-256 일치, 새 문서의 로컬 링크, 금지 기호/후행 공백, 폐기한 ID 명칭 잔존 검사를 수행했다. 원본은 그대로 두었고 앱 코드는 작성하지 않았다.
