# Enterprise AI Starter

<!-- impeccable:product-schema 1 -->

기준일: 2026-09-24. 제품명은 `AX Starter`(과거 임시 코드명 `gyeol`), 저장소 이름은 `ax-starter`다. 로컬 MVP 구현과 검증 현황은 [진행 기록](docs/PROGRESS.md)에 남긴다.

## Platform

web

## Stack

제공된 착수 지시서가 정한 Next.js App Router 모듈러 모놀리스와 같은 TypeScript 코드베이스의 별도 Worker를 유지한다. PostgreSQL, Drizzle, Better Auth/OIDC, pnpm workspace, AG Grid Community, 자체 UI/Grid 경계, Docker Compose를 사용한다. 정확한 채택 버전은 구현 첫 단계의 호환성 검증과 lockfile로 확정한다.

## Users

- Starter를 확장하는 사내 개발자와 AI Coding Agent.
- 요청한 업무를 처리하는 사내 담당자. 첫 Reference는 사원관리 담당자와 조직 단위 담당자다.
- 작성자는 Oracle, Tibero, PL/SQL, Java/Spring MVC, MyBatis, JSP 및 한국 급여 업무 경험을 갖고 있다. Starter는 이 업무 지식을 빠르게 화면과 검증 가능한 서비스로 만드는 기반이다.

## Product Purpose

현업 요청을 수 시간에서 수일 안에 동작하는 업무 시스템으로 만드는 재사용 기반을 마련한다. 상용 폐쇄형 Grid/리포트 컴포넌트와 특정 런타임에 묶이는 상황을 반복하지 않는다.

2026-09-24 사용자가 확인한 완료 기준은 **로컬 Docker에서 가상 데이터로 핵심 업무 흐름 완성**이다. 처음 작성한 계획을 바탕으로 로컬 앱을 구현하고 있으며, 완료 여부는 실제 검사 결과로 판단한다.

## Operating Context

사내 프로토타입, 회사 공통 플랫폼, 고객별 독립 설치/납품 순서로 발전시킨다. 오늘의 MVP는 실제 임직원 데이터, 사내 IdP/NAS 인증, 외부 공개 배포, 판매 가능한 제품의 완성을 뜻하지 않는다.

첫 시나리오는 두 사용자의 로그인, 권한별 사원 조회, 필드 수정, 동시 수정 충돌, 일괄 저장 실패/재시도, 첨부파일 상태, Worker의 Excel/PDF 생성, 결과 다운로드, 감사 기록 확인이다. 프로그램 결과물과 보안 경계는 실제 코드로 검증하고 데이터와 외부 환경만 테스트용으로 대체한다.

## Capabilities and Constraints

| 유지할 결정 | 적용 방식 |
| --- | --- |
| 업무 Service에서 인가 | 화면, Route, Worker, 향후 AI Tool이 같은 정책을 호출한다 |
| 실행 문맥과 트랜잭션 분리 | 서버가 ExecutionContext를 만들고 원자적 변경에만 TransactionalContext를 사용한다 |
| 기능/행/필드 권한 | 필드 read/write/export를 분리한다. 화면 숨김만으로 보호하지 않는다 |
| 데이터 일관성 | 수정 가능한 업무 테이블에 row_version, numeric은 문자열 decimal, 버전/시행일이 있는 끝수 정책 |
| 파일 교체 가능성 | FileStorage와 fs 기본 구현, backend 식별자와 불변 키, 검사 상태. 최소 S3 어댑터는 후속 |
| Grid 교체 가능성 | 자체 DataGrid 계약만 화면에 노출, browse와 batch-edit를 분리 |
| 출력물 교체 가능성 | 버전 있는 데이터/서식과 ReportRenderer, 대표 사원명부 PDF 하나 |
| 외부 AI | 기본 off. 외부 계정 없이 오늘 흐름을 검증한다. 실제 AI 기능 완료를 주장하지 않는다 |
| 고객 설정 | 서버 런타임 설정. 고객별 값은 NEXT_PUBLIC_*에 넣지 않는다 |
| 폐쇄망 고려 | 외부 폰트/CDN/텔레메트리 전송을 기본 비활성화한다 |
| 코드 출처 | Vibe HR은 시각/동작 참고만 한다. B2/B4 정리 전 코드나 자산을 복사하지 않는다 |

