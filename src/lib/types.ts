// ---------- 約會檔案（CompiledProfile） ----------
export interface CompiledProfile {
  nickname: string;
  ageRange: string;
  city: string;
  jobField: string;
  vibe: string; // 一句話人設
  interests: string[];
  values: string[];
  lifestyle: string; // 生活型態
  lookingFor: string; // 想找的關係
  commsStyle: string; // 溝通風格
  dealbreakers: string[];
  bio: string; // 對外簡介
}

export type VisibilityMap = Record<string, boolean>;

export const DEFAULT_VISIBILITY: VisibilityMap = {
  ageRange: true,
  city: true,
  jobField: true,
  interests: true,
  values: true,
  lifestyle: true,
  lookingFor: true,
  commsStyle: true,
  dealbreakers: false, // 地雷預設不對外分享，僅供己方月老判斷
};

export const VISIBILITY_FIELDS = [
  "ageRange",
  "city",
  "jobField",
  "interests",
  "values",
  "lifestyle",
  "lookingFor",
  "commsStyle",
  "dealbreakers",
] as const;

// ---------- 配對報告 ----------
export interface Dimension {
  values: number; // 價值觀
  lifestyle: number; // 生活型態
  interests: number; // 興趣共鳴
  communication: number; // 溝通契合
  intent: number; // 意圖一致
}

export interface MatchReport {
  score: number; // 0-100 總分
  decisionSource?: "jev" | "llm" | "mock"; // 評分由哪一層決策產生
  decisionModel?: string;
  decisionCoverage?: {
    expected: number;
    filled: number;
    remote: number;
    fallbacks: number;
    retries: number;
  };
  verdict: "recommend" | "cautious" | "pass";
  dimensions: Dimension;
  reasons: string[];
  redFlags: string[];
  sharedTopics: string[];
  summaryForUser: string; // 給本人看的溫暖摘要
  ruleScore?: number; // 同組合的規則層分數（對照 Jev 差別）
  memoryNote?: string; // 互動回饋記憶摘要（見面回饋 → 篩選權重）
}

// ---------- 月老對談事件流 ----------
export type RunEventBase =
  | { type: "phase"; text: string }
  | { type: "question"; side: "A" | "B"; text: string }
  | { type: "answer"; side: "A" | "B"; text: string }
  | { type: "report"; side: "A" | "B"; report: MatchReport }
  | { type: "done"; text: string; matchId?: string | null };

export type RunEvent = RunEventBase & { ts: number };

export const MATCH_THRESHOLD = 70;
