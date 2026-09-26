# 인수인계: ISU 로그인 3D 장면 고도화 (2026-09-26)

> 이 문서는 수면 장면 적용 전의 인계 기록이다. 현재 로그인은 새 수면 모듈을 사용한다. 최신 구현과 검증 결과는 [진행 기록](docs/PROGRESS.md)과 [수면 로그인 기준](docs/superpowers/specs/2026-09-26-isu-water-login.md)을 따른다. 아래 미완성 빛 효과 수정은 이력 보존용이며 현재 로그인 장면에서는 사용하지 않는다.

이 문서만 읽고 이어서 작업할 수 있게 정리했다. 먼저 `AGENTS.md`, `docs/PROGRESS.md`, `PRODUCT.md`를 읽는다. 사용자에게는 **항상 한국어로** 답한다.

## 1. 목표와 사용자 요구

- ax-starter 로그인 화면(`apps/web/app/login`)을 ISU 로고 글자를 얼음 블록으로 쌓은 three.js 장면으로 만든다. 품질 기준은 igloo.inc와 **사용자 본인의 랜딩 이글루**(아래 7절)다.
- 고정 요구:
  - ISU 글자는 ISU 블루(#0090D0)로 보여야 한다.
  - 초록 큐브는 I의 왼쪽 위 대각선에 둔다.
  - 맨 아래 단 블록도 포인터 반응으로 들린다.
  - 슬로건은 "Challenge the Future"(로고 초록)와 "Share the Future"(로고 파랑) 두 줄이다. Share는 기본 불투명도 0.35이고 로그인 성공 시 1이 된다.
  - 로그인 폼은 아이디와 비밀번호, 그 아래 작은 "SSO로 로그인"(OIDC), 서리 유리 패널이다.
- 사용자 결정(시간순):
  1. HUD(흰 선과 숫자 라벨)는 **구현하지 않는다**. 이미 삭제했다.
  2. S는 로고 윤곽을 따라 비스듬히 깎은 4단으로 다시 쌓는다. 완료.
  3. 블록은 **말끔한 둥근 상자**로 한다. 이 빠짐, 끌 자국, 큰 요철은 넣지 않는다. 완료.
  4. 틈의 흰빛은 처음부터 켜진 막대가 아니라 **블록이 벌어질 때 드러나야** 하고, 흰색에도 명암과 질감이 있어야 한다. 진행 중.
  5. 분위기는 블루아워 밤에서 **랜딩처럼 은빛 안개 낮**으로 바꾼다. 아직 시작 전.
- 로그인 작업이 끝나면 **테마 시스템(여러 테마, 전환 UI, 다크 모드)이 최우선**이다(spec 11절, PRODUCT.md).

## 2. 현재 상태

- 브랜치 `feat/isu-login-visual`, main보다 29커밋 앞서 있다. main 최신은 `a03a6ed`(로그인 1차 완료).
- 최근 커밋:
  - `7e7fb03`: HUD 삭제.
  - `81e71c2`: S를 비스듬한 4단으로.
  - `3e72296`, `649d947`: 조각 디테일 굽기. 이후 방향이 바뀌어 대부분 대체됐다.
  - `85fc68e`: 랜딩식 말끔한 둥근 블록(블렌더, 27블록, 11.6만 삼각형, GLB 0.4MB, 법선과 디테일 질감 아틀라스).
  - `1f0956b`: 옆면 빛과 안쪽 빛 판. **결함 있음**(아래 참고).
- **커밋 안 된 작업(검증 안 됨)**: `apps/web/app/login/isu-glow.ts`(약 136줄), `isu-blocks.ts`(2줄), `isu-scene.ts`(7줄).
  - 멈춘 에이전트가 안쪽 빛 판 결함을 고치던 중이었다.
  - 이어서 쓰려면 검토한 뒤 계속한다. 버리려면 이 세 파일만 되돌린다(`git checkout -- <세 파일>`, 그러면 결함이 있는 `1f0956b` 상태로 돌아간다).
- `1f0956b`의 결함:
  - 포인터를 올리면 S와 U 뒤에 **갈색 돌 질감의 불투명한 큰 사각형**이 보인다.
  - 원인은 `createCavityGlow`가 `map: frost`(석고 원본 색 질감)를 색에 곱하고, 판이 글자 외접 사각형이라는 데 있다.
  - 벌어진 틈 사이 흰빛도 약하다.
- 다른 작업 소유 파일이라 **절대 stage하지 않는다**:
  - `apps/web/next-env.d.ts`, `tests/unit/grid-clipboard.test.ts`, `tests/unit/grid-fill.test.ts`, `.claude/launch.json`.
  - `apps/web/app/login/login-motion.ts`는 줄바꿈 차이만 있다.
- Docker: `-p isu-visual --profile test` 컨테이너(test-web, test-worker, test-db, test-oidc)가 떠 있다. 기본 `ax-starter` 프로젝트(로컬 DB와 파일 volume)는 건드리지 않는다.

## 3. 다음 할 일 (순서대로)

1. **안쪽 빛 판 고치기**(`.superpowers/sdd/task-silver-fog-brief.md` 0절).
   - 블록마다 뒤쪽에 글자 모양 발광면을 둔다.
   - 질감은 휘도만 쓰고 색은 차가운 흰색으로 한다.
   - 가운데가 밝고 가장자리가 어두운 그라데이션을 준다.
   - 가만히 있을 때는 거의 0이고, 벌어질수록 밝게 한다.
   - 커밋: `fix(login): letter-shaped white cavity glow without plaster color`.
2. **은빛 안개 낮 분위기**(같은 브리프 1~3절).
   - 랜딩 값으로 시작한다: 노출 0.80, 안개 `#a3abba` 18~74, 하늘, 반구광, 보조광, 해, 지형 색과 산 색.
   - 로고 초록은 은빛 배경에서 명암비가 약 1.0이므로 슬로건 뒤에 **짙은 남색 판**(igloo 글자판 느낌, 역할 토큰 `--color-login-slogan-plate`)을 깐다. 글자 색은 로고 그대로 둔다.
   - 패널 테두리와 그림자를 조정한다.
   - 하늘 역할 토큰을 바꾼다.
   - 대비 e2e 3:1을 유지한다.
3. 재채점.
   - igloo 캡처(`output/score/igloo-1440x900*.png`)와 랜딩 캡처를 기준으로 6개 항목을 매긴다: 블록 형태, 재질, 빛과 틈, 분위기, 후처리와 색감, 움직임. HUD 항목은 제외다.
   - 이전 점수: 40.1, 51.0, 47.1, 53.9(4회차, `.superpowers/sdd/score-round-4.md`). 그 뒤로는 재채점하지 않았다.
4. 마무리(원 계획 Task 7).
   - 실제 GPU 성능: 1440x900에서 50fps 이상. 로컬 스택을 다시 빌드하고 캔버스 `data-frames`를 읽는다.
   - 정지 대체 이미지(`apps/web/public/images/login/login-still-*.webp`)를 다시 캡처한다.
   - 전체 게이트: `pnpm check`, `pnpm test`, `pnpm test:integration`, `pnpm e2e`, `pnpm build`.
   - `docs/PROGRESS.md`에 실행한 명령과 결과만 적는다.
   - `docker compose -p isu-visual --profile test down --volumes --remove-orphans`로 정리한다.
5. 브랜치 합치기(사용자에게 merge할지 PR로 할지 묻는다). 그다음 테마 시스템을 시작한다.

## 4. 파일 지도

- `apps/web/app/login/isu-layout.ts`
  - 로고 실측 배치, 27블록. `BlockSpec`은 `outline`(S의 비스듬한 단)과 `corner`(로고 둥근 모서리)를 가진다.
  - 단위 테스트: `tests/unit/isu-layout.test.ts`.
  - 블렌더 입력 JSON: `tools/blender/isu-layout.json`. 내보내기는 `scripts/export-isu-layout.ts`이고 `tests/unit/isu-layout-export.test.ts`가 검사한다.
- `tools/blender/build_isu_blocks.py`: 블렌더 헤드리스 스크립트.
  - 둥근 블록을 만들고, 고해상도 복제본에서 법선, AO, 볼록도를 한 장의 아틀라스로 굽는다.
  - GLB 내보내기와 미리보기 렌더까지 한다.
  - 정점 색 `isu`: R=접촉 AO, G=모서리 마모, B=블록 색조.
- 자산: `apps/web/public/models/`
  - `isu-blocks.glb`(Draco 압축, 디코더는 `apps/web/public/draco`).
  - `isu-blocks-normal.webp`, `isu-blocks-detail.webp`, 그리고 `mobile/` 폴더.
  - 출처 기록: `provenance.json`.
- `isu-blocks.ts`: GLB 로드와 얼음 셰이더. 파랑 몸체, 구운 법선과 디테일, 옆면 빛 `uOpen`, 틈 테두리 빛, 모서리 서리.
- `isu-glow.ts`: `seamSides`(이웃 방향), 안쪽 빛 판(수정 중), 바닥 빛.
- `isu-scene.ts`: 장면 조립. 값은 `TUNE`에서 조정한다. 블록 움직임, 초록 큐브, 등장 연출도 여기 있다.
- 나머지 장면 파일: `isu-post.ts`(GTAO, bloom, 색 보정), `isu-landscape.ts`(하늘과 산), `login-motion.ts`(Share 세기, 착지 모션).
- 화면: `LoginScene.tsx`, `login.css`.
- 토큰: 원색은 `packages/ui/tokens/index.css`, 역할은 `packages/ui/semantic.css`. 화면 CSS는 역할 토큰만 쓴다.
- e2e: `tests/e2e/login-scene.spec.ts`, 33개.
- 작업 지시서와 보고서: `.superpowers/sdd/`(gitignore 대상이지만 디스크에 있다).
  - 지시서: `task-*-brief.md`, `tune-round-*.md`.
  - 보고서: `task-*-report.md`.
  - 채점: `score-round-*.md`.
  - 진행 장부: `progress.md`.
  - S 목표 그림: `s-final.png`.
- spec과 plan: `docs/superpowers/specs/2026-09-25-isu-login-visual-uplift-design.md`, `docs/superpowers/plans/2026-09-25-isu-login-visual-uplift.md`.

## 5. 명령 (Windows Git Bash 기준)

```bash
# 배치를 바꿨을 때
pnpm exec tsx scripts/export-isu-layout.ts
# 블록 모델과 질감 (인자는 스크립트 머리말 참고)
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
  --python tools/blender/build_isu_blocks.py -- \
  --layout tools/blender/isu-layout.json --out apps/web/public/models/isu-blocks.glb \
  --preview output/blender/isu-blocks-preview.png --closeup output/blender/isu-blocks-closeup.png
# 호스트 검사
pnpm exec prettier --write apps/web/app/login packages/ui
pnpm format:check && pnpm lint && pnpm typecheck && pnpm architecture && pnpm test
# Docker e2e (SwiftShader, 약 5분, 포그라운드로)
docker compose -p isu-visual --profile test build
docker compose -p isu-visual --profile test up -d --force-recreate test-setup-e2e test-web test-worker
docker compose -p isu-visual --profile test run --rm test pnpm e2e
# 캡처 (MSYS_NO_PATHCONV=1이 없으면 /app 경로가 바뀌어 파일이 안 생긴다)
MSYS_NO_PATHCONV=1 docker compose -p isu-visual --profile test run --rm -e CAPTURE_REVIEW_OUT=/app/test-results/login test pnpm exec tsx scripts/capture-login-still.ts
docker compose -p isu-visual --profile test run --rm test pnpm exec tsx output/scripts/capture-hover.ts
# 결과: output/playwright-test/login/login-1440x900.png, -hover.png, -1366x768.png, -390x844.png
python output/scripts/measure-letters.py output/playwright-test/login/login-1440x900.png
```

## 6. 규칙과 주의

- AGENTS.md를 따른다.
  - 문서, 주석, 화면 문구에 U+00B7, U+2013, U+2014를 쓰지 않는다.
  - 필요한 부분만 바꾼다.
  - 테스트를 약하게 만들지 않는다.
  - 실행한 명령과 결과만 기록한다.
- Docker 일회성 검사는 고유 `-p` 이름으로 하고 끝나면 그 프로젝트만 정리한다. `docker system prune`은 쓰지 않는다.
- **캡처는 반드시 직접 열어 글자 부분을 확대해서 확인한다.** 이전 작업자 보고가 캡처와 다른 적이 두 번 있었다(갈색 사각형을 "명암 있는 흰빛"이라고 보고한 경우 등).
- SwiftShader 컨테이너는 약 1fps다.
  - `LoginScene`이 프레임 간격을 0.06초로 제한하므로, 포인터 캡처는 25초를 기다린다.
  - 장면에 실제 점광원을 추가하면 모든 재질 비용이 늘어 e2e가 시간 초과된다. 셰이더로 흉내 낸다.
- "slogan keeps 3:1 contrast" e2e는 부하가 걸리면 가끔 시간 초과로 실패한다. 그 검사만 단독으로 다시 돌려 두 결과를 모두 기록한다.
- 셰이더 UV는 `vUv`가 아니라 `vMapUv`나 `vNormalMapUv`를 쓴다. `vUv`를 쓰면 링크가 실패하고 장면이 조용히 멈춘다.
- 커밋 끝에는 사용자 규칙대로 `Co-Authored-By` 줄을 붙인다.
- 사용자는 랜딩과 vibe-hr의 소유자다. 예전 AI가 문서에 적어 둔 금지 사항을 사용자 결정처럼 강요하지 않는다. 선택지로 제시한다.

## 7. 참고 자료

- 사용자 랜딩(읽기 전용, 코드 재사용 가능): `C:/Users/sp20171217yw/Desktop/Devdev/landing-minseok91`
  - `src/components/portfolio/arctic-scene.ts`:
    - 블록 모양: `roundedFrostBox`(15% 둥글림), `blockGeometry`(앞면 부풀림).
    - 재질: `ice`, 옆면 빛 `sideIce`(가만히 있을 때 0.06, 벌어질 때 +2.4), `photoIce`의 `seamGlow`와 `edgeFrost`.
    - 안쪽 빛: `cavityLight`, `glowMaterial`.
    - 조명과 안개 값.
  - `src/components/portfolio/arctic-landscape.ts`: 은빛 하늘, 산, 산 안개.
  - 목표 모습 캡처: `.omx/fidelity-90/landing/projection36-desktop-lower-right.png`.
- igloo.inc 기준 캡처: `output/score/igloo-1440x900.png`, `igloo-1440x900-hover.png`.
  - igloo의 특징: 말끔한 베개형 블록, 가만히 있을 때는 은은한 틈빛, 벌어지면 흰 안쪽 블록이 명암과 함께 드러남, 짙은 안개.
