# AX Starter 로컬 MVP

가상 사원 데이터로 로그인, 권한별 조회, 일괄 수정, 첨부, Excel/PDF 출력, 감사를 한 화면 흐름에서 확인하는 로컬 Docker 앱이다. 실제 사내 계정이나 실데이터를 연결하지 않는다.

## 처음 실행

Windows Docker Desktop의 Linux 엔진을 켠다. 저장소 루트에서 다음 명령을 순서대로 실행한다.

```powershell
docker version
docker compose version
docker compose --profile local build
docker compose --profile local up -d db oidc init-files
docker compose --profile local run --rm migrate
docker compose --profile local run --rm seed
docker compose --profile local up -d web worker
```

브라우저에서 [로컬 로그인](http://host.docker.internal:3000/login)을 연다. 테스트 로그인 화면의 subject에 `hr-admin` 또는 `org-manager`를 입력한다. `inactive-user`와 등록되지 않은 subject는 로그인 후에도 업무 접근이 거부된다. 초기 데이터는 A/B 조직 각 12명이다. 첨부의 다운로드 가능 상태를 시험하려면 [고정 가상 PNG](tests/fixtures/local-allowed.png)를 올린다. 일반 업로드는 검사기가 없으므로 격리된다.

사원관리의 일괄편집은 최대 100행이다. 셀을 드래그해 범위를 선택하고 Ctrl+C, Ctrl+V로 복사와 붙여넣기를 사용한다. 선택 끝의 점을 드래그하면 날짜와 금액 문자열 등을 채운다. 실행 취소와 다시 실행은 저장 전 초안에만 적용된다. 조회형에서는 현재 불러온 행을 복사할 수 있지만 붙여넣기는 할 수 없다.

서비스 상태와 로그:

```powershell
docker compose --profile local ps
docker compose --profile local logs --tail 100 web worker oidc db
```

마이그레이션과 시드는 다시 실행해도 기존 사원을 중복 생성하지 않는다. 로컬 DB나 파일 volume을 기본 명령에서 삭제하지 않는다. 종료할 때는 `docker compose --profile local stop`을 사용한다.

## 검사

```powershell
docker compose --profile local run --rm tools pnpm check
docker compose --profile local run --rm tools pnpm test
docker compose --profile test build test-web test
docker compose --profile test up -d test-db test-oidc test-web test-worker
docker compose --profile test run --rm test pnpm test:integration
docker compose --profile test run --rm test pnpm e2e
docker compose --profile local run --rm tools pnpm build
```

통합 테스트는 `ax_integration`, 브라우저 테스트는 `ax_e2e` DB와 별도 파일 volume을 쓴다. 통합 검사 명령은 다른 DB 이름에서 실행을 거부한다. 테스트 컨테이너에 Docker socket을 넣지 않는다. 실제 결과와 남은 검증은 [진행 기록](docs/PROGRESS.md)을 확인한다.

## 범위

Web와 Worker는 같은 Node 24 runtime 이미지를 다른 명령으로 실행한다. 운영 IdP/NAS/S3/악성코드 검사기, 실제 AI API, 두 번째 업무 모듈, 판매용 구성은 연결하지 않았다. 상태별 파일 다운로드와 출력물 다운로드는 현재 업무 권한을 다시 확인한다. 실제 운영과 판매 전 조건은 [제품 기준](PRODUCT.md), [의존성 기록](docs/DEPENDENCIES.md), [복구 절차](docs/RECOVERY.md)에 남겼다.
