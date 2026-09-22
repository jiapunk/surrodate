"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ScoreRing from "@/components/ScoreRing";
import { IconCheck, IconShield } from "@/components/Icons";
import { api, timeAgo, useMe, useUserBus } from "@/lib/client";
import type { MatchReport } from "@/lib/types";

interface MatchRow {
  id: string;
  status: string;
  other: { name: string; emoji: string; isBot: boolean; tagline: string };
  myScore: number;
  theirScore: number;
  myReport: MatchReport | null;
  theirReport: MatchReport | null;
  myApproved: boolean;
  theirApproved: boolean;
  createdAt: string;
}

interface FilterRow {
  runId: string;
  other: { name: string; emoji: string; isBot: boolean };
  myReport: MatchReport | null;
  theirReport: MatchReport | null;
  createdAt: string;
}

interface Feed {
  proposals: MatchRow[];
  matched: MatchRow[];
  declined: MatchRow[];
  filtered: FilterRow[];
}

export default function MatchesPage() {
  const { me, loading } = useMe();
  const router = useRouter();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [showFiltered, setShowFiltered] = useState(false);

  const load = useCallback(() => {
    api<Feed>("/api/matches").then(setFeed).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading && !me) router.replace("/");
    if (me) load();
  }, [me, loading, load, router]);

  useUserBus(load);

  async function decide(id: string, approve: boolean) {
    await api(`/api/matches/${id}`, {
      method: "POST",
      body: JSON.stringify({ approve }),
    });
    load();
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

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-3xl flex-1 px-4 pb-16">
        <div className="mt-8 mb-5">
          <h1 className="font-display text-xl font-bold">配對</h1>
          <p className="mt-1 text-sm text-muted">
            通過你月老篩選的對象，才會出現在這裡。
          </p>
        </div>

        {!feed && <div className="card p-8 text-center text-muted">載入中…</div>}

        {feed && feed.proposals.length === 0 && feed.matched.length === 0 && (
          <div className="card p-10 text-center text-muted">
            還沒有通過篩選的配對。
            <br />
            去{" "}
            <Link href="/agent" className="text-accent underline underline-offset-2">
              我的月老
            </Link>{" "}
            讓它替你出擊。
          </div>
        )}

        {/* 待回應 */}
        {feed?.proposals.map((m) => (
          <div key={m.id} className="card rise-in mb-3 overflow-hidden">
            <div className="flex items-center gap-4 p-5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-2xl">
                {m.other.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-lg font-bold">
                    {m.other.name}
                  </span>
                  {m.other.isBot && (
                    <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
                      模擬用戶
                    </span>
                  )}
                  {m.theirApproved && (
                    <span className="flex items-center gap-1 rounded-full bg-sage-soft px-2 py-0.5 text-[10px] text-sage">
                      <IconCheck size={11} />
                      對方已同意
                    </span>
                  )}
                </div>
                <div className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">
                  {m.myReport?.summaryForUser}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.myReport?.sharedTopics.slice(0, 3).map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="hidden shrink-0 sm:block">
                <ScoreRing score={m.myScore} size={62} label="契合度" />
              </div>
            </div>
            <div className="flex gap-2 border-t border-line bg-paper/50 p-3">
              <button
                onClick={() => decide(m.id, false)}
                className="btn btn-outline flex-1 py-2.5 text-sm"
              >
                先不用
              </button>
              <Link
                href={`/matches/${m.id}`}
                className="btn btn-outline flex-1 py-2.5 text-center text-sm"
              >
                看報告
              </Link>
              <button
                onClick={() => decide(m.id, true)}
                className="btn btn-accent flex-1 py-2.5 text-sm"
              >
                想認識
              </button>
            </div>
          </div>
        ))}

        {/* 已配對 */}
        {feed && feed.matched.length > 0 && (
          <h2 className="mt-10 mb-3 text-xs font-bold tracking-wider text-muted">
            已配對，可以開始聊天
          </h2>
        )}
        {feed?.matched.map((m) => (
          <Link
            key={m.id}
            href={`/chat/${m.id}`}
            className="card rise-in mb-3 flex items-center gap-4 p-4 transition hover:border-ink/25"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-xl">
              {m.other.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{m.other.name}</div>
              <div className="mt-0.5 text-xs text-muted">
                進入聊天室 · {timeAgo(m.createdAt)}
              </div>
            </div>
            <ScoreRing score={m.myScore} size={46} />
          </Link>
        ))}

        {/* 已過濾 */}
        {feed && feed.filtered.length > 0 && (
          <>
            <button
              onClick={() => setShowFiltered(!showFiltered)}
              className="btn btn-outline mt-10 flex w-full items-center justify-between px-5 py-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <IconShield size={16} />
                月老幫你擋掉了 {feed.filtered.length} 個對象
                <span className="text-xs text-muted">
                  省下約 {feed.filtered.length * 45} 分鐘的無效聊天
                </span>
              </span>
              <span className="text-xs text-muted">
                {showFiltered ? "收起" : "查看"}
              </span>
            </button>
            {showFiltered && (
              <div className="mt-3 space-y-2">
                {feed.filtered.map((f) => {
                  const mine = f.myReport;
                  const theirs = f.theirReport;
                  const iPassed = (mine?.score ?? 0) >= 70;
                  return (
                    <div
                      key={f.runId}
                      className="card-flat flex items-center gap-3 p-3.5"
                    >
                      <span className="text-xl opacity-50">
                        {f.other.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold">{f.other.name}</div>
                        <div className="line-clamp-1 text-xs text-muted">
                          {iPassed
                            ? `你的月老認可，但對方月老認為：${theirs?.summaryForUser ?? "暫時不合"}`
                            : `你的月老：${mine?.summaryForUser ?? "共鳴不足"}`}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-muted">
                        你 {mine?.score ?? "-"} · 對方 {theirs?.score ?? "-"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
