import type { CompiledProfile, MatchReport } from "../types";
import type { PublicProfile } from "../profile";
import { decide, type DecideAnswer, type DecideQuestion } from "./decide";
import {
  EMPTY_MEMORY,
  memoryAdjustment,
  type FeedbackMemory,
} from "../feedback";

// ================= 工具 =================
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function overlap(a: string[], b: string[]): string[] {
  const setB = new Set(b.map((x) => x.trim()));
  return a.filter((x) => setB.has(x.trim()));
}

const clip = (s: string, n = 18) =>
  s.length > n ? s.slice(0, n) + "…" : s;

// ================= Onboarding 訪談 =================
const INTERVIEW_SCRIPT = [
  "嗨，我是你的專屬月老。在我替你出門認識人之前，得先夠懂你。放輕鬆，像跟朋友聊天就好——平常沒事的日子，你最喜歡做什麼？",
  "收到！那工作（或課業）佔掉你多少能量？下班後的你通常是充飽電，還是只剩 5%？",
  "懂了。最近有沒有什麼讓你著迷到忘記時間的東西？追劇、遊戲、運動、貓狗、做菜都算。",
  "下一題有點重要：什麼樣的人會讓你覺得「跟這個人相處好舒服」？反過來說，有沒有絕對不能踩的地雷？",
  "你希望這段關係是什麼節奏？慢溫的筆友式、一週見一次、還是看感覺可以直接約？",
  "最後一題！別人對你的第一印象，通常跟真實的你差在哪？說完我就幫你建檔。",
];

export async function mockInterviewTurn(
  transcript: { role: "agent" | "user"; content: string }[],
  _sessionId?: string,
): Promise<{ reply: string; done: boolean }> {
  const userMsgs = transcript.filter((t) => t.role === "user");
  const last = userMsgs[userMsgs.length - 1]?.content ?? "";
  const answered = userMsgs.length; // 含本次
  if (answered >= INTERVIEW_SCRIPT.length) {
    return {
      reply: `「${clip(last)}」——完美，最後一塊拼圖到位。你的檔案我正在編譯，稍後可以到「我的檔案」檢查我要拿去用的版本。`,
      done: true,
    };
  }
  // script[0] 為開場白（畫面上已出現），回答 k 之後接 script[k]
  return {
    reply: `「${clip(last)}」——筆記下來了 ✍️ ${INTERVIEW_SCRIPT[answered]}`,
    done: false,
  };
}

// ================= Profile 編譯 =================
const INTEREST_DICT: Array<[RegExp, string]> = [
  [/貓/, "貓"], [/狗/, "狗"], [/咖啡/, "咖啡"], [/露營/, "露營"],
  [/爬山|登山|健行/, "爬山"], [/追劇|美劇|韓劇|陸劇|日劇/, "追劇"],
  [/遊戲|電玩/, "遊戲"], [/健身|重訓|健身房/, "健身"], [/跑步|路跑|慢跑/, "跑步"],
  [/看展|美術館|博物館|展覽/, "看展"], [/插畫|畫畫|繪圖|設計/, "插畫"],
  [/音樂|唱歌|樂團/, "音樂"], [/吉他/, "吉他"], [/桌遊|board.?game/, "桌遊"],
  [/旅行|旅遊|出國/, "旅行"], [/溫泉|泡湯/, "溫泉"], [/甜點|蛋糕|下午茶/, "甜點"],
  [/料理|做菜|烹飪|煮飯/, "料理"], [/閱讀|看書|書店/, "閱讀"], [/電影/, "電影"],
  [/攝影|拍照/, "攝影"], [/投資|理財|股票|ETF/, "投資理財"], [/冥想|瑜伽|瑜珈/, "冥想"],
  [/爵士/, "爵士樂"], [/看海|海邊|衝浪/, "看海"], [/羽球|籃球|棒球|運動/, "運動"],
];

const JOB_DICT: Array<[RegExp, string]> = [
  [/工程師|寫程式|coding|後端|前端/, "工程師"],
  [/設計|UI|UX|美術/, "設計師"],
  [/老師|教學|教育/, "教職"],
  [/護理|護士|醫護|醫師/, "醫護"],
  [/行銷|企劃|廣告/, "行銷企劃"],
  [/產品經理|PM/, "產品經理"],
  [/學生|上課|研究所/, "學生"],
];

