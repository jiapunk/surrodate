import OpenAI from "openai";
import type { CompiledProfile, MatchReport } from "../types";
import type { PublicProfile } from "../profile";

/**
 * 真實 LLM 端點（OpenAI 相容）。透過 .env 切換：
 *   LLM_PROVIDER=real
 *   LLM_BASE_URL=https://opencode.ai/zen/go/v1   （OpenCode Go 訂閱）
 *             或 https://api.deepseek.com        （DeepSeek 官方）
 *   LLM_API_KEY=sk-xxx
 *   LLM_MODEL=deepseek-v4.1-flash
 *
 * OpenCode Go 規範：
 *   - 需帶專屬 User-Agent（不可用通用 SDK 名）
 *   - 每段對話帶穩定的 x-opencode-session header
 */

// 與其他代理區隔的專屬 UA
const USER_AGENT = "siebo-yuelao/1.0 (dating-agent)";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: process.env.LLM_BASE_URL || "https://api.deepseek.com",
      apiKey: process.env.LLM_API_KEY || "missing-key",
      defaultHeaders: { "User-Agent": USER_AGENT },
    });
  }
  return _client;
}

const MODEL = process.env.LLM_MODEL || "deepseek-chat";

async function json<T>(
  system: string,
  user: string,
  sessionId?: string,
): Promise<T> {
  let lastErr: unknown;
  // 對 LLM 偶發性錯誤（逾時/限流/暫時不可用）做最多 3 次重試
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await getClient().chat.completions.create(
        {
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.9,
          // 推理模型（如 deepseek-v4.1-flash）的 thinking 會佔用 completion 額度
          max_tokens: 6000,
        },
        { headers: sessionId ? { "x-opencode-session": sessionId } : undefined },
      );
      const raw = res.choices[0]?.message?.content ?? "{}";
      const cleaned = raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      return JSON.parse(cleaned) as T;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

const AGENT_PERSONA =
  "你是用戶的專屬月老（AI 代理交友服務），代表用戶與另一位用戶的月老互動。語氣溫暖、專業、帶點幽默，使用繁體中文；用現代口語，不要自稱神明。";

export async function realInterviewTurn(
  transcript: { role: "agent" | "user"; content: string }[],
  sessionId?: string,
): Promise<{ reply: string; done: boolean }> {
  const userCount = transcript.filter((t) => t.role === "user").length;
  const last =
    [...transcript].reverse().find((t) => t.role === "user")?.content ?? "";
  // 硬性上限：6 題收尾，保證流程終止
  if (userCount >= 6) {
    return {
      reply: `「${last.slice(0, 18)}${last.length > 18 ? "…" : ""}」——完美，最後一塊拼圖到位。你的檔案我正在編譯，稍後可以到「我的檔案」檢查我要拿去用的版本。`,
      done: true,
    };
  }
  const topics = [
    "日常：平常沒事時最喜歡做什麼",
    "能量：工作/課業佔多少能量、下班後狀態",
    "著迷：最近沉迷到忘記時間的事物",
    "舒服與地雷：什麼樣的人相處起來舒服、絕對不能踩的雷",
    "關係節奏：想找什麼節奏與形式的關係",
    "第一印象落差：別人對你的第一印象 vs 真實的你",
  ];
  return json<{ reply: string; done: boolean }>(
    "你是用戶的專屬月老，正在進行建立檔案的初次訪談（共 6 題）。話題清單：" +
      topics.map((t, i) => `${i + 1}. ${t}`).join("；") +
      '。規則：先用「…」引用對方上一句的關鍵片段表達傾聽，再自然接續問下一個尚未涵蓋的話題；一次只問一題；絕不重複問過的問題；風格溫暖口語；不使用 emoji。只輸出 JSON：{"reply":"...","done":false}',
    `訪談對話（已問過的訊息都在裡面）：\n${transcript
      .map((t) => `${t.role === "agent" ? "你的訊息" : "用戶"}：${t.content}`)
      .join("\n")}`,
    sessionId,
  );
}

export async function realCompileProfile(
  userName: string,
  answers: string[],
  sessionId?: string,
): Promise<CompiledProfile> {
  return json<CompiledProfile>(
    AGENT_PERSONA +
      '根據訪談回答編譯用戶檔案，只輸出 JSON：{"nickname","ageRange","city","jobField","vibe","interests"[],"values"[],"lifestyle","lookingFor","commsStyle","dealbreakers"[],"bio"}。bio 為 120 字內對外簡介。nickname 一律用用戶名字。',
    `用戶名字：${userName}\n訪談回答：\n${answers
      .map((a, i) => `${i + 1}. ${a}`)
      .join("\n")}`,
    sessionId,
  );
}

export async function realMatchQuestions(
  self: CompiledProfile,
  other: PublicProfile,
  sessionId?: string,
): Promise<string[]> {
  const r = await json<{ questions: string[] }>(
    AGENT_PERSONA +
      '你要替自己的用戶訪談另一位用戶的月老。生成 3 個最能判斷相容性的問題（繁體中文）。只輸出 JSON：{"questions":[...]}',
    `我的用戶檔案：${JSON.stringify(self)}\n對方檔案：${JSON.stringify(other)}`,
    sessionId,
  );
  return r.questions;
}

export async function realMatchAnswers(
  self: CompiledProfile,
  questions: string[],
  sessionId?: string,
): Promise<string[]> {
  const r = await json<{ answers: string[] }>(
    AGENT_PERSONA +
      '代表你的用戶回答另一位月老的提問，忠實根據檔案、簡潔有個性（繁體中文）。只輸出 JSON：{"answers":[...與問題等長]}',
    `我的用戶檔案：${JSON.stringify(self)}\n問題：${questions.join("\n")}`,
    sessionId,
  );
  return r.answers;
}

export async function realMatchReport(
  self: CompiledProfile,
  other: PublicProfile,
  qa: string,
  pairKey: string,
  sessionId?: string,
): Promise<MatchReport> {
  const base = await json<MatchReport>(
    AGENT_PERSONA +
      '基於對聊紀錄與雙方檔案產出配對報告。情境指引：約會情境：興趣與價值觀的重疊、生活型態相容、溝通節奏、關係意圖一致，重疊越多越好。dimensions 五個 0-100 分的意義：{"interests":"興趣共鳴","values":"價值觀","lifestyle":"生活型態","communication":"溝通契合","intent":"意圖一致"}。只輸出 JSON：{"score":0-100整數,"verdict":"recommend|cautious|pass","dimensions":{"values":0-100,"lifestyle":0-100,"interests":0-100,"communication":0-100,"intent":0-100},"reasons"[],"redFlags"[],"sharedTopics"[],"summaryForUser":"給本人看的溫暖摘要兩三句"}。全文不使用 emoji。嚴禁捏造檔案中不存在的資訊；sharedTopics 只能從雙方興趣/價值的交集或對聊中實際出現的話題挑選。',
    `我的用戶檔案：${JSON.stringify(self)}\n對方檔案：${JSON.stringify(
      other,
    )}\n雙方月老對聊紀錄：\n${qa}\n配對鍵：${pairKey}`,
    sessionId,
  );
  return base;
}

export async function realIcebreakers(
  self: CompiledProfile,
  other: PublicProfile,
  sharedTopics: string[],
  sessionId?: string,
): Promise<string[]> {
  const r = await json<{ openers: string[] }>(
    AGENT_PERSONA +
      '為剛配對成功的兩人生成 3 句開場白（由用戶發出）。語氣自然、低壓力、適合社恐，各自用到共同話題（繁體中文），每句最多一個表情符號。只輸出 JSON：{"openers":[...]}',
    `我的用戶：${JSON.stringify(self)}\n對方：${JSON.stringify(
      other,
    )}\n共同話題：${sharedTopics.join("、")}`,
    sessionId,
  );
  return r.openers;
}

export async function realChatReply(
  bot: CompiledProfile,
  other: PublicProfile,
  history: { senderId: string; content: string }[],
  botId: string,
  sessionId?: string,
): Promise<string> {
  const r = await json<{ reply: string }>(
    AGENT_PERSONA +
      `你現在直接扮演你的用戶本人（${bot.nickname}）在聊天室回話。忠於檔案、自然口語繁體中文、一次最多兩三句、可以適時反問、最多一個表情符號。只輸出 JSON：{"reply":"..."}`,
    `我的用戶（你扮演的）：${JSON.stringify(bot)}\n聊天對象：${JSON.stringify(
      other,
    )}\n對話紀錄（最後為對方最新訊息）：\n${history
      .map((m) => `${m.senderId === botId ? "我" : "對方"}：${m.content}`)
      .join("\n")}`,
    sessionId,
  );
  return r.reply;
}
