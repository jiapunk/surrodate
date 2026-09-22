import { execSync } from "node:child_process";
import { test, expect } from "@playwright/test";

/**
 * 單體 vs 蜂群對照（月老）——同一引擎第二垂直的 A/B，展示泛用性
 */

test.beforeAll(() => {
  execSync("npx tsx prisma/reset-demo.ts", { cwd: process.cwd() });
});

test("單體 vs 蜂群對照：月老版單體 baseline 與取捨表", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Demo小陽/ }).click();
  await page.waitForURL("**/agent");
  await page.getByRole("button", { name: /月老出發/ }).click();
  await expect(page.getByText(/對談已結束|已配對/).first()).toBeVisible({
    timeout: 45_000,
  });

  await page.goto("/compare");
  await expect(page.getByText("單體 vs 蜂群對照")).toBeVisible();
  await expect(page.getByText("蜂群").first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /執行單體對照/ }).click();
  await expect(page.getByText("取捨對照表")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("牆鐘延遲")).toBeVisible();
  await expect(page.getByText("報告欄位完整度")).toBeVisible();
  await expect(page.getByText(/兩者一致性：分數差/)).toBeVisible();
  await expect(page.getByText("五維對照")).toBeVisible();
  await expect(page.getByText("興趣共鳴")).toBeVisible();

  await page.screenshot({
    path: "shots/21-compare-solo-vs-swarm.png",
    fullPage: true,
  });
});
