import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: process.env.APP_ORIGIN ?? "http://test-web:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // 컨테이너 Chromium에는 GPU가 없어 SwiftShader로 WebGL을 켠다.
        launchOptions: {
          args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        },
        // 로그인 장면 테스트만 실제 3D 장면이 필요하므로 기본값은 축소 모션으로 WebGL을 건너뛴다.
        reducedMotion: "reduce",
      },
    },
  ],
});
