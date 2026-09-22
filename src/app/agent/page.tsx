"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ScoreRing from "@/components/ScoreRing";
import RunStream from "@/components/RunStream";
import { IconCompass, IconRadar } from "@/components/Icons";
import { api, timeAgo, useMe, useUserBus } from "@/lib/client";
import type { MatchReport } from "@/lib/types";

interface RunRow {
  id: string;
  status: string;
  other: { name: string; emoji: string; isBot: boolean };
  myReport: MatchReport | null;
  createdAt: string;
  matchId: string | null;
  eventCount: number;
}

export default function AgentPage() {
  const { me, loading } = useMe();
  const router = useRouter();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [launching, setLaunching] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ runs: RunRow[] }>("/api/agent/runs");
      setRuns(d.runs);
      return d.runs;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!loading && !me) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me]);

  useEffect(() => {
    if (me) load();
  }, [me, load]);

  useUserBus(() => {
    load();
  });

  async function launch() {
    if (launching) return;
    setMsg(null);
    setLaunching(true);
    try {
      const { runIds } = await api<{ runIds: string[] }>("/api/matching/run", {
        method: "POST",
      });
      await load();
      setExpanded(new Set(runIds));
    } catch (e) {
      const m = (e as Error).message;
      setMsg(
        m === "no_candidates"
          ? "目前沒有新的候選人了——你把所有人都見過一輪了。"
          : m === "profile_not_ready"
            ? "請先完成月老訪談建立檔案。"
            : "出擊失敗，請稍後再試。",
      );
    } finally {
      setLaunching(false);
    }
  }

  if (!me)
    return (
      <>
        <AppHeader />
        <main className="flex flex-1 items-center justify-center p-8 text-muted">
          {loading ? "載入中…" : "請先選擇身分"}
        </main>
      </>
    );

  const ready = me.profileStatus === "ready";
  const activeRuns = runs.filter((r) => r.status === "running");
  const doneRuns = runs.filter((r) => r.status !== "running");

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-3xl flex-1 px-4 pb-16">
        {/* 狀態卡 */}
        <div className="card mt-8 flex flex-col items-center gap-5 p-6 sm:flex-row">
          <div className="relative">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-paper text-ink-soft">
              <IconCompass size={24} />
            </span>
            {activeRuns.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {activeRuns.length}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h1 className="font-display text-xl font-bold">我的月老</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {activeRuns.length > 0
                ? `正在與 ${activeRuns.length} 位對象的月老對談中，整個過程你可以即時旁觀。`
                : ready
                  ? "待命中。按下按鈕，祂會先替你跟候選人的月老面談並評分。"
                  : "你的月老還沒有你的檔案，先完成訪談吧。"}
            </p>
          </div>
          {ready ? (
            <button
              onClick={launch}
              disabled={launching}
              className="btn btn-accent px-6 py-3 disabled:opacity-60"
            >
              <IconRadar size={17} />
              {launching ? "正在安排…" : "月老出發"}
            </button>
          ) : (
            <Link href="/onboarding" className="btn btn-accent px-6 py-3">
              開始訪談
            </Link>
          )}
        </div>

        {msg && (
          <div className="card rise-in mt-3 border-amber/40 bg-amber-soft p-3 text-center text-sm text-ink-soft">
            {msg}
          </div>
        )}

        {runs.length === 0 && ready && (
          <div className="card mt-4 p-10 text-center text-muted">
            還沒有對談紀錄。
            <br />
            按下「月老出發」，看看祂怎麼替你篩選。
          </div>
        )}

        <div className="mt-4 space-y-3">
          {[...activeRuns, ...doneRuns].map((r) => {
            const isOpen = expanded.has(r.id);
            return (
              <div key={r.id} className="card overflow-hidden">
                <button
                  onClick={() => {
                    const next = new Set(expanded);
                    if (next.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    setExpanded(next);
                  }}
                  className="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-paper/70"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-xl">
                    {r.other.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-bold">
                      {r.other.name}
                      {r.other.isBot && (
                        <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-normal text-muted">
                          模擬用戶
                        </span>
                      )}
                      {r.status === "running" && (
                        <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[10px] text-sage">
                          對談中
                        </span>
                      )}
                      {r.matchId && (
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-accent-deep">
                          已配對
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {timeAgo(r.createdAt)} ·{" "}
                      {r.status === "running"
                        ? "進行中"
                        : `${r.eventCount} 則對談紀錄`}
                    </div>
                  </div>
                  {r.myReport && (
                    <div className="shrink-0">
                      <ScoreRing score={r.myReport.score} size={50} />
                    </div>
                  )}
                  <span className="ml-1 text-xs text-muted">
                    {isOpen ? "收起" : "展開"}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    <RunStream
                      runId={r.id}
                      other={r.other}
                      onDone={() => load()}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
