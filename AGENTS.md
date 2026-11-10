# 저장소 작업 규칙

1. 코딩 전에 [진행 기록](docs/PROGRESS.md), [제품 기준](PRODUCT.md), [실행 계획](docs/MVP_PLAN.md)을 읽는다. 현재 코드와 계획이 다르면 근거를 확인하고 차이를 드러낸다.
2. 필요한 부분만 바꾼다. 인접 코드 정리, 추측성 추상화, 빈 기능 버튼, 실패 검사 삭제를 하지 않는다.
3. `packages/contracts`에는 DB, Next, AG Grid 타입을 넣지 않는다. `packages/core`는 서버 구현을 import하지 않는다. UI는 repository를 직접 호출하지 않고 업무 Service/API를 거친다. Worker와 공유하는 파일에는 Next 전용 import를 넣지 않는다.
4. 현재 권한과 행 범위, 필드 권한을 Service에서 판정한다. 요청 ID 멱등성, rowVersion 충돌, 파일 격리, 출력물 재인가, 감사 기록을 화면 숨김으로 대체하지 않는다.
5. 테스트 데이터만 사용한다. fixture OIDC와 파일 면제는 local/test 프로필 밖에서 사용하지 않는다. 외부 AI, 글꼴 CDN, 텔레메트리는 기본으로 연결하지 않는다.
6. 작업마다 성공 기준을 먼저 적고 실제로 실행한 명령과 결과만 [진행 기록](docs/PROGRESS.md)에 남긴다. P1 미실행을 통과로 표기하지 않는다.
7. 사용자에게 보이는 문구와 문서, 주석에 U+00B7, U+2013, U+2014 문자를 쓰지 않는다.
8. 일회성 Docker 검사는 고유한 `-p` Compose 프로젝트 이름으로 실행하고, 검사가 끝나면 프로젝트 이름과 전용 자원인지 확인한 뒤 `docker compose -p <이름> --profile test down --volumes --remove-orphans`로 컨테이너, 네트워크, 테스트 volume을 정리한다. 작업 전용 이미지도 참조 컨테이너가 없는지 확인한 뒤 제거한다. 기본 `ax-starter`의 local DB/파일 volume과 다른 작업의 컨테이너, 공유 이미지는 보존한다. 전역 `docker system prune`은 실행하지 않는다. 검증 증거로 문서에 연결한 `output/` 파일은 보존한다.

## 업무 UI를 추가하거나 바꿀 때

1. 루트 [DESIGN.md](DESIGN.md)를 읽고 작업 대상이 인증, 그리드 업무, 읽기/상세, 입력/설정 중 어디에 해당하는지 정한다. 이전 시안과 다를 때는 현재 제품의 화면 설계에 DESIGN.md를 적용한다.
2. [화면 템플릿](apps/web/app/design-system/page.tsx)에서 메뉴 A(왼쪽) 또는 B(상단)와 관련 표 1~4개의 조합을 고른다. 메뉴, 검색 패널, 버튼, 입력, 표 패널은 [공통 UI](packages/ui/workspace/Workspace.tsx), 페이징과 편집은 [DataGrid](packages/grid/DataGrid.tsx)를 사용한다. 업무별 CSS에 공통 셸이나 디자인 토큰을 복사하지 않는다.
3. 서버가 제공하는 기능, 행 범위, 필드 권한으로 UI를 구성한다. 조회, 저장, 출력 진행 상태와 오류는 실제 요청에 연결한다. 예시 데이터나 시연용 동작이 있으면 화면과 문서에서 구분한다.
4. 공통 규칙을 바꾸면 구현, DESIGN.md, 실행 가능한 예시를 함께 맞춘다. 역할별 동작, 빈 결과, 페이지 경계, 선택 초기화, 키보드, 좁은 화면 중 변경에 해당하는 항목을 검증하고 docs/PROGRESS.md에 결과를 남긴다.
