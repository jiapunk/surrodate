"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { IconLock } from "@/components/Icons";
import { api, useMe } from "@/lib/client";

interface Msg {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me, loading } = useMe();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [other, setOther] = useState<{
    id: string;
    name: string;
    emoji: string;
  } | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [locked, setLocked] = useState(false);
  const [plan, setPlan] = useState<{
    status: "proposed" | "accepted";
    decisionSource: "jev" | "llm" | "mock" | null;
    plan: { title: string; when: string; placeType: string; topics?: string; ideas: string[]; topic: string };
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingSentAt = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!loading && !me) {
      router.replace("/");
      return;
    }
    if (!me) return;

    fetch(`/api/matches/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.secondDate) setPlan(d.secondDate);
      })
      .catch(() => {});

    const es = new EventSource(`/api/chat/${id}/stream`);
    es.onerror = () => {
      fetch(`/api/matches/${id}`)
        .then((r) => {
          if (r.status === 423) setLocked(true);
        })
        .catch(() => {});
    };
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as {
          type: string;
          me?: string;
          other?: { id: string; name: string; emoji: string };
          messages?: Msg[];
          message?: Msg;
          userId?: string;
        };
        if (msg.type === "init") {
          setMyId(msg.me ?? null);
          setOther(msg.other ?? null);
          setMessages(msg.messages ?? []);
          setTimeout(scrollToBottom, 100);
        } else if (msg.type === "message" && msg.message) {
          setMessages((prev) =>
            prev.some((m) => m.id === msg.message!.id)
              ? prev
              : [...prev, msg.message!],
          );
          setOtherTyping(false);
          setTimeout(scrollToBottom, 50);
        } else if (
          msg.type === "typing" &&
          msg.userId &&
          msg.userId !== myId
        ) {
          setOtherTyping(true);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setOtherTyping(false), 2500);
        }
      } catch {}
    };
    return () => es.close();
  }, [id, me, loading, router, scrollToBottom, myId]);

  async function send() {
    const content = input.trim();
    if (!content) return;
    setInput("");
    try {
      await api(`/api/chat/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      if ((err as Error).message === "locked") setLocked(true);
    }
  }

  function onInputChange(v: string) {
    setInput(v);
    const now = Date.now();
    if (now - typingSentAt.current > 1800) {
      typingSentAt.current = now;
      fetch(`/api/chat/${id}/typing`, { method: "POST" }).catch(() => {});
    }
  }

  if (locked)
    return (
      <>
        <AppHeader />
        <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <IconLock size={32} className="text-muted" />
          <div className="font-bold">聊天室尚未開啟</div>
          <p className="text-sm text-muted">
            需要配對雙方都同意之後，才能開始對話。
          </p>
          <Link href="/matches" className="btn btn-ink mt-2 px-6 py-2.5 text-sm">
            回配對列表
          </Link>
        </main>
      </>
    );

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-4">
        {/* 對話標題 */}
        <div className="card mt-6 mb-3 flex items-center gap-3 p-3.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-paper text-xl">
            {other?.emoji ?? "…"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-bold">{other?.name ?? "…"}</div>
            <div className="mt-0.5 text-xs text-muted">
              {otherTyping ? (
                <span className="text-sage">正在輸入…</span>
              ) : (
                "由月老配對，現在換你們上場"
              )}
            </div>
          </div>
          <Link
            href={`/matches/${id}`}
            className="btn btn-outline px-3 py-1.5 text-xs"
          >
            配對報告
          </Link>
        </div>

        {/* 訊息 */}
        <div
          className="card flex-1 overflow-y-auto p-4"
          style={{ minHeight: "55vh" }}
        >
          <div className="mb-5 flex items-center justify-center gap-1.5 text-xs text-muted">
            <IconLock size={13} />
            這段對話只有你們兩個人看得到
          </div>

          {/* 第二次約會企劃：置頂卡片 */}
          {plan && (
            <div className="rise-in mb-5 rounded-xl border border-accent/40 bg-accent-soft/50 p-3.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold">
                  {plan.status === "accepted" ? "第二次約會已排定" : "第二次約會提案"}
                </span>
                {plan.decisionSource && (
                  <span className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[9px] text-muted">
                    決策 {"//"} {plan.decisionSource.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="text-sm font-bold">{plan.plan.title}</div>
              <div className="mt-0.5 text-xs text-muted">
                {plan.plan.when}｜{plan.plan.placeType}
              </div>
              <ul className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-ink-soft">
                {plan.plan.ideas.map((t, i) => (
                  <li key={i}>· {t}</li>
                ))}
              </ul>
            </div>
          )}
          {messages.map((m) => {
            const isMe = m.senderId === (myId ?? me?.id);
            return (
              <div
                key={m.id}
                data-msg
                className={`rise-in mb-3 flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                {!isMe && other && (
                  <span className="mr-2.5 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-sm">
                    {other.emoji}
                  </span>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isMe
                      ? "rounded-br-md bg-ink text-white"
                      : "rounded-bl-md border border-line bg-white text-ink-soft"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            );
          })}
          {otherTyping && (
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-sm">
                {other?.emoji}
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

        {/* 輸入 */}
        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !e.nativeEvent.isComposing && send()
            }
            placeholder={`跟 ${other?.name ?? "對方"} 打聲招呼…`}
            className="flex-1 rounded-full border border-line bg-white px-5 py-3 text-sm outline-none placeholder:text-muted/70 focus:border-ink/40"
          />
          <button
            onClick={send}
            disabled={!input.trim()}
            className="btn btn-ink px-6 disabled:opacity-40"
          >
            送出
          </button>
        </div>
      </main>
    </>
  );
}