오늘 만들지 않는 것은 급여 계산 엔진, 결재 엔진, 전체 인사 제품, 범용 ACL/플러그인 엔진, 리포트 디자이너, 멀티테넌트, 다국어, Dark Mode, 대규모 Excel 업로드, RAG/MCP/Agent, 중앙 AI Gateway, 실제 외부 LLM 연결, Keycloak, Valkey/BullMQ, 관측 서버 묶음, Kubernetes, 판매용 패키지다.

## Brand Commitments

사용자가 지정한 디자인 원본은 최신 `landing-minseok91`과 `vibe-hr` 저장소다. 기존 화면에서 시각 언어와 업무 동작을 추출하고 새 코드로 구현한다. 디자인 근거와 선택지는 [디자인 계획](docs/DESIGN_BRIEF.md)에 보존한다. 3D 장면, 무거운 모션, 기존 브랜드 로고를 Starter로 복사하지 않는다.

한국어 업무 문구를 사용한다. 응답, 문서, 코드 주석에는 U+00B7, U+2014, U+2013을 사용하지 않는다.

## Evidence on Hand

- 네 원본 문서를 검토했다. 제목의 v4보다 `kickoff`가 후속 문서다. kickoff 6행은 3차 리뷰 반영과 우선순위를 명시한다.
- 2026-09-24 두 디자인 저장소에서 `git pull --ff-only`를 실행하고 HEAD와 origin/main 일치를 확인했다. 기존 untracked 파일은 유지했다.
- 계획 작성 시 앱 코드와 lockfile은 없었다. 현재 로컬 앱 코드와 lockfile이 있다. 회사 IdP 정보, 실 NAS, 실제 고객 계약, AI API 계약은 이 저장소에 없다.
- 원본 네 파일은 삭제하지 않았다. 파일명, 해시, 결정 계보와 외부 근거는 [출처 기록](docs/SOURCE_RECORD.md)에 남긴다. 원본이 삭제돼도 구현은 이 파일과 docs의 계획으로 진행할 수 있다.

## Product Principles

1. 한 업무 흐름을 끝까지 구현한 뒤 화면 종류를 늘린다.
2. 권한, 데이터 정확성, 재시도 의미는 속도를 이유로 생략하지 않는다.
3. 재사용은 실제 Reference를 바탕으로 추출한다. 추측성 공통 플랫폼은 만들지 않는다.
4. 운영 전 조건과 판매 전 조건을 보존하되 로컬 MVP의 완료 조건과 구분한다.
5. 완료 보고는 실제 실행한 명령과 결과에 근거한다. 미실행 검사는 미검증으로 기록한다.

## 향후 단계와 미해결 사항

| 단계 | 남길 요구사항 |
| --- | --- |
| Reference 다음 | Saved View 버전/권한 복원, 컬럼 설정/컨텍스트 메뉴, 단일 셀 복사/붙여넣기, 전체 Skill 목록, 교육 신청 두 번째 모듈 |
| 실제 데이터 전 | 실제 IdP 계정 차단 전파/세션 취소 시험, 악성코드 검사 또는 승인된 대체 통제, NFS/SMB별 검증, NAS 단절 시험, DB/파일 공동 복원, 전송 목록과 관측 수신자 확정 |
| 회사 플랫폼 전 | B2 자체 코드 권리, B4 AG Grid 자산/출처 감사 |
| 판매 전 | B1 판매 주체, B2 코드 권리, B3 AI 공급자 계약, B4 자산 감사, B5 전체 납품물 라이선스 심사, B6 고객 데이터 처리 구조 |
| 판매 구조 | 플랫폼 private package + 고객 저장소, 고객별 독립 배포, 공통코드 의미 코드 매핑, 공통/고객 마이그레이션 순서, 확장 지점, 오프라인 복구 가능한 전체 납품물 |
| 나중 | 고처리량 큐, 리포트 디자이너, 결재 엔진, RAG, 중앙 AI Gateway, 관측 서버, 다법인/멀티테넌트 별도 검토 |

## 읽는 순서

구현자는 [진행 기록](docs/PROGRESS.md), [코딩 인계서](docs/CODING_HANDOFF.md), [MVP 실행 계획](docs/MVP_PLAN.md), [디자인 계획](docs/DESIGN_BRIEF.md) 순서로 읽는다. 정책이나 버전 판단이 필요할 때 [출처 기록](docs/SOURCE_RECORD.md)을 확인한다.
