# ISU 로그인 시각 작업 인계

기준일: 2026-09-27. 저장소: `C:/Users/sp20171217yw/Desktop/Devdev/ax-starter`.

## 먼저 알아둘 현재 상태

- 시각 구현의 기준 커밋은 `26b73c8e13b01716583d1d2e8ea90f6fbc4b0588`, 이를 기록한 문서 커밋은 `3bad3832977c53ab694449fcf959a85cee8fe5d6`이다. 작성 직전 로컬 및 원격 `main`은 `3bad383`으로 일치했다. 이 인계 문서 자체가 이후 커밋되더라도 시각 코드의 기준은 위 두 커밋이다.
- 현재 PC의 확인용 로그인은 `http://127.0.0.1:18700/login`이다. Docker 프로젝트는 `ax-water-demo-20260926`, Web와 Worker 이미지 ID는 `sha256:304fb0e9d06931221e78698c2ed244b41b414a794927f7250989eafdc10810d3`다. 로컬 DB와 파일 volume을 재생성하지 않았다.
- 사용자는 현재 화면에서 마음에 들지 않는 부분을 다른 작업에서 수정하려 한다. 어느 부분인지는 아직 특정하지 않았다. 새 작업은 화면과 아래 제약을 확인한 뒤 사용자의 구체적인 지적에 맞춰 좁게 수정한다.

## 현재 화면과 결정

- ISU는 Blender에서 만든 26개 둥근 블록이다. S의 위아래를 잇는 사선은 세 블록이다. 파랑과 초록의 기준색은 공식 CI RGB인 `#008FD4`, `#99CA3C`다. 푸른 블록에는 매끄러운 틴팅 유리 재질과 부드러운 반사를 사용한다. 초록 점은 화면에서 색을 유지하려고 불투명하게 표현한다.
- `Challenge the Future`와 `Share the Future`는 로그인 카드 위의 일반 HTML 텍스트다. 글자색은 분위기나 로그인 성공에 따라 바뀌지 않는다. Share는 처음부터 완전히 보이고 성공 시 따로 반짝이지 않는다. 마우스를 올린 글자 안쪽에만 작은 광택이 나타난다. 3D 글자와 글자의 수면 반사는 쓰지 않는다.
- 장면은 첫 진입만 무작위다. 이후 청록 일출 `06`, 푸른 낮 `10`, 노을 `05`, 라벤더 잔광 `04`, 비 오는 저녁 `09`, 흑요석 밤 `08` 순서로 돈다. 각 장면은 15초 유지하고 다음 장면으로 5초 전환한다.
- 해는 일출에서 수평선 아래로부터 올라와 낮에 높아지고, 노을 장면에서 다시 수면 아래로 내려간다. 해의 위치에 따라 ISU 방향광과 물 위의 잘게 끊어진 빛길이 함께 달라진다. 수면은 방향성 포인터 자취와 거리별 반사 흐림을 사용한다. 블록에 마우스를 올리거나 터치하면 해당 위치의 작은 빛이 반응한다.
- 모션 감소 설정, WebGL 실패, 초기 로딩에서는 별도 WebP 정지 이미지를 사용한다. 정지 이미지에는 로그인 폼이나 HTML 슬로건이 그려져 있지 않다. 인증과 업무 권한 코드는 이번 시각 작업의 범위 밖이었다.

## 수정할 때 찾을 파일

| 영역 | 경로 |
| --- | --- |
| 장면 순서, 15초 및 5초, 해의 궤도 | `apps/web/app/login/isu-water-moods.ts` |
| 하늘, 블록 조명, 포인터, 카메라 | `apps/web/app/login/isu-water-scene.ts` |
| 물의 반사와 햇빛 질감 | `apps/web/app/login/isu-water.ts` |
| 터치 이벤트와 WebGL 대체 | `apps/web/app/login/LoginScene.tsx` |
| 슬로건과 로그인 배치 | `apps/web/app/login/LoginSlogan.tsx`, `login.css`, `page.tsx` |
| 블록 형태와 Blender 재현 | `apps/web/app/login/isu-layout.ts`, `tools/blender/build_isu_blocks.py`, `apps/web/public/models/` |
| 정지 이미지와 출처 | `apps/web/public/images/login/` |
| 색상 기준 | `packages/ui/tokens/index.css`, `packages/ui/semantic.css` |
| 관련 검사 | `tests/unit/isu-water-moods.test.ts`, `tests/e2e/login-water.spec.ts`, `tests/e2e/login-scene.spec.ts` |

