import { execSync } from "node:child_process";
import { test, expect } from "@playwright/test";

/**
 * 賽博月老 P2：互動回饋記憶
 * 見面回饋 → 代理人記憶 → 下次配對權重（recall before, record after）
 */

test.beforeAll(() => {
  execSync("npx tsx prisma/reset-demo.ts", { cwd: process.cwd() });
});

test("見面回饋進入代理人的記憶，並影響下一次配對", async ({ page }) => {
  // 1. 登入並出擊，完成第一次配對
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
  const partner = await page
    .locator("a[href^='/matches/']")
    .first()
    .getAttribute("href");
  await page.getByRole("link", { name: "看報告" }).first().click();

  // 引擎徽章：決策來源可見（mock 模式下顯示 決策 // MOCK）
  await expect(page.getByText(/決策 \/\/ /).first()).toBeVisible();

  // 2. 同意 → 配對成功
  await page.getByRole("button", { name: /我也願意/ }).click();
  await expect(page.getByText("配對成功")).toBeVisible({ timeout: 15_000 });

  // 3. 見面回饋：有見面 + 5 分 + 好聊
  await expect(page.getByText("見面回饋")).toBeVisible();
  await page.screenshot({ path: "shots/09-feedback-form.png", fullPage: true });
  await page.getByRole("button", { name: "有", exact: true }).click();
  await page.locator("button[aria-label='5 分']").click();
  await page.getByRole("button", { name: "好聊", exact: true }).click();
  await page.getByRole("button", { name: /送出回饋/ }).click();
  await expect(page.getByText(/代理人記住了：/)).toBeVisible({
    timeout: 15_000,
  });
  await page.screenshot({ path: "shots/10-feedback-saved.png", fullPage: true });

  // 4. 記憶確實進入摘要（且含對方的興趣標籤）
  const api = await page.request.get("/api/feedback");
  expect(api.ok()).toBeTruthy();
  const body = (await api.json()) as {
    memory: {
      total: number;
      hasMemory: boolean;
      avgRating: number | null;
      positiveInterests: Record<string, number>;
      positiveTags: Record<string, number>;
    };
  };
  expect(body.memory.total).toBe(1);
  expect(body.memory.hasMemory).toBeTruthy();
  expect(body.memory.avgRating).toBe(5);
  expect(Object.keys(body.memory.positiveInterests).length).toBeGreaterThan(0);
  expect(body.memory.positiveTags["好聊"]).toBe(1);

  // 5. profile 顯示代理人的記憶
  await page.goto("/profile");
  await expect(page.getByText("代理人的記憶")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/回饋 ×1/)).toBeVisible();
  await page.screenshot({ path: "shots/11-agent-memory.png", fullPage: true });

  // 6. 再出擊 → 新配對的報告帶回饋記憶（下次篩選會參考）
  const before = (await (
    await page.request.get("/api/matches")
  ).json()) as {
    proposals: { id: string }[];
    matched: { id: string }[];
  };
  const beforeIds = new Set(
    [...before.matched, ...before.proposals].map((m) => m.id),
  );

  await page.goto("/agent");
  await page.getByRole("button", { name: /月老出發/ }).click();

  let freshId = "";
  await expect(async () => {
    const d = (await (await page.request.get("/api/matches")).json()) as {
      proposals: { id: string }[];
      matched: { id: string }[];
    };
    const fresh = [...d.matched, ...d.proposals].find(
      (m) => !beforeIds.has(m.id),
    );
    expect(fresh).toBeTruthy();
    freshId = fresh!.id;
  }).toPass({ timeout: 90_000, intervals: [1500] });

  const det = await page.request.get(`/api/matches/${freshId}`);
  const dd = (await det.json()) as {
    myReport: { memoryNote?: string; ruleScore?: number } | null;
  };
  expect(dd.myReport?.memoryNote).toContain("回饋記憶");
  expect(typeof dd.myReport?.ruleScore).toBe("number");

  // 7. 新配對頁面直接看到「回饋記憶」列
  await page.goto(`/matches/${freshId}`);
  await expect(page.getByText(/回饋記憶：/)).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: "shots/12-memory-in-report.png", fullPage: true });
});
