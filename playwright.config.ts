// @ts-check
import { defineConfig } from "@playwright/test";

// 測試固定使用 mock 模式 + 獨立 port（3100），不干擾開發中的 real LLM server
export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3100",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      LLM_PROVIDER: "mock",
      LLM_API_KEY: "",
      NEXT_DIST_DIR: ".next-test",
      JEV_API_KEY: "",
      DECISION_PROVIDER: "mock",
    },
  },
});