## 참고 자료와 재현 한계

- 같은 PC의 `output/water-light-20260927/`에 `sunrise.png`, `day.png`, `sunset.png`, `mobile-sunset.png`, `hover-glint.png` 및 검사 로그가 있다. Blender 재질 비교와 `.blend`는 `output/blender-mcp-20260927/`에 있다. `output/`은 Git에서 무시되므로 다른 체크아웃에는 없다. 필요한 캡처는 따로 복사해야 한다.
- 사용자가 제공한 물, 해, 수평선 사진 세 장은 `C:/Users/sp20171217yw/Downloads/참고이미지/`에 있다. 사진의 풍경과 워터마크는 제품 자산에 복사하지 않았다. 공식 색상 근거는 `https://www.isu.co.kr/kor/prcenter/ci.jsp`와 사용자가 다운로드한 CI PDF다.
- Blender MCP는 이 PC의 `output/blender-mcp-20260927/`에 격리 설치해 사용한 뒤 종료했다. 전역 Codex MCP 설정은 바꾸지 않았다. GLB에는 투과, IOR, 코팅이 들어 있지만 Blender의 SSS는 glTF로 전달되지 않는다. 브라우저 화면은 Blender Cycles 렌더와 픽셀 단위로 같지 않다.
- 수면은 실시간 셰이더이며 사진처럼 완전한 유체 시뮬레이션은 아니다. 스튜디오 반사가 물에 일부 밝은 형태로 남을 수 있다. 실제 사용자 GPU의 fps는 측정하지 않았다. 밝은 장면에서 고정된 공식 초록 문구의 대비는 별도 재검토가 필요하다. 이 내용은 사용자가 지금 싫어하는 부분이라고 확정한 것이 아니다.

## 검증 상태와 로컬 변경 보존

- 마지막 시각 코드에서 `pnpm check`가 통과했고 단위 검사 8개 파일 35개가 통과했다. Docker production 빌드도 통과했다. 포인터 및 모바일 배치 2개, 터치 수정 후 재검사 1개, 낮과 밤의 로그인 전후 및 정지 가독성 3개가 관련 Playwright 검사에서 통과했다. 마지막 상태의 전체 e2e를 실행한 것으로 표시하지 않는다. 상세한 실패와 재검사 로그는 `docs/PROGRESS.md` 마지막 시각 작업 절에 있다.
- 이 PC의 `codex/dom-login-slogan` 작업 폴더에는 다른 작업 소유의 미커밋 파일 다섯 개가 남아 있다: `apps/web/app/login/login-motion.ts`, `apps/web/next-env.d.ts`, `tests/unit/grid-clipboard.test.ts`, `tests/unit/grid-fill.test.ts`, `.claude/launch.json`. 시각 작업 푸시에서 제외했고 원래 SHA-256을 보존했다. 새 작업도 임의로 stage, 수정, 삭제하지 않는다.
- 일회성 Docker 검사는 `AGENTS.md` 규칙대로 고유한 Compose 프로젝트 이름을 쓰고 전용 자원만 정리한다. 확인용 `ax-water-demo-20260926`의 DB와 파일 volume 및 다른 작업의 컨테이너는 보존한다.

## 다른 작업에서 시작할 메시지

`docs/LOGIN_VISUAL_HANDOFF_2026-09-27.md`와 `docs/PROGRESS.md` 마지막 절을 먼저 읽고 현재 `/login`을 확인해 주세요. 내가 마음에 들지 않는 부분을 이어서 지목하겠습니다. 지목한 시각 요소와 직접 관련된 파일만 수정하고, 다른 로컬 미커밋 파일과 확인용 Docker 데이터는 보존해 주세요.
