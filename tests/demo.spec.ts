import { execSync } from "node:child_process";
import { test, expect } from "@playwright/test";

// 每次測試前重置 demo 資料，確保流程可重現
test.beforeAll(() => {
  execSync("npx tsx prisma/reset-demo.ts", { cwd: process.cwd() });
});

test("完整流程：身份 → 指揮台出擊 → live 對聊 → 配對 → 同意 → 即時聊天", async ({
  page,
}) => {
  // 1. Landing + 身份選擇
  await page.goto("/");
  await expect(page.getByText(/讓分身先去認識全世界/)).toBeVisible();
  await expect(page.getByRole("button", { name: /小柚/ })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/01-landing.png", fullPage: true });

  await page.getByRole("button", { name: /Demo小陽/ }).click();
  await page.waitForURL("**/agent");
  await expect(
    page.getByRole("button", { name: /月老出發/ }),
  ).toBeVisible();

  // 2. 出擊 → run 卡片出現
  await page.getByRole("button", { name: /月老出發/ }).click();
  await expect(page.getByText(/對談中/).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/02-agent-launch.png" });

  // 3. 等 live 對談完成（mock 節奏約 8-10 秒）
  await expect(page.getByText(/對談已結束|已配對/).first()).toBeVisible({
    timeout: 45_000,
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/03-agent-console.png", fullPage: true });

  // 4. 配對列表
  await page.goto("/matches");
  await expect(page.getByRole("heading", { name: "配對" })).toBeVisible();
  await expect(page.getByText("對方已同意").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/04-matches.png", fullPage: true });

  // 5. 看報告 → 同意
  await page.getByRole("link", { name: "看報告" }).first().click();
  await expect(page.getByText("你的月老的評估報告")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/05-report.png", fullPage: true });
  await page.getByRole("button", { name: /我也願意/ }).click();
  await expect(page.getByText("配對成功")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("開場話題")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/06-icebreakers.png", fullPage: true });

  // 6. 進入聊天室，送出訊息，等 AI 模擬用戶回覆
  await page.getByRole("link", { name: /進入聊天室/ }).click();
  await page.waitForURL("**/chat/**");
  await page
    .getByPlaceholder(/打聲招呼/)
    .fill("哈囉！我的 agent 說我們很合拍，你最近在忙什麼？");
  await page.getByRole("button", { name: "送出" }).click();
  await expect(page.getByText("哈囉！我的 agent 說我們很合拍")).toBeVisible();

  // bot 回覆（1.4s ~ 3s 延遲）
  await expect(page.getByText(/哈囉哈囉！/)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: "shots/07-chat.png", fullPage: true });
});
