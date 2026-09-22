"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { IconArrowRight, IconCompass } from "@/components/Icons";
import { api, useMe } from "@/lib/client";

interface Turn {
  role: "agent" | "user";
  content: string;
  ts: number;
}

const OPENER =
  "嗨，我是你的專屬月老。在我替你出門認識人之前，得先夠懂你。放輕鬆，像跟朋友聊天就好——平常沒事的日子，你最喜歡做什麼？";

export default function OnboardingPage() {
  const router = useRouter();
  const { me } = useMe();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ profile: { status: string; interview: Turn[] | null } }>("/api/profile")
      .then(({ profile }) => {
        if (profile.status === "ready") {
          router.replace("/profile");
          return;
        }
        const history = profile.interview ?? [];
        if (history.length === 0) {
          setTurns([
            { role: "agent", content: OPENER, ts: Date.now() },
          ]);
        } else {
          setTurns(history);
          const userCount = history.filter((t) => t.role === "user").length;
          setDone(userCount >= 6);
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, thinking]);

  async function send() {
    const content = input.trim();
    if (!content || thinking || done) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", content, ts: Date.now() }]);
    setThinking(true);
    try {
      const res = await api<{ reply: string; done: boolean }>(
        "/api/onboarding/message",
        { method: "POST", body: JSON.stringify({ content }) },
      );
      setTurns((t) => [
        ...t,
        { role: "agent", content: res.reply, ts: Date.now() },
      ]);
      if (res.done) setDone(true);
    } catch (e) {
      if ((e as Error).message === "already_compiled") router.replace("/profile");
    } finally {
      setThinking(false);
    }
  }

  async function compile() {
    setCompiling(true);
    try {
      await api("/api/onboarding/compile", { method: "POST" });
      router.push("/profile?compiled=1");
    } catch {
      setCompiling(false);
    }
  }

  const progress = Math.min(6, turns.filter((t) => t.role === "user").length);

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-6">
        <div className="mt-8 mb-4">
          <h1 className="font-display text-xl font-bold">
            月老訪談
            {me && (
              <span className="ml-2 text-sm font-normal text-muted">
                {me.name}
              </span>
            )}
          </h1>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${(progress / 6) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted">{progress} / 6</span>
          </div>
        </div>

        <div className="card flex-1 overflow-y-auto p-5" style={{ minHeight: "50vh" }}>
          {turns.map((t, i) => (
            <div
              key={i}
              className={`rise-in mb-4 flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {t.role === "agent" && (
                <span className="mr-2.5 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-muted">
                  <IconCompass size={14} />
                </span>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  t.role === "user"
                    ? "rounded-br-md bg-ink text-white"
                    : "rounded-bl-md border border-line bg-white text-ink-soft"
                }`}
              >
                {t.content}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-muted">
                <IconCompass size={14} />
              </span>
              <div className="flex gap-1 rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {done ? (
          <button
            onClick={compile}
            disabled={compiling}
            className="btn btn-accent mt-4 w-full py-3.5 disabled:opacity-60"
          >
            {compiling ? "正在編譯你的檔案…" : "完成訪談，編譯我的檔案"}
            {!compiling && <IconArrowRight size={17} />}
          </button>
        ) : (
          <div className="mt-4 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !e.nativeEvent.isComposing && send()
              }
              placeholder="像跟朋友聊天一樣回答…"
              disabled={thinking}
              className="flex-1 rounded-full border border-line bg-white px-5 py-3 text-sm outline-none placeholder:text-muted/70 focus:border-ink/40"
            />
            <button
              onClick={send}
              disabled={!input.trim() || thinking}
              className="btn btn-ink px-6 disabled:opacity-40"
            >
              送出
            </button>
          </div>
        )}
      </main>
    </>
  );
}
