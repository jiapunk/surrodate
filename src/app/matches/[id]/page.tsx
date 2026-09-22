"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ScoreRing from "@/components/ScoreRing";
import { IconCheck, IconFlag } from "@/components/Icons";
import { api, useMe } from "@/lib/client";
import type { MatchReport } from "@/lib/types";

interface Detail {
  id: string;
  status: string;
  other: {
    id: string;
    name: string;
    emoji: string;
    isBot: boolean;
    tagline: string;
    bio: string;
  };
  myScore: number;
  theirScore: number;
  myReport: MatchReport | null;
  theirReport: MatchReport | null;
  myApproved: boolean;
  theirApproved: boolean;
  icebreakers: string[] | null;
  isBot: boolean;
  myFeedback: {
    metWith: boolean | null;
    rating: number | null;
    tags: string[];
    note: string | null;
  } | null;
  myFeedback2: {
    metWith: boolean | null;
    rating: number | null;
    tags: string[];
    note: string | null;
  } | null;
  secondDate: {
    id: string;
    matchId: string;
    status: "proposed" | "accepted";
    plan: {
      title: string;
      when: string;
      placeType: string;
      ideas: string[];
      topic: string;
      why: string;
    };
    decisionSource: "jev" | "llm" | "mock" | null;
    myAccepted: boolean;
    bothAccepted: boolean;
  } | null;
}