function pickFrom(text: string, dict: Array<[RegExp, string]>, fallback = "") {
  for (const [re, v] of dict) if (re.test(text)) return v;
  return fallback;
}

export async function mockCompileProfile(
  userName: string,
  answers: string[],
  _sessionId?: string,
): Promise<CompiledProfile> {
  const all = answers.join(" ");
  const interests = Array.from(
    new Set(INTEREST_DICT.filter(([re]) => re.test(all)).map(([, v]) => v)),
  ).slice(0, 6);

  const values: string[] = [];
  const q4 = answers[3] ?? "";
  if (/真誠|老實|誠實|坦/.test(q4)) values.push("真誠");
  if (/幽默|好笑|有趣|冷笑話/.test(q4)) values.push("幽默感");
  if (/穩定|安定|安心/.test(q4)) values.push("穩定");
  if (/溫柔|溫暖|貼心/.test(q4)) values.push("溫柔");
  if (/尊重|界線/.test(q4)) values.push("互相尊重");
  if (/深度|聊得來|聊天/.test(q4)) values.push("深度對話");
  if (/成長|上進|更好/.test(q4)) values.push("一起成長");
  if (/獨立|自己的空間|自由/.test(q4)) values.push("彼此獨立");
  if (values.length === 0) values.push("真誠", "聊得來");

  const dealbreakers: string[] = [];
  if (/已讀不回|消失|鬼隱/.test(q4)) dealbreakers.push("已讀不回式消失");
  if (/冷戰/.test(q4)) dealbreakers.push("冷戰");
  if (/遲到/.test(q4)) dealbreakers.push("約會遲到不說一聲");
  if (/不尊重|沒禮貌/.test(q4)) dealbreakers.push("不尊重他人");
  if (/管太多|控制/.test(q4)) dealbreakers.push("管太多");
  if (/曖昧|不表態/.test(q4)) dealbreakers.push("永遠曖昧不表態");
  if (dealbreakers.length === 0) dealbreakers.push("不真誠", "沒有禮貌");

  const q5 = answers[4] ?? "";
  const lookingFor = /慢|筆友|慢慢/.test(q5)
    ? "筆友式慢溫，先舒服再說"
    : /衝刺|直接約|快/.test(q5)
      ? "看感覺，聊得來可以直接約"
      : "先當朋友開始，以認真交往為前提";

  const q2 = answers[1] ?? "";
  const lifestyle = /累|5%|爆|耗/.test(q2)
    ? "工作很吃能量，假日偏歸巢型充電"
    : "作息規律，假日喜歡出門走走";

  const jobField = pickFrom(all, JOB_DICT, "上班族");
  const commsStyle = /見面|面對面|直接約/.test(all)
    ? "喜歡直接約見面聊，線上會認真回但偏慢"
    : "文字派，回訊穩定，喜歡分享生活小片段";

  const i0 = interests[0] ?? "生活";
  const vibe = `嘴上安靜但聊起${i0}會發光的人`;

  return {
    nickname: userName,
    ageRange: "25-32",
    city: "台灣",
    jobField,
    vibe,
    interests: interests.length ? interests : ["追劇", "咖啡"],
    values,
    lifestyle,
    lookingFor,
    commsStyle,
    dealbreakers,
    bio: `${vibe}。我家月老正在替我認識不錯的人——說不定就是你。`,
  };
}

// ================= 月老對聊：提問 / 回答 =================
export async function mockMatchQuestions(
  self: CompiledProfile,
  other: PublicProfile,
  _sessionId?: string,
): Promise<string[]> {
  const landmine = self.dealbreakers[0] ?? "不真誠";
  return [
    `${other.nickname} 平常的生活節奏是怎樣？假日是動態派還是靜態派？`,
    `${other.nickname} 想要的關係是什麼樣子？節奏跟認真程度有符合期待嗎？`,
    `關於溝通跟個性——${other.nickname} 有沒有可能踩到「${landmine}」這種雷？`,
  ];
}

