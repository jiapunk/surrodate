import { prisma } from "./db";
import { decide, choiceOf, type DecideAnswer, type DecideQuestion } from "./llm/decide";
import type { CompiledProfile } from "./types";
import { summarizeFeedback } from "./feedback";

/**
 * 見面後續約閉環（賽博月老 P2.5）：
 *   正向回饋（有見面 + 高分）→ 月老選出第二次約會企劃 → 雙方接受 → 聊天室置頂
 * 企劃由決策層（Jev → LLM → 規則）在 3 個候選中挑選，結果附 decisionSource 可稽核。
 */

export interface DatePlan {
  title: string;
  when: string;
  placeType: string;
  ideas: string[];
  topic: string;
  why: string;
}

export interface SecondDateView {
  id: string;
  matchId: string;
  status: "proposed" | "accepted";
  plan: DatePlan;
  decisionSource: "jev" | "llm" | "mock" | null;
  myAccepted: boolean;
  bothAccepted: boolean;
  updatedAt: Date;
}

interface PairProfile {
  userId: string;
  name: string;
  isBot: boolean;
  compiled: CompiledProfile;
}

/** 只在既有的兩個檔案之間找交集（隱私：不引入其他資訊） */
function overlap(a: string[], b: string[]): string[] {
  return a.filter((x) => b.includes(x));
}

/** 三個候選企劃（依共同興趣與回饋記憶客製文字） */
export function buildCandidates(
  me: PairProfile,
  other: PairProfile,
  memoryNote: string,
  feedbackTags: string[],
): DatePlan[] {
  const shared = overlap(me.compiled.interests, other.compiled.interests);
  const top = shared[0] ?? "生活";
  const likeTag = feedbackTags[0] ?? "好聊";
  const has = (keys: string[]) => keys.some((k) => shared.includes(k));

  const plans: DatePlan[] = [];

  // A. 文藝散步（展覽/插畫/書店/咖啡）
  plans.push({
    title: "展覽散步 ＋ 甜點收尾",
    when: "這週末下午（避開正午人潮）",
    placeType: has(["看展", "展覽", "插畫", "二手書店", "手沖咖啡", "咖啡"])
      ? "你們都熟的展覽館或獨立書店，收尾找一間甜點店"
      : "一檔雙方都沒看過的展，收尾找一間甜點店",
    ideas: [
      "各自挑 3 件最想指給對方看的作品，看完互相解說",
      "結束後散步 15 分鐘，聊上次沒聊完的話題",
    ],
    topic: `從上次的「${top}」延伸到下次想一起追的展或書`,
    why: `你們第一次在「${top}」有共鳴，第二次把它變成「一起做的事」——回饋顯示對方「${likeTag}」`,
  });

  // B. 一起動手（手作/桌遊/料理）
  plans.push({
    title: "手作體驗 ＋ 合作闖關",
    when: "下週找一天晚上（時段短、壓力小）",
    placeType: has(["桌遊", "手作", "烹飪", "料理", "烘焙"])
      ? "你們玩過的桌遊店或手作教室，直接報名雙人場"
      : "雙人手作課（陶藝、調香或甜點），成品各自帶走",
    ideas: [
      "選需要合作的題材，讓對話自然發生、不用硬找話題",
      "約好成品互相交換或一起拍照留念",
    ],
    topic: "過程裡誰先手忙腳亂——留給下一次當笑話講",
    why: `你回饋「${likeTag}」——第二次安排需要一起動手的活動，把好聊變成默契`,
  });

  // C. 戶外半日（海/山/單車/露營）
  plans.push({
    title: "半日戶外 ＋ 隨性晚餐",
    when: "下個假日早上出發（中午前回市區）",
    placeType: has(["看海", "爬山", "單車", "露營", "海邊"])
      ? "你們都喜歡的近郊路線，走完直接吃在地小店"
      : "一條好走的步道或河堤單車路線，走完直接吃在地小店",
    ideas: [
      "各自帶一樣對方不知道的小東西，路上交換",
      "不排滿行程，留一段坐著看風景的空白",
    ],
    topic: "下次想一起解鎖的路線清單",
    why: "有共同興趣的活動型約會最容易卸下防備，第二次見面剛好需要",
  });

  // 讓 why 帶上記憶（若有）
  if (memoryNote) plans[0].why += `｜記憶：${memoryNote}`;

  return plans;
}

