# 로컬 MVP 의존성 기록

기준일: 2026-09-24. 정확한 선택은 `package.json`, `pnpm-lock.yaml`, `Dockerfile`, `compose.yaml`에 고정했다. 이 문서는 현재 설치 결과와 로컬 실행 판단을 기록한다.

| 구성                         | 채택                                                         | 확인 내용                                                                                                      |
| ---------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Node                         | 24.21.0 컨테이너                                             | 호스트 Node 22 설정은 변경하지 않음                                                                            |
| pnpm                         | 10.33.0                                                      | `minimumReleaseAge: 1440`, lockfile SHA-256 `7C585D45E5E1CBD76CABD215D9D0E64AC58214BFC61FEF878DFC2D843357111B` |
| TypeScript                   | native CLI 7.0.2, 도구 API용 `@typescript/typescript6` 6.0.2 | `tsc --version`은 7.0.2, 설치된 6 패키지 manifest는 6.0.2이며 `tsc6 --version` 출력은 6.0.3                    |
| Next, React                  | 16.3.6, 19.3.0                                               | Node 24 컨테이너 `next build` 통과. 로컬 프로필로 빌드                                                         |
| PostgreSQL                   | 18.6                                                         | 개발 DB와 통합, 브라우저 테스트 DB를 분리                                                                      |
| Drizzle ORM, kit, pg         | 0.45.3, 0.31.11, 8.23.0                                      | 실제 PostgreSQL migration 및 반복 실행 확인                                                                    |
| Better Auth, Drizzle adapter | 1.7.5, 1.7.5                                                 | 같은 버전 `auth` CLI에서 인증 schema 생성. Generic OAuth discovery, ID token 검증, nonce, PKCE 사용            |
| AG Grid Community, React     | 36.2.0, 36.2.0                                               | Enterprise 패키지 미도입                                                                                       |
| Base UI                      | 1.8.0                                                        | 일괄편집 이동 확인 Dialog에 사용                                                                               |
| pg-boss                      | 12.33.0                                                      | 12.34.0은 설치 시점에 24시간 최소 공개 기간을 충족하지 않아 제외                                               |
| ExcelJS, Playwright          | 4.4.0, 1.63.0                                                | 실제 xlsx, PDF 생성. Chromium 153.0.8010.12                                                                    |
| Vitest, ESLint               | 5.0.1, 9.39.1                                                | ESLint TypeScript 플러그인은 8.70.1로 TS6 peer 범위 확인                                                       |
| 로컬 글꼴                    | Pretendard v1.3.9, Geist Sans v1.7.2                         | 출처, SHA-256, OFL 전문은 [FONTS.md](FONTS.md)                                                                 |

직접 설치된 앱 라이브러리 Next, React, Better Auth, Base UI, AG Grid Community, ExcelJS, pg-boss, pg, pino, zod, decimal.js는 각 설치 package manifest에서 MIT를 확인했다. Drizzle ORM과 Playwright는 Apache-2.0을 확인했다. 이 결과는 전이 의존성, OS 패키지, 브라우저, 전체 이미지, 판매용 납품물의 라이선스 심사를 대신하지 않는다.

## 컨테이너 이미지

| 이미지                                    | 고정 digest                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `node:24-bookworm-slim`                   | `sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6` |
| `postgres:18.6`                           | `sha256:86c951e05bf56c93d95d397747fb8820ac76cc3bedb78f43abd83eedbe3666ae` |
| `ghcr.io/navikt/mock-oauth2-server:3.0.3` | `sha256:876229d27fc99d7b1ab00dcd64a59a8c10826a6260b68f042558d83a0323dfb7` |
| `busybox:1.37.0`                          | `sha256:bdf57e528e45e4433820e045b29b4597825a1c9e38353532d90a01445013f82e` |

계획의 OIDC 시작 후보 `3.1.4`는 registry에서 찾을 수 없었다. 실제 게시된 3.x 태그 `3.0.3`을 사용했다. Windows Docker Desktop에서 fixture에 `hostname: host.docker.internal`을 설정하면 Web의 같은 이름이 fixture 컨테이너 IP로 해석된다. 따라서 fixture가 내부와 호스트에서 모두 8090 포트를 사용하게 했고, 두 경로에서 동일 issuer discovery 응답을 확인했다. production 프로필은 fixture 사용을 거부한다.

외부 AI 키, 외부 글꼴, CDN, 관측 exporter는 없다. Next 텔레메트리는 이미지 빌드와 실행 환경에서 비활성화했다.
