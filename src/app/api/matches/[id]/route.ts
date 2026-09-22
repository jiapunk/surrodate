import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toView } from "@/lib/seconddate";
import { getCurrentUserId } from "@/lib/session";
import { llm } from "@/lib/llm";
import { publicProfile } from "@/lib/profile";
import {
  publish,
} from "@/lib/bus";
import type { CompiledProfile, MatchReport, VisibilityMap } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadCtx(matchId: string, uid: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || (match.userAId !== uid && match.userBId !== uid)) return null;
  const isA = match.userAId === uid;
  const otherId = isA ? match.userBId : match.userAId;
  const [other, run, me] = await Promise.all([
    prisma.user.findUnique({
      where: { id: otherId },
      include: { profile: true },
    }),
    match.runId
      ? prisma.matchRun.findUnique({ where: { id: match.runId } })
      : Promise.resolve(null),
    prisma.user.findUnique({ where: { id: uid }, include: { profile: true } }),
  ]);
  if (!other || !me) return null;
  return { match, isA, other, run, me };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const data = await loadCtx(id, uid);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { match, isA, other, run } = data;

  const myReport = (isA ? run?.reportA : run?.reportB) as MatchReport | null;
  const theirReport = (isA ? run?.reportB : run?.reportA) as MatchReport | null;
  const [fb, fb2] = await Promise.all([
    prisma.feedback.findUnique({
      where: { matchId_userId_round: { matchId: match.id, userId: uid, round: 1 } },
    }),
    prisma.feedback.findUnique({
      where: { matchId_userId_round: { matchId: match.id, userId: uid, round: 2 } },
    }),
  ]);
  const sd = await prisma.secondDate.findUnique({ where: { matchId: match.id } });

  return NextResponse.json({
    id: match.id,
    status: match.status,
    other: {
      id: other.id,
      name: other.name,
      emoji: other.emoji,
      isBot: other.isBot,
      tagline: other.tagline,
      bio: (other.profile?.compiled as unknown as CompiledProfile | null)?.bio ?? "",
    },
    myScore: isA ? match.scoreA : match.scoreB,
    theirScore: isA ? match.scoreB : match.scoreA,
    myReport,
    theirReport,
    myApproved: isA ? match.approvedA : match.approvedB,
    theirApproved: isA ? match.approvedB : match.approvedA,
    icebreakers: match.icebreakers,
    isBot: other.isBot,
    secondDate: sd ? toView(sd, isA) : null,
    myFeedback: fb
      ? {
          metWith: fb.metWith,
          rating: fb.rating,
          tags: (fb.tags as unknown as string[]) ?? [],
          note: fb.note,
        }
      : null,
    myFeedback2: fb2
      ? {
          metWith: fb2.metWith,
          rating: fb2.rating,
          tags: (fb2.tags as unknown as string[]) ?? [],
          note: fb2.note,
        }
      : null,
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const { approve } = (await req.json()) as { approve?: boolean };
  if (typeof approve !== "boolean")
    return NextResponse.json({ error: "approve required" }, { status: 400 });

  const data = await loadCtx(id, uid);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { match, isA, other, run, me } = data;
  if (match.status !== "proposed")
    return NextResponse.json({ error: "not_proposed" }, { status: 409 });

  if (!approve) {
    await prisma.match.update({ where: { id: match.id }, data: { status: "declined" } });
    publish(`user:${uid}`, { type: "refresh" });
    publish(`user:${other.id}`, { type: "refresh" });
    return NextResponse.json({ status: "declined" });
  }

  const approvedA = isA ? true : match.approvedA;
  const approvedB = isA ? match.approvedB : true;
  const nowMatched = approvedA && approvedB;

  let icebreakers: string[] | undefined;
  if (nowMatched) {
    // 生成破冰話題（失敗時 fallback 用共同話題）
    try {
      const mine = (me.profile?.compiled as unknown as CompiledProfile) ?? null;
      const theirs = (other.profile?.compiled as unknown as CompiledProfile) ?? null;
      const shared =
        ((isA ? run?.reportA : run?.reportB) as MatchReport | null)?.sharedTopics ?? [];
      if (mine && theirs) {
        icebreakers = await llm.icebreakers(
          mine,
          publicProfile(theirs, (other.profile?.visibility as VisibilityMap) ?? null),
          shared,
          match.id,
        );
      }
    } catch (e) {
      console.error("icebreaker generation failed", e);
    }
    if (!icebreakers)
      icebreakers = ["哈囉！我家月老說我們很合拍，來聊聊？"];
  }

  await prisma.match.update({
    where: { id: match.id },
    data: {
      approvedA,
      approvedB,
      status: nowMatched ? "matched" : "proposed",
      ...(icebreakers ? { icebreakers: icebreakers as unknown as object[] } : {}),
    },
  });

  publish(`match:${match.id}`, { type: nowMatched ? "matched" : "waiting" });
  publish(`user:${uid}`, { type: "refresh" });
  publish(`user:${other.id}`, { type: "refresh" });

  return NextResponse.json({
    status: nowMatched ? "matched" : "proposed",
    icebreakers: icebreakers ?? null,
  });
}