/** 決策層：從候選挑一個（Jev → LLM → 規則） */
export async function pickPlan(
  me: PairProfile,
  other: PairProfile,
  candidates: DatePlan[],
  opts?: { sessionId?: string; context?: string },
): Promise<{ plan: DatePlan; source: "jev" | "llm" | "mock" }> {
  const keys = ["plan_a", "plan_b", "plan_c"];
  const question: DecideQuestion = {
    id: "pick_second_date",
    type: "choice",
    instructions:
      "Which second-date plan best fits this pair? Consider shared interests, the feedback memory, energy level and date vibe. Pick exactly one criterion key.",
    criteria: Object.fromEntries(
      candidates.map((c, i) => [
        keys[i],
        `${c.title}／${c.placeType}／${c.when}：${c.ideas.join("；")}`,
      ]),
    ),
  };

  const fallback = (): DecideAnswer => ({
    id: question.id,
    type: "choice",
    value: keys[0],
    confidence: 0.5,
    probabilities: {},
  });

  const res = await decide({
    state: {
      a: {
        nickname: me.compiled.nickname,
        interests: me.compiled.interests,
        vibe: me.compiled.vibe,
        comms_style: me.compiled.commsStyle,
        looking_for: me.compiled.lookingFor,
        city: me.compiled.city,
      },
      b: {
        nickname: other.compiled.nickname,
        interests: other.compiled.interests,
        vibe: other.compiled.vibe,
        comms_style: other.compiled.commsStyle,
        looking_for: other.compiled.lookingFor,
        city: other.compiled.city,
      },
      first_date_feedback: (opts?.context ?? "").slice(0, 800),
      candidates: candidates.map((c, i) => ({
        key: keys[i],
        title: c.title,
        place_type: c.placeType,
        when: c.when,
      })),
    },
    questions: [question],
    fallback,
    sessionId: opts?.sessionId,
  });

  const pickedKey = choiceOf(res.answers, question.id, keys[0]);
  const idx = Math.max(0, keys.indexOf(pickedKey));
  return { plan: candidates[idx] ?? candidates[0], source: res.source };
}

/** 產生（或重新產生）第二次約會提案並入庫 */
export async function generateSecondDate(
  matchId: string,
  requesterId: string,
  feedbackContext?: { tags: string[] },
): Promise<SecondDateView | null> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return null;

  const rows = await prisma.user.findMany({
    where: { id: { in: [match.userAId, match.userBId] } },
    include: { profile: true },
  });
  const a = rows.find((r) => r.id === match.userAId);
  const b = rows.find((r) => r.id === match.userBId);
  if (!a?.profile?.compiled || !b?.profile?.compiled) return null;

  const me = {
    userId: a.id,
    name: a.name,
    isBot: a.isBot,
    compiled: a.profile.compiled as unknown as CompiledProfile,
  };
  const other = {
    userId: b.id,
    name: b.name,
    isBot: b.isBot,
    compiled: b.profile.compiled as unknown as CompiledProfile,
  };

  // 記憶：以「提出續約的一方」為主（回饋者本人）
  const requester = requesterId === a.id ? me : other;
  const memory = await summarizeFeedback(requester.userId);
  const feedback = await prisma.feedback.findUnique({
    where: { matchId_userId_round: { matchId, userId: requester.userId, round: 1 } },
  });
  const ctx = `${memory.note}${feedbackContext?.tags?.length ? `\n本次標籤：${feedbackContext.tags.join("、")}` : ""}${feedback?.note ? `\n回饋備註：${feedback.note}` : ""}`;

  const candidates = buildCandidates(me, other, memory.note, feedbackContext?.tags ?? []);
  const { plan, source } = await pickPlan(me, other, candidates, {
    sessionId: `sd2:${matchId}`, // 只放 ASCII（會進 HTTP header）
    context: ctx,
  });

  const existing = await prisma.secondDate.findUnique({ where: { matchId } });
  const saved = existing
    ? await prisma.secondDate.update({
        where: { matchId },
        data: { plan: plan as unknown as object, decisionSource: source, status: "proposed" },
      })
    : await prisma.secondDate.create({
        data: {
          matchId,
          plan: plan as unknown as object,
          decisionSource: source,
          // 模擬用戶同意由 agent 代表本人
          acceptedA: a.isBot,
          acceptedB: b.isBot,
        },
      });

  if (saved.acceptedA && saved.acceptedB && saved.status !== "accepted") {
    await prisma.secondDate.update({ where: { matchId }, data: { status: "accepted" } });
    saved.status = "accepted";
  }

  return toView(saved, match.userAId === requester.userId);
}


/** 接受目前使用者那一側；雙方都接受 → accepted */
export async function acceptSecondDate(
  matchId: string,
  userId: string,
): Promise<SecondDateView | null> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || (match.userAId !== userId && match.userBId !== userId)) return null;
  const row = await prisma.secondDate.findUnique({ where: { matchId } });
  if (!row) return null;

  const isA = match.userAId === userId;
  const data = isA ? { acceptedA: true } : { acceptedB: true };
  const next = {
    acceptedA: isA ? true : row.acceptedA,
    acceptedB: isA ? row.acceptedB : true,
  };
  const updated = await prisma.secondDate.update({
    where: { matchId },
    data: {
      ...data,
      status: next.acceptedA && next.acceptedB ? "accepted" : "proposed",
    },
  });
  const v = toView(updated, isA);
  return v;
}

export function toView(
  row: {
    id: string;
    matchId: string;
    status: string;
    plan: unknown;
    decisionSource: string | null;
    acceptedA: boolean;
    acceptedB: boolean;
    updatedAt: Date;
  },
  isA: boolean,
): SecondDateView {
  return {
    id: row.id,
    matchId: row.matchId,
    status: row.status === "accepted" ? "accepted" : "proposed",
    plan: row.plan as unknown as DatePlan,
    decisionSource: (row.decisionSource as SecondDateView["decisionSource"]) ?? null,
    myAccepted: isA ? row.acceptedA : row.acceptedB,
    bothAccepted: row.acceptedA && row.acceptedB,
    updatedAt: row.updatedAt,
  };
}