export async function mockMatchAnswers(
  self: CompiledProfile,
  _questions: string[],
  _sessionId?: string,
): Promise<string[]> {
  return [
    `${self.nickname} 的日常：${self.lifestyle}。整體偏${
      /在家|歸巢|宅/.test(self.lifestyle) ? "靜態" : "動態"
    }派。`,
    `想要的是「${self.lookingFor}」，最看重${self.values
      .slice(0, 2)
      .join("跟")}。`,
    `溝通習慣：${self.commsStyle}。地雷是${
      self.dealbreakers.join("、") || "暫無"
    }，其實就是把人當人看待而已。`,
  ];
}

// ================= 配對報告 =================
const DIM_LEVELS = [
  "None at all",
  "Very weak",
  "Below average",
  "Average",
  "Clearly strong",
  "Exceptional",
];

function reportQuestions(): DecideQuestion[] {
  return [
    {
      id: "d_interests",
      type: "score",
      instructions:
        "How much do these two people's interests overlap in a way that gives them things to talk about on a first date?",
      criteria: DIM_LEVELS,
    },
    {
      id: "d_values",
      type: "score",
      instructions: "How aligned are their stated personal values?",
      criteria: DIM_LEVELS,
    },
    {
      id: "d_intent",
      type: "score",
      instructions:
        "How compatible are their desired relationship paces (serious long-term vs slow pen-pal style vs flexible)?",
      criteria: DIM_LEVELS,
    },
    {
      id: "d_comms",
      type: "score",
      instructions:
        "How compatible are their communication styles (text-first vs voice vs meeting up)?",
      criteria: DIM_LEVELS,
    },
    {
      id: "d_lifestyle",
      type: "score",
      instructions:
        "How compatible do their daily lifestyles and weekend rhythms look?",
      criteria: DIM_LEVELS,
    },
    {
      id: "n_comms_diff",
      type: "noul",
      instructions:
        "Their communication styles clearly differ (e.g. one is text-first, the other voice or meet-first).",
    },
    {
      id: "n_intent_diff",
      type: "noul",
      instructions:
        "Their expected relationship pace clearly differs (e.g. one wants serious long-term, the other wants slow light contact).",
    },
    {
      id: "d_overall",
      type: "score",
      instructions:
        "Overall compatibility as a dating match, from 0 (skip) to 100 (excellent match).",
      criteria: ["0-20 skip", "20-40 poor", "40-60 meh", "60-80 promising", "80-100 excellent"],
    },
    {
      id: "n_shared_ground",
      type: "noul",
      instructions:
        "They share at least one interest or value that gives them a natural conversation starter.",
    },
  ];
}

function reportState(
  self: CompiledProfile,
  other: PublicProfile,
  qa?: string,
  memory?: FeedbackMemory,
): Record<string, unknown> {
  return {
    my_feedback_memory: memory?.hasMemory
      ? {
          total: memory.total,
          avg_rating: memory.avgRating,
          met_count: memory.metCount,
          positive_interests: memory.positiveInterests,
          negative_interests: memory.negativeInterests,
          positive_tags: memory.positiveTags,
          negative_tags: memory.negativeTags,
          summary: memory.note,
        }
      : undefined,
    me: {
      nickname: self.nickname,
      age_range: self.ageRange,
      city: self.city,
      job: self.jobField,
      vibe: self.vibe,
      interests: self.interests,
      values: self.values,
      lifestyle: self.lifestyle,
      looking_for: self.lookingFor,
      comms_style: self.commsStyle,
      dealbreakers: self.dealbreakers,
      bio: self.bio,
    },
    them: {
      nickname: other.nickname,
      age_range: other.ageRange,
      city: other.city,
      job: other.jobField,
      vibe: other.vibe,
      interests: other.interests,
      values: other.values,
      lifestyle: other.lifestyle,
      looking_for: other.lookingFor,
      comms_style: other.commsStyle,
      bio: other.bio,
    },
    agent_interview_excerpt: (qa ?? "").slice(0, 6000),
  };
}

