import { execSync } from "node:child_process";
import { test, expect } from "@playwright/test";

/**
 * 賽博月老 P2.5：見面後續約閉環
 * 正向回饋（有見面 + 高分）→ 月老提出第二次約會企劃 → 接受 → 聊天室置頂
 */

test.beforeAll(() => {
  execSync("npx tsx prisma/reset-demo.ts", { cwd: process.cwd() });
});

test("正向回饋自動產生第二次約會提案，接受後聊天室置頂", async ({ page }) => {
  // 1. 出擊 → 完成配對 → 同意
  await page.goto("/");
  await page.getByRole("button", { name: /Demo小陽/ }).click();
  await page.waitForURL("**/agent");
  await page.getByRole("button", { name: /月老出發/ }).click();
  await expect(page.getByText(/對談已結束|已配對/).first()).toBeVisible({
    timeout: 45_000,
  });
  await page.goto("/matches");
  await expect(page.getByText("對方已同意").first()).toBeVisible({
    timeout: 15_000,
  });
  const matchHref = await page
    .locator("a[href^='/matches/']")
    .first()
    .getAttribute("href");
  const matchId = (matchHref ?? "").split("/").pop() ?? "";
  expect(matchId).toBeTruthy();

  await page.getByRole("link", { name: "看報告" }).first().click();
  await page.getByRole("button", { name: /我也願意/ }).click();
  await expect(page.getByText("配對成功")).toBeVisible({ timeout: 15_000 });

  // 2. 正向回饋：有見面 + 5 分 + 好聊
  await page.getByRole("button", { name: "有", exact: true }).click();
  await page.locator("button[aria-label='5 分']").click();
  await page.getByRole("button", { name: "好聊", exact: true }).click();
  await page.getByRole("button", { name: /送出回饋/ }).click();

  // 3. 提案自動出現（決策層挑選，mock 模式顯示 決策 // MOCK）
  await expect(page.getByText("第二次約會提案")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/決策 \/\/ /).first()).toBeVisible();
  await expect(page.getByText(/月老的判斷：/)).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "shots/15-second-date-proposal.png",
    fullPage: true,
  });

  // 4. 接受提案 → 雙方都同意（bot 代表本人）→ 已排定
  await page.getByRole("button", { name: /就這麼辦/ }).click();
  await expect(page.getByText("第二次約會已排定")).toBeVisible({
    timeout: 15_000,
  });

  const det = await page.request.get(`/api/matches/${matchId}`);
  const d = (await det.json()) as {
    secondDate: {
      status: string;
      decisionSource: string | null;
      bothAccepted: boolean;
      plan: { title: string; ideas: string[] };
    } | null;
  };
  expect(d.secondDate).toBeTruthy();
  expect(d.secondDate!.status).toBe("accepted");
  expect(d.secondDate!.bothAccepted).toBeTruthy();
  expect(d.secondDate!.plan.title.length).toBeGreaterThan(0);
  expect(d.secondDate!.plan.ideas.length).toBeGreaterThan(0);

  // 5. 聊天室置頂企劃
  await page.getByRole("link", { name: /進入聊天室/ }).click();
  await page.waitForURL("**/chat/**");
  await expect(page.getByText("第二次約會已排定")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(d.secondDate!.plan.title)).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/16-chat-pinned-plan.png", fullPage: true });

  // 5.5 第二次約會回饋（round 2）：更強訊號、權重 ×2
  await page.getByRole("link", { name: /配對報告/ }).click();
  await page.waitForURL("**/matches/**");
  await expect(page.getByText("第二次約會回饋")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "有", exact: true }).last().click();
  await page.locator("button[aria-label='第二次約會 5 分']").click();
  await page.getByRole("button", { name: "有火花", exact: true }).last().click();
  await page.getByRole("button", { name: /送出第二次回饋/ }).click();
  await expect(page.getByText(/代理人更新了記憶：/)).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "shots/19-round2-feedback.png",
    fullPage: true,
  });

  const fbRes = await page.request.get("/api/feedback");
  const fbBody = (await fbRes.json()) as {
    memory: {
      total: number;
      secondDates: number;
      positiveTags: Record<string, number>;
      note: string;
    };
  };
  expect(fbBody.memory.total).toBe(2);
  expect(fbBody.memory.secondDates).toBe(1);
  // 第二輪權重 ×2（有火花只在第二輪出現）
  expect(fbBody.memory.positiveTags["有火花"]).toBe(2);
  expect(fbBody.memory.note).toContain("含 1 次第二次約會");

  // 6. 非正向回饋不會產生提案（負向路徑）：換新配對、低分回饋
  await page.goto("/agent");
  await page.getByRole("button", { name: /月老出發/ }).click();
  await expect(async () => {
    const r = await page.request.get("/api/matches");
    const dd = (await r.json()) as {
      proposals: { id: string }[];
      matched: { id: string }[];
    };
    const all = [...dd.matched, ...dd.proposals].filter(
      (m) => m.id !== matchId,
    );
    expect(all.length).toBeGreaterThan(0);
  }).toPass({ timeout: 90_000, intervals: [1500] });

  const r2 = await page.request.get("/api/matches");
  const dd2 = (await r2.json()) as {
    proposals: { id: string }[];
    matched: { id: string }[];
  };
  const other = [...dd2.matched, ...dd2.proposals].find((m) => m.id !== matchId)!;
  await page.request.post(`/api/matches/${other.id}`, {
    data: { approve: true },
  });
  const lowFb = await page.request.post("/api/feedback", {
    data: { matchId: other.id, metWith: true, rating: 2, tags: ["話不投機"] },
  });
  const lowBody = (await lowFb.json()) as { secondDate: unknown };
  expect(lowBody.secondDate).toBeNull();
});
