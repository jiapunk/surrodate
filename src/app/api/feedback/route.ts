import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/session";
import { recordFeedback, summarizeFeedback } from "@/lib/feedback";
import { generateSecondDate } from "@/lib/seconddate";

export const dynamic = "force-dynamic";

export const FEEDBACK_TAGS = [
  "好聊",
  "守時",
  "有禮貌",
  "價值觀合",
  "很放鬆",
  "有火花",
  "話不投機",
  "遲到",
  "沒禮貌",
  "照騙",
  "價值觀不同",
  "壓力大",
];

/** 我的回饋記憶摘要 */
export async function GET() {
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const memory = await summarizeFeedback(uid);
  const items = await prisma.feedback.findMany({
    where: { userId: uid },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({
    memory,
    items: items.map((i) => ({
      matchId: i.matchId,
      metWith: i.metWith,
      rating: i.rating,
      tags: (i.tags as unknown as string[]) ?? [],
      note: i.note,
      createdAt: i.createdAt,
    })),
  });
}

/** 提交回饋 */
export async function POST(req: Request) {
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    matchId?: string;
    round?: number;
    metWith?: boolean | null;
    rating?: number | null;
    tags?: string[];
    note?: string;
  };
  if (!body.matchId)
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  if (body.rating != null && (body.rating < 1 || body.rating > 5))
    return NextResponse.json({ error: "invalid_rating" }, { status: 400 });

  const match = await prisma.match.findUnique({ where: { id: body.matchId } });
  if (!match || (match.userAId !== uid && match.userBId !== uid))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (match.status !== "matched")
    return NextResponse.json({ error: "not_matched" }, { status: 409 });

  const round = body.round === 2 ? 2 : 1;
  if (round === 2) {
    // 第二輪回饋只在「第二次約會已排定」後開放
    const sd = await prisma.secondDate.findUnique({ where: { matchId: body.matchId } });
    if (!sd || sd.status !== "accepted")
      return NextResponse.json({ error: "second_date_not_accepted" }, { status: 409 });
  }

  await recordFeedback(
    uid,
    body.matchId,
    {
      metWith: body.metWith ?? null,
      rating: body.rating ?? null,
      tags: (body.tags ?? []).slice(0, 8),
      note: body.note?.slice(0, 300) ?? null,
    },
    round,
  );

  const memory = await summarizeFeedback(uid);

  // 見面後續約閉環：第一輪正向回饋（有見面 + 4 分以上）→ 月老提出第二次約會企劃
  let secondDate = null;
  if (round === 1 && body.metWith === true && (body.rating ?? 0) >= 4) {
    try {
      secondDate = await generateSecondDate(body.matchId, uid, {
        tags: body.tags ?? [],
      });
    } catch (err) {
      console.warn("[second-date] generate failed", err);
    }
  }

  return NextResponse.json({ ok: true, memory, secondDate });
}