const FB_TAGS = [
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

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me, loading } = useMe();
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  // 互動回饋表單
  const [metWith, setMetWith] = useState<boolean | null>(null);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [fNote, setFNote] = useState("");
  const [fbSaved, setFbSaved] = useState(false);
  const [memNote, setMemNote] = useState<string | null>(null);
  const [fbBusy, setFbBusy] = useState(false);
  const [sdBusy, setSdBusy] = useState(false);
  // 第二次約會回饋（round 2）
  const [metWith2, setMetWith2] = useState<boolean | null>(null);
  const [rating2, setRating2] = useState(0);
  const [tags2, setTags2] = useState<string[]>([]);
  const [fNote2, setFNote2] = useState("");
  const [fbSaved2, setFbSaved2] = useState(false);
  const [memNote2, setMemNote2] = useState<string | null>(null);
  const [fbBusy2, setFbBusy2] = useState(false);

  const load = useCallback(() => {
    api<Detail>(`/api/matches/${id}`)
      .then((dd) => {
        setD(dd);
        if (dd.myFeedback) {
          setFbSaved(true);
          setMetWith(dd.myFeedback.metWith);
          setRating(dd.myFeedback.rating ?? 0);
          setTags(dd.myFeedback.tags);
          setFNote(dd.myFeedback.note ?? "");
        }
        if (dd.myFeedback2) {
          setFbSaved2(true);
          setMetWith2(dd.myFeedback2.metWith);
          setRating2(dd.myFeedback2.rating ?? 0);
          setTags2(dd.myFeedback2.tags);
          setFNote2(dd.myFeedback2.note ?? "");
        }
      })
      .catch(() => router.replace("/matches"));
  }, [id, router]);

  async function secondDateAction(action: "accept" | "regenerate") {
    setSdBusy(true);
    try {
      await api("/api/second-date", {
        method: "POST",
        body: JSON.stringify({ matchId: id, action }),
      });
      load();
    } finally {
      setSdBusy(false);
    }
  }

  async function submitFeedback2() {
    setFbBusy2(true);
    try {
      const res = await api<{ ok: boolean; memory: { note: string } }>(
        "/api/feedback",
        {
          method: "POST",
          body: JSON.stringify({
            matchId: id,
            round: 2,
            metWith: metWith2,
            rating: rating2 || null,
            tags: tags2,
            note: fNote2,
          }),
        },
      );
      setFbSaved2(true);
      setMemNote2(res.memory?.note ?? null);
    } finally {
      setFbBusy2(false);
    }
  }

  async function submitFeedback() {
    setFbBusy(true);
    try {
      const res = await api<{
        ok: boolean;
        memory: { note: string };
        secondDate: Detail["secondDate"];
      }>("/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          matchId: id,
          metWith,
          rating: rating || null,
          tags,
          note: fNote,
        }),
      });
      setFbSaved(true);
      setMemNote(res.memory?.note ?? null);
      if (res.secondDate) load();
    } finally {
      setFbBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && !me) router.replace("/");
    if (me) load();
  }, [me, loading, load, router]);

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      await api(`/api/matches/${id}`, {
        method: "POST",
        body: JSON.stringify({ approve }),
      });
      load();
    } finally {
      setBusy(false);
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
  if (!d)
    return (
      <>
        <AppHeader />
        <main className="flex flex-1 items-center justify-center p-8 text-muted">
          載入中…
        </main>
      </>
    );

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-3xl flex-1 px-4 pb-16">
        {/* 對象 */}
        <div className="card rise-in mt-8 p-7 text-center">
          <span className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-line bg-paper text-4xl">
            {d.other.emoji}
          </span>
          <h1 className="font-display text-2xl font-bold">
            {d.other.name}
            {d.other.isBot && (
              <span className="ml-2 rounded border border-line px-2 py-0.5 align-middle text-[10px] font-normal text-muted">
                模擬用戶
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted">{d.other.tagline}</p>
          {d.other.bio && (
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-soft">
              「{d.other.bio}」
            </p>
          )}
          <div className="mt-6 flex items-center justify-center gap-10">
            <div className="text-center">
              <ScoreRing score={d.myScore} size={82} label="你的月老" />
            </div>
            <div className="font-display text-xl text-muted">×</div>
            <div className="text-center">
              <ScoreRing score={d.theirScore} size={82} label="對方月老" />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            雙方月老的評分都超過 70，才會形成這個配對。
          </p>
        </div>

        {d.myReport && (
          <ReportCard
            title="你的月老的評估報告"
            report={d.myReport}
          />
        )}

        {d.theirReport && (
          <ReportCard
            title={`${d.other.name} 的月老的評估（節選）`}
            report={{
              ...d.theirReport,
              reasons: d.theirReport.reasons.slice(0, 2),
            }}
          />
        )}

        {/* 決策 */}
        <div className="card mt-4 p-5">
          {d.status === "matched" ? (
            <div>
              <div className="mb-4 text-center">
                <span className="inline-flex items-center gap-2 rounded-full bg-sage-soft px-4 py-1.5 text-sm font-bold text-sage">
                  <IconCheck size={15} />
                  配對成功，聊天室已開啟
                </span>
              </div>
              {d.icebreakers && (
                <div className="mb-5">
                  <div className="mb-2 text-xs font-bold text-muted">
                    月老準備的開場話題（點一下複製）
                  </div>
                  <div className="space-y-2">
                    {d.icebreakers.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => navigator.clipboard?.writeText(s)}
                        className="w-full rounded-xl border border-line bg-paper p-3.5 text-left text-sm leading-relaxed transition hover:border-ink/30"
                      >
                        {s}
                        <span className="ml-2 text-xs text-muted">複製</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Link
                href={`/chat/${d.id}`}
                className="btn btn-accent block w-full py-3.5 text-center"
              >
                進入聊天室
              </Link>

              {/* P2 互動回饋：見面回饋 → 代理人的篩選記憶 */}
              <div className="mt-6 rounded-xl border border-line bg-paper p-4">
                <div className="mb-1 text-sm font-bold">
                  見面回饋
                  <span className="ml-2 text-xs font-normal text-muted">
                    你的月老會記住這次心得，調整下次篩選
                  </span>
                </div>
                {memNote && (
                  <div className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-xs leading-relaxed text-ink-soft">
                    代理人記住了：{memNote}
                  </div>
                )}
                {fbSaved && !memNote ? (
                  <div className="mt-2 rounded-lg bg-sage-soft px-3 py-2 text-xs text-sage">
                    已收到你的回饋，代理人會在下次配對時參考。
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted">有見面嗎？</span>
                      <button
                        onClick={() => setMetWith(true)}
                        className={`chip ${metWith === true ? "chip-on" : ""}`}
                      >
                        有
                      </button>
                      <button
                        onClick={() => setMetWith(false)}
                        className={`chip ${metWith === false ? "chip-on" : ""}`}
                      >
                        還沒有
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setRating(n)}
                          aria-label={`${n} 分`}
                          className={`text-xl leading-none ${
                            n <= rating ? "text-amber" : "text-line"
                          }`}
                        >
                          ★
                        </button>
                      ))}
                      <span className="ml-2 text-xs text-muted">
                        {rating ? `${rating} 分` : "整體感覺"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {FB_TAGS.map((t) => (
                        <button
                          key={t}
                          onClick={() =>
                            setTags((prev) =>
                              prev.includes(t)
                                ? prev.filter((x) => x !== t)
                                : [...prev, t],
                            )
                          }
                          className={`chip ${tags.includes(t) ? "chip-on" : ""}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <input
                      value={fNote}
                      onChange={(e) => setFNote(e.target.value)}
                      placeholder="想補充什麼？（選填）"
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                    <button
                      onClick={submitFeedback}
                      disabled={fbBusy || (metWith === null && rating === 0 && tags.length === 0)}
                      className="btn btn-outline w-full py-2.5 text-sm disabled:opacity-50"
                    >
                      {fbSaved ? "更新回饋" : "送出回饋"}
                    </button>
                  </div>
                )}
              </div>

              {/* P2.5 見面後續約：正向回饋 → 第二次約會提案 */}
              {d.secondDate && (
                <div className="mt-4 rounded-xl border border-accent/40 bg-accent-soft/40 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">
                      {d.secondDate.status === "accepted"
                        ? "第二次約會已排定"
                        : "第二次約會提案"}
                    </span>
                    {d.secondDate.decisionSource && (
                      <span className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted">
                        決策 {"//"} {d.secondDate.decisionSource.toUpperCase()}
                      </span>
                    )}
                    {d.secondDate.status === "accepted" && (
                      <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[10px] font-bold text-sage">
                        聊天室已置頂
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-ink">
                    {d.secondDate.plan.title}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {d.secondDate.plan.when}｜{d.secondDate.plan.placeType}
                  </div>
                  <ul className="mt-2 space-y-1 text-xs leading-relaxed text-ink-soft">
                    {d.secondDate.plan.ideas.map((t, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-accent">·</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 text-xs text-ink-soft">
                    <span className="text-muted">話題：</span>
                    {d.secondDate.plan.topic}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    月老的判斷：{d.secondDate.plan.why}
                  </div>
                  {d.secondDate.status !== "accepted" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => secondDateAction("regenerate")}
                        disabled={sdBusy}
                        className="btn btn-outline flex-1 py-2 text-xs disabled:opacity-50"
                      >
                        換一個
                      </button>
                      <button
                        onClick={() => secondDateAction("accept")}
                        disabled={sdBusy || d.secondDate.myAccepted}
                        className="btn btn-accent flex-1 py-2 text-xs disabled:opacity-50"
                      >
                        {d.secondDate.myAccepted ? "等待對方回應…" : "就這麼辦"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 第二次約會回饋（round 2）：更強的記憶訊號 */}
              {d.secondDate && d.secondDate.status === "accepted" && (
                <div className="mt-4 rounded-xl border border-line bg-paper p-4">
                  <div className="mb-1 text-sm font-bold">
                    第二次約會回饋
                    <span className="ml-2 text-xs font-normal text-muted">
                      權重加倍——關係推進的訊號最強
                    </span>
                  </div>
                  {memNote2 && (
                    <div className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-xs leading-relaxed text-ink-soft">
                      代理人更新了記憶：{memNote2}
                    </div>
                  )}
                  {fbSaved2 && !memNote2 ? (
                    <div className="mt-2 rounded-lg bg-sage-soft px-3 py-2 text-xs text-sage">
                      已收到第二次約會回饋，記憶已加權更新。
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted">第二次約會成行了嗎？</span>
                        <button
                          onClick={() => setMetWith2(true)}
                          className={`chip ${metWith2 === true ? "chip-on" : ""}`}
                        >
                          有
                        </button>
                        <button
                          onClick={() => setMetWith2(false)}
                          className={`chip ${metWith2 === false ? "chip-on" : ""}`}
                        >
                          還沒
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            onClick={() => setRating2(n)}
                            aria-label={`第二次約會 ${n} 分`}
                            className={`text-xl leading-none ${
                              n <= rating2 ? "text-amber" : "text-line"
                            }`}
                          >
                            ★
                          </button>
                        ))}
                        <span className="ml-2 text-xs text-muted">
                          {rating2 ? `${rating2} 分` : "這次的整體感覺"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {FB_TAGS.map((t) => (
                          <button
                            key={t}
                            onClick={() =>
                              setTags2((prev) =>
                                prev.includes(t)
                                  ? prev.filter((x) => x !== t)
                                  : [...prev, t],
                              )
                            }
                            className={`chip ${tags2.includes(t) ? "chip-on" : ""}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <input
                        value={fNote2}
                        onChange={(e) => setFNote2(e.target.value)}
                        placeholder="這次有什麼不一樣？（選填）"
                        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                      <button
                        onClick={submitFeedback2}
                        disabled={
                          fbBusy2 ||
                          (metWith2 === null && rating2 === 0 && tags2.length === 0)
                        }
                        className="btn btn-outline w-full py-2.5 text-sm disabled:opacity-50"
                      >
                        {fbSaved2 ? "更新第二次回饋" : "送出第二次回饋"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : d.status === "declined" ? (
            <div className="text-center text-sm text-muted">
              這個配對已婉拒。你的月老會繼續替你留意下一個合適的人。
              <Link
                href="/matches"
                className="mt-2 block text-accent underline underline-offset-2"
              >
                回配對列表
              </Link>
            </div>
          ) : (
            <div>
              {d.myApproved ? (
                <div className="text-center">
                  <div className="mb-3 text-sm text-muted">
                    {d.theirApproved
                      ? "對方也同意了，正在開啟聊天室…"
                      : "你已同意，等待對方回應中…"}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-muted">
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
                    等待中
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => decide(false)}
                    disabled={busy}
                    className="btn btn-outline flex-1 py-3 text-sm"
                  >
                    先不用
                  </button>
                  <button
                    onClick={() => decide(true)}
                    disabled={busy}
                    className="btn btn-accent flex-1 py-3 text-sm disabled:opacity-60"
                  >
                    我也願意
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          想看兩位月老的完整對話，請到{" "}
          <Link href="/agent" className="text-accent underline underline-offset-2">
            我的月老
          </Link>{" "}
          展開對談紀錄。
        </p>
      </main>
    </>
  );
}

function ReportCard({
  title,
  report,
}: {
  title: string;
  report: MatchReport;
}) {
  return (
    <div className="card rise-in mt-4 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm font-bold">
        {title}
        {report.decisionSource && (
          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] font-normal text-muted">
            決策 {"//"} {report.decisionSource.toUpperCase()}
            {report.ruleScore !== undefined && report.decisionSource !== "mock" && (
              <>
                {" "}· 規則 {report.ruleScore} → {report.score}
                <span className={report.score > report.ruleScore ? " text-sage" : report.score < report.ruleScore ? " text-amber" : ""}>
                  {" "}{report.score === report.ruleScore ? "Δ0" : `Δ${report.score > report.ruleScore ? "+" : ""}${report.score - report.ruleScore}`}
                </span>
              </>
            )}
          </span>
        )}
      </div>

      {report.memoryNote && (
        <div className="mb-4 rounded-lg border border-line bg-paper px-3 py-2 text-xs leading-relaxed text-ink-soft">
          {report.memoryNote}
        </div>
      )}

      <div className="mb-5 grid grid-cols-5 gap-2 text-center">
        {(
          [
            ["興趣", report.dimensions.interests],
            ["價值觀", report.dimensions.values],
            ["生活", report.dimensions.lifestyle],
            ["溝通", report.dimensions.communication],
            ["意圖", report.dimensions.intent],
          ] as const
        ).map(([label, v]) => (
          <div key={label}>
            <div className="h-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-all duration-1000"
                style={{ width: `${v}%` }}
              />
            </div>
            <div className="mt-1.5 text-[10px] text-muted">
              {label} {v}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-2 text-xs font-bold text-muted">推薦理由</div>
      <ul className="mb-4 space-y-1.5 text-sm leading-relaxed">
        {report.reasons.map((r, i) => (
          <li key={i} className="flex gap-2.5">
            <IconCheck size={15} className="mt-0.5 shrink-0 text-sage" />
            <span className="text-ink-soft">{r}</span>
          </li>
        ))}
      </ul>

      <div className="mb-2 text-xs font-bold text-muted">留意事項</div>
      <ul className="mb-4 space-y-1.5 text-sm leading-relaxed">
        {report.redFlags.map((r, i) => (
          <li key={i} className="flex gap-2.5">
            <IconFlag size={14} className="mt-1 shrink-0 text-amber" />
            <span className="text-ink-soft">{r}</span>
          </li>
        ))}
      </ul>

      {report.sharedTopics.length > 0 && (
        <>
          <div className="mb-2 text-xs font-bold text-muted">共同話題</div>
          <div className="flex flex-wrap gap-1.5">
            {report.sharedTopics.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
