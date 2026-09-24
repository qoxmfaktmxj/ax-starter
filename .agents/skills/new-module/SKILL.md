---
name: new-module
description: Add a new business module to this ax-starter repository after the employee Reference is working. Use when implementing another domain workflow with the same auth, grid, file, export, and audit boundaries.
---

# 새 업무 모듈 추가

먼저 `docs/PROGRESS.md`와 `PRODUCT.md`에서 실제 완료된 Reference 범위를 확인한다. 비교 기준은 `packages/contracts/employees.ts`, `packages/core/authz.ts`, `packages/server/employees/service.ts`, `apps/web/app/api/employees`, `packages/grid/DataGrid.tsx`, `apps/web/app/employees/page.tsx`다. 테스트 위치는 `tests/integration`과 `tests/e2e`다.

새 업무의 행 식별자, 입력값, 상태, 권한, 감사 대상, 출력 필요 여부를 먼저 확정한다. 사원 필드나 HR 역할을 그대로 복제하지 않는다. 계약은 `packages/contracts`, 정책과 업무 규칙은 `packages/core`, DB와 외부 포트 구현은 `packages/server`, HTTP 연결과 화면은 `apps/web`에 둔다. Worker 작업이 필요하면 `apps/worker`에서 현재 actor를 다시 해석하고 `packages/server`의 공개 서비스를 호출한다.

조회와 저장은 서버 Service에서 기능, 행 범위, 필드 read/write/export를 검사한다. 수정 가능한 행은 rowVersion과 원자적 일괄 저장, 요청 ID 멱등성을 검토한다. 실패 저장은 입력을 유지하고 감사의 commit 의미를 구분한다. 파일과 출력이 필요하면 기존 `FileStorage`와 `ReportRenderer` 계약을 활용하되 새 backend나 서식을 근거 없이 추가하지 않는다. Grid 화면은 `DataGrid`의 업무 중립 props만 사용하고 AG Grid 타입을 화면 밖에 노출하지 않는다.

새 모듈의 성공 기준을 해당 API, PostgreSQL 통합 검사, 브라우저 흐름으로 작성한다. `pnpm check`, `pnpm test`, 격리된 test 프로필의 `pnpm test:integration`과 `pnpm e2e`, `pnpm build`를 실제로 실행한다. 미실행 검사와 운영 연결 조건은 `docs/PROGRESS.md`에 남긴다.
