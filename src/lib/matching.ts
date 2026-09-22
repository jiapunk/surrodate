import { prisma } from "./db";
import { llm, LLM_MODE } from "./llm";
import { summarizeFeedback } from "./feedback";
import { publish } from "./bus";
import { publicProfile } from "./profile";
import { runPart } from "./swarm";
import type { Prisma } from "@prisma/client";
import {
  MATCH_THRESHOLD,
  type CompiledProfile,
  type MatchReport,
  type RunEvent,
  type RunEventBase,
  type VisibilityMap,
} from "./types";

const MAX_CANDIDATES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pace = () => (LLM_MODE === "mock" ? sleep(650) : Promise.resolve());

type ProfileBundle = {
  userId: string;
  name: string;
  emoji: string;
  isBot: boolean;
  compiled: CompiledProfile;
  visibility: VisibilityMap | null;
};

async function loadProfile(userId: string): Promise<ProfileBundle | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!row?.profile?.compiled) return null;
  return {
    userId: row.id,
    name: row.name,
    emoji: row.emoji,
    isBot: row.isBot,
    compiled: row.profile.compiled as unknown as CompiledProfile,
    visibility: (row.profile.visibility as VisibilityMap) ?? null,
  };
}

/** 找出候選：有 ready 檔案、沒有進行中/既有配對的用戶，模擬用戶優先 */
export async function pickCandidates(userId: string): Promise<string[]> {
  const [users, runs, matches] = await Promise.all([
    prisma.user.findMany({
      where: { id: { not: userId }, profile: { status: "ready" } },
      include: { profile: true },
    }),
    prisma.matchRun.findMany({
      where: {
        status: "running",
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { userAId: true, userBId: true },
    }),
    prisma.match.findMany({
      where: {
        status: { in: ["proposed", "matched", "declined"] },
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { userAId: true, userBId: true },
    }),
  ]);

  const busy = new Set<string>();
  for (const r of [...runs, ...matches]) {
    if (r.userAId === userId) busy.add(r.userBId);
    else busy.add(r.userAId);
  }

  return users
    .filter((u) => !busy.has(u.id))
    .sort((a, b) => Number(b.isBot) - Number(a.isBot))
    .slice(0, MAX_CANDIDATES)
    .map((u) => u.id);
}

/** 觸發一輪配對：建立 run 紀錄後背景執行，回傳 run ids */
export async function startMatching(userId: string): Promise<string[]> {
  const me = await loadProfile(userId);
  if (!me) throw new Error("PROFILE_NOT_READY");
  const candidateIds = await pickCandidates(userId);
  if (candidateIds.length === 0) return [];

  const runs: string[] = [];
  for (const cid of candidateIds) {
    const run = await prisma.matchRun.create({
      data: { userAId: userId, userBId: cid, events: [] },
    });
    runs.push(run.id);
    publish(`user:${userId}`, { type: "run_started", runId: run.id });
    void runPair(run.id, me, cid); // 背景執行
  }
  return runs;
}

async function appendEvent(runId: string, e: RunEventBase) {
  const run = await prisma.matchRun.findUnique({ where: { id: runId } });
  if (!run) return;
  const events = (run.events as unknown as RunEvent[]) ?? [];
  const full = { ...e, ts: Date.now() } as RunEvent;
  events.push(full);
  await prisma.matchRun.update({
    where: { id: runId },
    data: { events: events as unknown as Prisma.InputJsonValue },
  });
  publish(`run:${runId}`, { type: "event", event: full });
}

export async function runPair(
  runId: string,
  me: ProfileBundle,
  candidateId: string,
) {
  try {
    const other = await loadProfile(candidateId);
    if (!other) throw new Error("candidate profile missing");

    const pubMe = publicProfile(me.compiled, me.visibility);
    const pubOther = publicProfile(other.compiled, other.visibility);

    await appendEvent(runId, {
      type: "phase",
      text: `已與 ${other.name} 的月老建立對談`,
    });
    await pace();

    // ---- 第一輪：我的 agent 提問，對方 agent 回答 ----
    await appendEvent(runId, {
      type: "phase",
      text: `你的月老開始訪談 ${other.name} 的月老`,
    });
    const providerOf = () => ({
      provider: LLM_MODE === "mock" ? "mock" : LLM_MODE,
      model: process.env.LLM_MODEL,
    });
    const qs1 = await runPart(
      { id: `q:${runId}:A`, kind: "questions", label: "我的月老提問", runId },
      async () => ({
        value: await llm.matchQuestions(me.compiled, pubOther, runId),
        trace: providerOf(),
      }),
    );
    const ans1 = await runPart(
      { id: `a:${runId}:B`, kind: "answers", label: "對方月老作答", runId },
      async () => ({
        value: await llm.matchAnswers(other.compiled, qs1, runId),
        trace: providerOf(),
      }),
    );
    for (let i = 0; i < qs1.length; i++) {
      await appendEvent(runId, { type: "question", side: "A", text: qs1[i] });
      await pace();
      await appendEvent(runId, { type: "answer", side: "B", text: ans1[i] ?? "…" });
      await pace();
    }

    // ---- 第二輪：對方 agent 提問，我的 agent 回答 ----
    await appendEvent(runId, {
      type: "phase",
      text: `${other.name} 的月老開始回訪你的月老`,
    });
    const qs2 = await runPart(
      { id: `q:${runId}:B`, kind: "questions", label: "對方月老提問", runId },
      async () => ({
        value: await llm.matchQuestions(other.compiled, pubMe, runId),
        trace: providerOf(),
      }),
    );
    const ans2 = await runPart(
      { id: `a:${runId}:A`, kind: "answers", label: "我的月老作答", runId },
      async () => ({
        value: await llm.matchAnswers(me.compiled, qs2, runId),
        trace: providerOf(),
      }),
    );
    for (let i = 0; i < qs2.length; i++) {
      await appendEvent(runId, { type: "question", side: "B", text: qs2[i] });
      await pace();
      await appendEvent(runId, { type: "answer", side: "A", text: ans2[i] ?? "…" });
      await pace();
    }

    // ---- 雙方報告 ----
    const qaText = [
      ...qs1.map((q, i) => `A問：${q}\nB答：${ans1[i] ?? ""}`),
      ...qs2.map((q, i) => `B問：${q}\nA答：${ans2[i] ?? ""}`),
    ].join("\n");

    await appendEvent(runId, { type: "phase", text: "雙方正在整理評估報告" });
    // P2 互動回饋記憶：各自讀自己的記憶（配對前 recall）
    const [memA, memB] = await Promise.all([
      summarizeFeedback(me.userId),
      summarizeFeedback(other.userId),
    ]);
    const reportA: MatchReport = await runPart(
      { id: `r:${runId}:A`, kind: "report", label: "我的月老評估", runId },
      async () => {
        const value = await llm.matchReport(me.compiled, pubOther, qaText, `${runId}:A`, runId, memA);
        return {
          value,
          trace: {
            provider: value.decisionSource ?? (LLM_MODE === "mock" ? "mock" : LLM_MODE),
            model: value.decisionModel ?? process.env.LLM_MODEL,
            retained: Boolean(value.decisionSource),
            answers: { score: value.score, verdict: value.verdict, dimensions: value.dimensions },
          },
        };
      },
    );
    await appendEvent(runId, { type: "report", side: "A", report: reportA });
    await pace();

    const reportB: MatchReport = await runPart(
      { id: `r:${runId}:B`, kind: "report", label: "對方月老評估", runId },
      async () => {
        const value = await llm.matchReport(other.compiled, pubMe, qaText, `${runId}:B`, runId, memB);
        return {
          value,
          trace: {
            provider: value.decisionSource ?? (LLM_MODE === "mock" ? "mock" : LLM_MODE),
            model: value.decisionModel ?? process.env.LLM_MODEL,
            retained: Boolean(value.decisionSource),
            answers: { score: value.score, verdict: value.verdict, dimensions: value.dimensions },
          },
        };
      },
    );
    await appendEvent(runId, { type: "report", side: "B", report: reportB });

    // ---- 決策 ----
    const bothYes =
      reportA.score >= MATCH_THRESHOLD && reportB.score >= MATCH_THRESHOLD;
    let matchId: string | null = null;

    if (bothYes) {
      const match = await prisma.match.create({
        data: {
          runId,
          userAId: me.userId,
          userBId: other.userId,
          scoreA: reportA.score,
          scoreB: reportB.score,
          // 模擬用戶的 agent 推薦即代表本人同意
          approvedA: me.isBot,
          approvedB: other.isBot,
        },
      });
      matchId = match.id;

      if (me.isBot || other.isBot) {
        publish(`user:${me.userId}`, { type: "refresh" });
        publish(`user:${other.userId}`, { type: "refresh" });
      }
    }

    await prisma.matchRun.update({
      where: { id: runId },
      data: {
        status: "completed",
        reportA: reportA as unknown as object,
        reportB: reportB as unknown as object,
      },
    });
    await appendEvent(runId, {
      type: "done",
      matchId,
      text: bothYes
        ? "雙方月老達成共識：值得一見"
        : "至少一位月老認為暫不適合，已為你過濾",
    });
    publish(`user:${me.userId}`, { type: "refresh" });
    publish(`user:${other.userId}`, { type: "refresh" });
  } catch (err) {
    console.error("runPair failed", err);
    await prisma.matchRun.update({
      where: { id: runId },
      data: { status: "failed" },
    }).catch(() => {});
    await appendEvent(runId, {
      type: "done",
      text: "對談中斷，請稍後再試",
    }).catch(() => {});
  }
}
