import { prisma } from "./db";
import type { CompiledProfile } from "./types";

/**
 * 互動回饋記憶（賽博月老 P2）：
 *   見面回饋（好/不好 + 標籤）→ 代理人的篩選記憶 → 下次配對權重
 * 對齊 EvoMap「recall before, record after」：配對前 summarize、事後 record。
 */

export interface FeedbackMemory {
  total: number;
  avgRating: number | null;
  metCount: number;
  secondDates: number; // 第二次約會回饋筆數（關係推進）
  positiveInterests: Record<string, number>; // 對哪些興趣標籤的對象評價好
  negativeInterests: Record<string, number>;
  positiveTags: Record<string, number>;
  negativeTags: Record<string, number>;
  note: string; // 給 UI 的一句話摘要
  hasMemory: boolean;
}

export const EMPTY_MEMORY: FeedbackMemory = {
  total: 0,
  avgRating: null,
  metCount: 0,
  secondDates: 0,
  positiveInterests: {},
  negativeInterests: {},
  positiveTags: {},
  negativeTags: {},
  note: "",
  hasMemory: false,
};

const POSITIVE_TAGS = ["好聊", "守時", "有禮貌", "價值觀合", "很放鬆", "有火花"];
const NEGATIVE_TAGS = ["話不投機", "遲到", "沒禮貌", "照騙", "價值觀不同", "壓力大"];

function bump(map: Record<string, number>, key: string, by = 1) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + by;
}

/** 取出「我評過的對象」其興趣標籤（只有本人看得到自己的記憶） */
export async function summarizeFeedback(userId: string): Promise<FeedbackMemory> {
  const rows = await prisma.feedback.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0) return EMPTY_MEMORY;

  const matches = await prisma.match.findMany({
    where: { id: { in: rows.map((r) => r.matchId) } },
  });
  const otherIdOf = new Map(
    matches.map((m) => [
      m.id,
      m.userAId === userId ? m.userBId : m.userAId,
    ]),
  );
  const others = await prisma.user.findMany({
    where: { id: { in: [...otherIdOf.values()] } },
    include: { profile: true },
  });
  const otherById = new Map(others.map((u) => [u.id, u]));

  const mem: FeedbackMemory = {
    ...EMPTY_MEMORY,
    secondDates: rows.filter((r) => r.round === 2).length,
    positiveInterests: {},
    negativeInterests: {},
    positiveTags: {},
    negativeTags: {},
    total: rows.length,
  };

  let ratingSum = 0;
  let ratingN = 0;
  let metCount = 0;

  for (const r of rows) {
    const otherId = otherIdOf.get(r.matchId);
    const other = otherId ? otherById.get(otherId) : undefined;
    const interests =
      ((other?.profile?.compiled as unknown as CompiledProfile | null)
        ?.interests ?? []) as string[];

    const tags = ((r.tags as unknown as string[]) ?? []).filter(Boolean);
    const positive = r.metWith === true && (r.rating ?? 0) >= 4;
    const negative = r.metWith === false || (r.rating ?? 5) <= 2;

    if (r.metWith) metCount++;
    if (r.rating) {
      ratingSum += r.rating;
      ratingN++;
    }

    // 第二輪（第二次約會）是更強的訊號：權重 ×2
    const w = r.round === 2 ? 2 : 1;
    if (positive) {
      for (const i of interests) bump(mem.positiveInterests, i, w);
      for (const t of tags) if (POSITIVE_TAGS.includes(t)) bump(mem.positiveTags, t, w);
    }
    if (negative) {
      for (const i of interests) bump(mem.negativeInterests, i, w);
      for (const t of tags) if (NEGATIVE_TAGS.includes(t)) bump(mem.negativeTags, t, w);
    }
  }

  mem.metCount = metCount;
  mem.avgRating = ratingN ? Math.round((ratingSum / ratingN) * 10) / 10 : null;
  mem.hasMemory = true;

  const topPos = Object.entries(mem.positiveInterests)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k}（${v}）`);
  const topNeg = Object.entries(mem.negativeInterests)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, v]) => `${k}（${v}）`);

  const parts: string[] = [`已累積 ${rows.length} 筆回饋`];
  if (mem.secondDates > 0) parts.push(`含 ${mem.secondDates} 次第二次約會`);
  if (mem.avgRating !== null) parts.push(`平均 ${mem.avgRating} 分`);
  if (topPos.length) parts.push(`對「${topPos.join("、")}」的對象評價最好`);
  if (topNeg.length) parts.push(`對「${topNeg.join("、")}」較常不合`);
  mem.note = parts.join(" · ");
  return mem;
}

/** 記憶 → 配對分數微調（-12 到 +12） */
export function memoryAdjustment(
  memory: FeedbackMemory,
  sharedInterests: string[],
): { delta: number; notes: string[] } {
  if (!memory.hasMemory) return { delta: 0, notes: [] };
  let delta = 0;
  const notes: string[] = [];
  for (const i of sharedInterests) {
    const pos = memory.positiveInterests[i] ?? 0;
    const neg = memory.negativeInterests[i] ?? 0;
    if (pos > neg) {
      delta += Math.min(8, pos * 4);
      notes.push(`「${i}」是你偏好過的類型`);
    } else if (neg > pos) {
      delta -= Math.min(10, neg * 5);
      notes.push(`「${i}」過去較不合拍`);
    }
  }
  if (memory.avgRating !== null && memory.avgRating >= 4.5)
    delta += 2;
  return { delta: Math.max(-12, Math.min(12, delta)), notes: notes.slice(0, 3) };
}

export async function recordFeedback(
  userId: string,
  matchId: string,
  data: {
    metWith?: boolean | null;
    rating?: number | null;
    tags?: string[];
    note?: string | null;
  },
  round = 1,
): Promise<void> {
  const payload = {
    metWith: data.metWith ?? null,
    rating: data.rating ?? null,
    tags: (data.tags ?? []) as unknown as object,
    note: data.note ?? null,
  };
  await prisma.feedback.upsert({
    where: { matchId_userId_round: { matchId, userId, round } },
    update: payload,
    create: { matchId, userId, round, ...payload },
  });
}
