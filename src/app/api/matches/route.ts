import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/session";
import type { MatchReport } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [matches, runs] = await Promise.all([
    prisma.match.findMany({
      where: { OR: [{ userAId: uid }, { userBId: uid }] },
      orderBy: { createdAt: "desc" },
    }),
    prisma.matchRun.findMany({
      where: { OR: [{ userAId: uid }, { userBId: uid }], status: "completed" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const userIds = new Set<string>();
  for (const m of matches) {
    userIds.add(m.userAId);
    userIds.add(m.userBId);
  }
  for (const r of runs) {
    userIds.add(r.userAId);
    userIds.add(r.userBId);
  }
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, name: true, emoji: true, isBot: true, tagline: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const runById = new Map(runs.map((r) => [r.id, r]));
  const runIdsWithMatch = new Set(
    matches.map((m) => m.runId).filter(Boolean) as string[],
  );

  const shape = (m: (typeof matches)[number]) => {
    const isA = m.userAId === uid;
    const other = userMap.get(isA ? m.userBId : m.userAId);
    const myReport = (isA ? runById.get(m.runId ?? "")?.reportA : runById.get(m.runId ?? "")?.reportB) as MatchReport | null;
    const theirReport = (isA ? runById.get(m.runId ?? "")?.reportB : runById.get(m.runId ?? "")?.reportA) as MatchReport | null;
    return {
      id: m.id,
      status: m.status,
      other: other ?? { name: "未知", emoji: "❓", isBot: false, tagline: "" },
      myScore: isA ? m.scoreA : m.scoreB,
      theirScore: isA ? m.scoreB : m.scoreA,
      myReport,
      theirReport,
      myApproved: isA ? m.approvedA : m.approvedB,
      theirApproved: isA ? m.approvedB : m.approvedA,
      createdAt: m.createdAt,
    };
  };

  const filtered = runs
    .filter((r) => !runIdsWithMatch.has(r.id))
    .map((r) => {
      const isA = r.userAId === uid;
      const other = userMap.get(isA ? r.userBId : r.userAId);
      const myReport = (isA ? r.reportA : r.reportB) as MatchReport | null;
      return {
        runId: r.id,
        other: other ?? { name: "未知", emoji: "❓", isBot: false, tagline: "" },
        myReport,
        theirReport: (isA ? r.reportB : r.reportA) as MatchReport | null,
        createdAt: r.createdAt,
      };
    });

  return NextResponse.json({
    proposals: matches.filter((m) => m.status === "proposed").map(shape),
    matched: matches.filter((m) => m.status === "matched").map(shape),
    declined: matches.filter((m) => m.status === "declined").map(shape),
    filtered,
  });
}
