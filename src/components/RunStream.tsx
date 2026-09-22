"use client";

import { useEffect, useRef, useState } from "react";
import ScoreRing from "./ScoreRing";
import type { RunEvent } from "@/lib/types";

export default function RunStream({
  runId,
  other,
  onDone,
}: {
  runId: string;
  other: { name: string; emoji: string; isBot: boolean };
  onDone?: () => void;
}) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [closed, setClosed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const doneFired = useRef(false);

  useEffect(() => {
    const es = new EventSource(`/api/agent/runs/${runId}/stream`);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as {
          type: string;
          event?: RunEvent;
          status?: string;
        };
        if (msg.type === "event" && msg.event) {
          setEvents((prev) => [...prev, msg.event as RunEvent]);
          if (msg.event.type === "done" && !doneFired.current) {
            doneFired.current = true;
            setClosed(true);
            es.close();
            onDone?.();
          }
        } else if (msg.type === "ready" && msg.status !== "running") {
          setClosed(true);
          es.close();
          onDone?.();
        } else if (msg.type === "closed") {
          setClosed(true);
          es.close();
        }
      } catch {}
    };
    es.onerror = () => {
      setClosed(true);
      es.close();
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events]);

  const reportA = events.find(
    (e) => e.type === "report" && e.side === "A",
  ) as Extract<RunEvent, { type: "report" }> | undefined;

  return (
    <div className="mt-2 rounded-2xl border border-line bg-paper/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            closed ? "bg-line" : "bg-sage"
          }`}
        />
        {closed ? "對談已結束" : "月老對談進行中"}
      </div>

      <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
        {events.map((ev, i) => {
          if (ev.type === "phase")
            return (
              <div
                key={i}
                className="flex items-center gap-3 text-xs text-muted"
              >
                <span className="h-px flex-1 bg-line" />
                <span className="shrink-0">{ev.text}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            );
          if (ev.type === "question" || ev.type === "answer") {
            const isA = ev.side === "A";
            return (
              <div
                key={i}
                className={`rise-in flex ${isA ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[85%] ${isA ? "text-right" : ""}`}>
                  <div className="mb-1 text-[10px] text-muted">
                    {isA ? "你的月老" : `${other.name} 的月老`}
                  </div>
                  <div
                    className={`inline-block rounded-2xl px-3.5 py-2 text-left text-sm leading-relaxed ${
                      isA
                        ? "rounded-br-md bg-ink text-white"
                        : "rounded-bl-md border border-line bg-white text-ink-soft"
                    }`}
                  >
                    {ev.text}
                  </div>
                </div>
              </div>
            );
          }
          if (ev.type === "report") {
            const isA = ev.side === "A";
            const r = ev.report;
            const verdictText =
              r.verdict === "recommend"
                ? "值得一見"
                : r.verdict === "cautious"
                  ? "保留觀察"
                  : "建議跳過";
            const verdictColor =
              r.verdict === "recommend"
                ? "text-sage"
                : r.verdict === "cautious"
                  ? "text-amber"
                  : "text-muted";
            return (
              <div
                key={i}
                className="rise-in rounded-2xl border border-line bg-white p-4"
              >
                <div className="flex items-center gap-4">
                  <ScoreRing score={r.score} size={54} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted">
                      {isA ? "你的月老" : `${other.name} 的月老`}
                      的評估 ·{" "}
                      <span className={`font-bold ${verdictColor}`}>
                        {verdictText}
                      </span>
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-ink-soft">
                      {r.summaryForUser}
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          if (ev.type === "done")
            return (
              <div
                key={i}
                className="rounded-xl border border-line bg-white py-2.5 text-center text-sm"
              >
                {ev.text}
              </div>
            );
          return null;
        })}
        {!closed && (
          <div className="flex items-center gap-2 py-1 text-xs text-muted">
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
            對談進行中
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {reportA && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-2 text-xs font-bold text-muted">
            評分維度（你的月老）
          </div>
          <div className="grid grid-cols-5 gap-2 text-center">
            {(
              [
                ["興趣", reportA.report.dimensions.interests],
                ["價值觀", reportA.report.dimensions.values],
                ["生活", reportA.report.dimensions.lifestyle],
                ["溝通", reportA.report.dimensions.communication],
                ["意圖", reportA.report.dimensions.intent],
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
        </div>
      )}
    </div>
  );
}