/** 本機規則版答案（fallback 與 mock provider 都用它） */
export function localReportAnswers(
  self: CompiledProfile,
  other: PublicProfile,
  pairKey: string,
): DecideAnswer[] {
  const shared = overlap(self.interests, other.interests);
  const sharedVals = overlap(self.values, other.values);
  const jitter = hashStr(pairKey) % 7;

  const intentOf = (s: string) =>
    /認真|長期|交往/.test(s) ? "serious" : /慢|朋友|輕鬆/.test(s) ? "slow" : "flex";
  const intentMatch =
    intentOf(self.lookingFor) === intentOf(other.lookingFor)
      ? 4
      : intentOf(self.lookingFor) === "flex" || intentOf(other.lookingFor) === "flex"
        ? 2.5
        : 1;

  const commsOf = (s: string) =>
    /文字/.test(s) ? "text" : /語音|電話/.test(s) ? "voice" : /見面|面對面/.test(s) ? "meet" : "text";
  const cA = commsOf(self.commsStyle);
  const cB = commsOf(other.commsStyle);
  const commsSame = cA === cB;

  const oldRuleScore = Math.max(
    35,
    Math.min(
      96,
      30 +
        Math.min(40, shared.length * 9) +
        Math.min(30, sharedVals.length * 10) +
        (intentOf(self.lookingFor) === intentOf(other.lookingFor)
          ? 12
          : intentOf(self.lookingFor) === "flex" || intentOf(other.lookingFor) === "flex"
            ? 6
            : 2) +
        (commsSame ? 10 : 4) +
        jitter,
    ),
  );

  const dim = (v: number) => Math.max(0, Math.min(5, v));
  return [
    { id: "d_overall", type: "score", value: Math.round(oldRuleScore / 20), confidence: 1, probabilities: {} },
    { id: "d_interests", type: "score", value: dim(1 + shared.length * 1.1), confidence: 1, probabilities: {} },
    { id: "d_values", type: "score", value: dim(1 + sharedVals.length * 1.4), confidence: 1, probabilities: {} },
    { id: "d_intent", type: "score", value: dim(intentMatch + 0.5), confidence: 1, probabilities: {} },
    { id: "d_comms", type: "score", value: commsSame ? 5 : 2, confidence: 1, probabilities: {} },
    { id: "d_lifestyle", type: "score", value: dim(2.5 + (jitter % 4) * 0.6), confidence: 1, probabilities: {} },
    { id: "n_comms_diff", type: "noul", value: commsSame ? 0.1 : 0.9 },
    { id: "n_intent_diff", type: "noul", value: intentMatch <= 1 ? 0.9 : 0.15 },
    { id: "n_shared_ground", type: "noul", value: shared.length + sharedVals.length > 0 ? 0.95 : 0.1 },
  ];
}

/** 決策答案 → 本地化報告（文字一律模板合成，不經模型生成） */
export function composeReport(
  self: CompiledProfile,
  other: PublicProfile,
  answers: DecideAnswer[],
): MatchReport {
  const get = (id: string) => answers.find((a) => a.id === id);
  const pct = (id: string) => {
    const a = get(id);
    if (a?.type !== "score") return 50;
    return Math.round((a.value / 5) * 100);
  };
  const yes = (id: string) => {
    const a = get(id);
    return a?.type === "noul" ? a.value >= 0.5 : false;
  };

  const shared = overlap(self.interests, other.interests);
  const sharedVals = overlap(self.values, other.values);

  const dimensions = {
    interests: pct("d_interests"),
    values: pct("d_values"),
    lifestyle: pct("d_lifestyle"),
    communication: pct("d_comms"),
    intent: pct("d_intent"),
  };
  const overall = get("d_overall");
  const score =
    overall?.type === "score"
      ? Math.max(0, Math.min(100, Math.round((overall.value / 4) * 100)))
      : 60;
  const verdict: MatchReport["verdict"] =
    score >= 70 ? "recommend" : score >= 55 ? "cautious" : "pass";

  const reasons: string[] = [];
  if (shared.length)
    reasons.push(`你們都喜歡「${shared.slice(0, 2).join("、")}」——第一次見面不會沒話講`);
  if (sharedVals.length) reasons.push(`你把「${sharedVals[0]}」看得很重，對方也一樣`);
  if (!yes("n_comms_diff")) reasons.push("溝通節奏相容，一來一往不會卡");
  if (!yes("n_intent_diff")) reasons.push("想找的關係節奏一致，不會一個想衝一個想慢");
  if (reasons.length === 0) reasons.push("生活型態互補，適合從低壓力的慢溫開始");

  const redFlags: string[] = [];
  if (yes("n_comms_diff")) redFlags.push("你們的溝通偏好不同，前期節奏需要一點磨合");
  if (yes("n_intent_diff")) redFlags.push("對關係節奏的期待有明顯落差，建議先講清楚");
  if (redFlags.length === 0) redFlags.push("暫時沒有需要留意的部分");

  const sharedTopics = Array.from(new Set([...shared, ...sharedVals])).slice(0, 4);
  if (sharedTopics.length === 0) sharedTopics.push("週末怎麼過", "最近著迷的東西");

  const top = sharedTopics[0];
  const summaryForUser =
    verdict === "recommend"
      ? `我的判斷：值得認識。你們在「${top}」有明顯共鳴，聊天起始溫度比陌生人高不少。開場話題我已經備好了。`
      : verdict === "cautious"
        ? `可以認識，但不用急。${reasons[0]}。如果聊得來再推進，我會繼續幫你觀察。`
        : `我建議先跳過：${reasons[0]}。省下你的時間，這是我的工作。`;

  return { score, verdict, dimensions, reasons, redFlags, sharedTopics, summaryForUser };
}

