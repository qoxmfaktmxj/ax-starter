import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { signInWithFixture, signInWithPassword } from "./login";

function modeButton(page: Page, name: "내 업무" | "포털") {
  return page
    .getByRole("group", { name: "홈 모드" })
    .getByRole("button", { name, exact: true });
}

async function selectMode(page: Page, name: "내 업무" | "포털") {
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/home/mode" &&
      response.request().method() === "PUT",
  );
  await modeButton(page, name).press("Enter");
  expect((await saved).ok()).toBe(true);
  await expect(modeButton(page, name)).toHaveAttribute("aria-pressed", "true");
}

test("로그인한 계정의 마지막 홈을 새 브라우저에서도 복원한다", async ({
  page,
  browser,
  baseURL,
}) => {
  const fresh = await browser.newContext({
    baseURL,
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  let admin = page;
  try {
    await page.goto("/");
    await expect(page).toHaveURL("/login");
    await signInWithPassword(page, "hr-admin");
    await expect(page).toHaveURL("/");
    await expect(modeButton(page, "내 업무")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await selectMode(page, "포털");
    await page.getByRole("link", { name: "감사 기록", exact: true }).click();
    await expect(page).toHaveURL("/audit");
    await page.getByRole("link", { name: "홈", exact: true }).click();
    await expect(modeButton(page, "포털")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    admin = await fresh.newPage();
    await signInWithPassword(admin, "hr-admin");
    await expect(modeButton(admin, "포털")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL("/login");
    await signInWithPassword(page, "org-manager");
    await expect(modeButton(page, "내 업무")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.setViewportSize({ width: 320, height: 740 });
    await selectMode(page, "포털");
    await expect(page.getByRole("link", { name: "감사 기록" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "감사 기록" })).toHaveCount(
      0,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("link", { name: "인사/조직", exact: true }).click();
    await expect(page).toHaveURL("/organization");
    await page.getByRole("link", { name: "홈", exact: true }).click();
    await selectMode(page, "내 업무");
    await page.reload();
    await expect(modeButton(page, "내 업무")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await admin.reload();
    await expect(modeButton(admin, "포털")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await selectMode(admin, "내 업무");
  } finally {
    for (const session of new Set([admin, page])) {
      await session.request.put("/api/home/mode", {
        headers: { Origin: baseURL! },
        data: { mode: "work" },
      });
    }
    await fresh.close();
  }
});

test("초안이 없는 SSO 직원은 홈에서 새 교육 신청을 바로 연다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await signInWithFixture(page, "org-manager");
  await expect(modeButton(page, "내 업무")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const start = page.getByRole("link", { name: "새 교육 신청", exact: true });
  await expect(start).toHaveAttribute("href", "/my-requests?new=1");
  await start.click();
  await expect(
    page.getByRole("heading", { name: "교육 신청 작성" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: /신청 사유/ })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page).toHaveURL("/my-requests");
  await page.goto(`/my-requests?draft=${randomUUID()}`);
  await expect(
    page.getByText("신청서를 찾을 수 없습니다.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "목록으로", exact: true }).click();
  await expect(page).toHaveURL("/my-requests");
});

for (const outcome of ["성공", "실패"] as const) {
  test(`홈 모드 재시도가 ${outcome}해도 저장 중 누른 로그아웃을 완료한다`, async ({
    page,
    baseURL,
  }) => {
    await signInWithPassword(page, "hr-admin");
    await expect(modeButton(page, "내 업무")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.route(
      "**/api/home/mode",
      (route) => route.fulfill({ status: 503 }),
      { times: 1 },
    );
    await modeButton(page, "포털").click();
    await expect(
      page.getByRole("alert").filter({ hasText: "홈 모드 저장" }),
    ).toBeVisible();
    await expect(modeButton(page, "내 업무")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByRole("heading", { name: "교육 신청", exact: true }),
    ).toBeVisible();

    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/api/home/mode",
      async (route) => {
        await hold;
        if (outcome === "성공") await route.continue();
        else await route.fulfill({ status: 503 });
      },
      { times: 1 },
    );
    try {
      await modeButton(page, "포털").click();
      await expect(
        page.getByRole("group", { name: "홈 모드" }),
      ).toHaveAttribute("aria-busy", "true");
      await expect(
        page.getByRole("alert").filter({ hasText: "홈 모드 저장" }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "로그아웃" })
        .click({ timeout: 5000 });
      await expect(page).toHaveURL("/");
      release();
      await expect(page).toHaveURL("/login");
      expect((await page.request.get("/api/me")).status()).toBe(401);
      await signInWithPassword(page, "hr-admin");
      await expect(
        modeButton(page, outcome === "성공" ? "포털" : "내 업무"),
      ).toHaveAttribute("aria-pressed", "true");
    } finally {
      release();
      await page.request.put("/api/home/mode", {
        headers: { Origin: baseURL! },
        data: { mode: "work" },
      });
    }
  });
}

test("최근 수정한 초안을 홈에서 한 번 눌러 과정과 사유를 복원한다", async ({
  page,
  baseURL,
}) => {
  await signInWithPassword(page, "org-manager");
  await expect(modeButton(page, "내 업무")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const reason = `홈 복원 ${randomUUID()}\n두 번째 문단`;
  const postDraft = async (data: Record<string, unknown>) => {
    const response = await page.request.post("/api/requests", {
      headers: { Origin: baseURL! },
      data: { requestId: randomUUID(), ...data },
    });
    expect(response.ok()).toBe(true);
    return response.json() as Promise<{ id: string; rowVersion: number }>;
  };
  const first = await postDraft({ courseId: "2", reason: "수정 전" });
  await postDraft({ courseId: "3", reason: "나중에 만든 초안" });
  await postDraft({ ...first, courseId: "2", reason });
  await page.reload();
  await expect(
    page.getByText("데이터 분석 1차", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const shade of ["light", "dark"]) {
    if (shade === "dark") {
      await page.getByRole("button", { name: "화면 설정" }).click();
      const settings = page.getByRole("dialog", { name: "화면 설정" });
      await settings.getByRole("radio", { name: "다크" }).check();
      await settings.getByRole("button", { name: "닫기" }).click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-mode", shade);
    await page.screenshot({ path: `output/playwright/home-work-${shade}.png` });
    await selectMode(page, "포털");
    await page.screenshot({
      path: `output/playwright/home-portal-${shade}.png`,
    });
    if (shade === "light") {
      await page.setViewportSize({ width: 320, height: 740 });
      await page.screenshot({ path: "output/playwright/home-portal-320.png" });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await selectMode(page, "내 업무");
  }
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const resume = page.getByRole("link", { name: "이어서 작성", exact: true });
  await expect(resume).toHaveAttribute(
    "href",
    `/my-requests?draft=${first.id}`,
  );
  await resume.click();
  await expect(page.getByRole("textbox", { name: /신청 사유/ })).toHaveValue(
    reason,
  );
  await expect(
    page.getByText("ED-002 / 데이터 분석 1차", { exact: true }),
  ).toBeVisible();
});
