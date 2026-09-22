"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useMe } from "@/lib/client";
import { IconArrowRight, IconPlus } from "@/components/Icons";

interface UserRow {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  isBot: boolean;
  profileStatus: string;
}

const STEPS = [
  {
    n: "01",
    title: "打造你的專屬月老",
    desc: "六個問題的輕鬆訪談，編譯出你的交友檔案，並決定哪些資訊能被看見。",
  },
  {
    n: "02",
    title: "兩位月老先面試",
    desc: "你的月老主動出擊，與對象的月老對談、評分、交叉驗證。",
  },
  {
    n: "03",
    title: "只見值得的人",
    desc: "雙方月老都認可的配對才會送到你面前，附完整報告與開場話題。",
  },
];

export default function Home() {
  const router = useRouter();
  const { me, llmMode } = useMe();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<{ users: UserRow[] }>("/api/users").then((d) => setUsers(d.users));
  }, []);

  async function enter(id: string, status: string) {
    await api("/api/session", {
      method: "POST",
      body: JSON.stringify({ userId: id }),
    });
    router.push(status === "ready" ? "/agent" : "/onboarding");
  }

  async function createIdentity() {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const emojis = ["🐣", "🌟", "🐳", "🌵", "🎈", "🦊", "🍊", "🌙"];
      const { id } = await api<{ id: string }>("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          emoji: emojis[Math.floor(Math.random() * emojis.length)],
        }),
      });
      await api("/api/session", {
        method: "POST",
        body: JSON.stringify({ userId: id }),
      });
      router.push("/onboarding");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl flex-1 px-4 pb-20">
      {/* Hero */}
      <section className="rise-in mt-16 mb-14">
        <p className="mb-5 text-xs tracking-[0.22em] text-muted uppercase">
          賽博月老 · 心動代理交友
        </p>
        <h1 className="font-display max-w-2xl text-4xl leading-snug font-bold sm:text-5xl sm:leading-snug">
          讓分身先去認識全世界，
          <br />
          你只負責心動。
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          給不擅長開場、也沒有時間慢慢篩選的你。霞海城隍廟太遠的話——這裡有一位
          24 小時待命的線上月老。祂先替你跟對方的月老面談、過濾，
          只有雙方都點頭的人，才會出現在你面前。
        </p>

        {me && (
          <button
            onClick={() => enter(me.id, me.profileStatus)}
            className="btn btn-accent mt-8 px-7 py-3"
          >
            {me.profileStatus === "ready" ? "回到我的月老" : "繼續我的訪談"}
            <IconArrowRight size={17} />
          </button>
        )}
      </section>

      {/* 步驟 */}
      <section className="mb-16 grid gap-8 border-t border-line pt-8 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n}>
            <div className="font-display text-sm text-accent">{s.n}</div>
            <div className="mt-2 font-bold">{s.title}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {s.desc}
            </p>
          </div>
        ))}
      </section>

      {/* 身分選擇 */}
      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold">選擇示範身分</h2>
          <span className="hidden text-xs text-muted sm:inline">
            開兩個瀏覽器各選一人，即可互相即時聊天
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => enter(u.id, u.profileStatus)}
              className="card group flex items-center gap-4 p-4 text-left transition hover:border-ink/25"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-2xl">
                {u.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-bold">
                  {u.name}
                  {u.isBot && (
                    <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-normal text-muted">
                      模擬用戶
                    </span>
                  )}
                </span>
                <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">
                  {u.tagline}
                </span>
              </span>
              <IconArrowRight
                size={16}
                className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100"
              />
            </button>
          ))}

          {/* 建立新身分 */}
          <div className="card flex flex-col justify-center gap-3 p-4 sm:col-span-2">
            <div className="text-sm font-bold">建立我的新身分</div>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createIdentity()}
                placeholder="你的暱稱"
                maxLength={12}
                className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2.5 text-sm outline-none placeholder:text-muted/70 focus:border-ink/40"
              />
              <button
                onClick={createIdentity}
                disabled={!name.trim() || creating}
                className="btn btn-ink px-5 py-2.5 text-sm disabled:opacity-40"
              >
                <IconPlus size={15} />
                開始訪談
              </button>
            </div>
            <div className="text-xs text-muted">
              會先跟你的月老聊六個問題，之後隨時可以修改檔案。
            </div>
          </div>
        </div>
      </section>

      <p className="mt-14 text-center text-xs text-muted">
        {llmMode === "real"
          ? "目前由 DeepSeek V4.1 Flash 驅動對話"
          : llmMode === "mock"
            ? "展示模式：對話由內建腳本引擎生成"
            : "\u00a0"}
      </p>
    </main>
  );
}