/** 本機規則報告（mock provider；決策層不參與） */
export async function mockMatchReport(
  self: CompiledProfile,
  other: PublicProfile,
  _qa: string,
  pairKey: string,
  _sessionId?: string,
): Promise<MatchReport> {
  const res = await decide({
    state: reportState(self, other),
    questions: reportQuestions(),
    provider: "mock",
    fallback: () => localReportAnswers(self, other, pairKey)[0],
  });
  return composeReport(self, other, res.answers);
}

/** 決策層報告（hybrid 模式）：Jev 評分，失敗逐題退回規則 */
export async function decisionMatchReport(
  self: CompiledProfile,
  other: PublicProfile,
  qa: string,
  pairKey: string,
  sessionId?: string,
  memory: FeedbackMemory = EMPTY_MEMORY,
): Promise<MatchReport> {
  const local = localReportAnswers(self, other, pairKey);
  const res = await decide({
    state: reportState(self, other, qa, memory),
    questions: reportQuestions(),
    fallback: (q) => local.find((a) => a.id === q.id) ?? local[0],
    sessionId,
  });
  if (res.source === "mock" && res.note)
    console.warn(`[report] decision fallback → ${res.note}`);

  const report = composeReport(self, other, res.answers);
  const ruleReport = composeReport(self, other, local);

  // 有 Jev/LLM 時，記憶已進 state 由決策層自行權衡；只有退到規則層才顯式加權
  let final = report;
  let deltaInfo = "";
  if (res.source === "mock" && memory.hasMemory) {
    const shared = self.interests.filter((i) => other.interests.includes(i));
    const { delta, notes } = memoryAdjustment(memory, shared);
    if (delta !== 0) {
      const score = Math.max(0, Math.min(100, report.score + delta));
      final = {
        ...report,
        score,
        verdict: score >= 70 ? "recommend" : score >= 55 ? "cautious" : "pass",
        reasons: notes.length
          ? [...report.reasons, `回饋記憶：${notes.join("；")}`]
          : report.reasons,
      };
      deltaInfo = `（本次 ${delta >= 0 ? "+" : ""}${delta}）`;
    }
  }

  return {
    ...final,
    decisionSource: res.source,
    decisionModel: res.model,
    decisionCoverage: res.coverage,
    ruleScore: ruleReport.score,
    memoryNote: memory.hasMemory
      ? `回饋記憶：${memory.note}${deltaInfo}`
      : undefined,
  };
}

// ================= 破冰 =================// ================= 破冰 =================
export async function mockIcebreakers(
  self: CompiledProfile,
  _other: PublicProfile,
  sharedTopics: string[],
  _sessionId?: string,
): Promise<string[]> {
  const t0 = sharedTopics[0] ?? "生活";
  const t1 = sharedTopics[1] ?? t0;
  return [
    `哈囉！我家月老說我們都喜歡「${t0}」，它逼我來問：你最近一次為了${t0}做出最瘋狂的事是什麼？`,
    `正式認識一下 🙂 我是${self.nickname}。聽說我們在「${t0}」頻率很像——你入坑多久了？`,
    `我家月老說要幫我開場，結果它只擠出這句：我們都喜歡${t1}。這題不用急著回，想到再說就好。`,
  ];
}
