"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { IconCheck, IconEye, IconEyeOff, IconArrowRight } from "@/components/Icons";
import { api, useMe } from "@/lib/client";
import { DEFAULT_VISIBILITY, VISIBILITY_FIELDS } from "@/lib/types";
import type { CompiledProfile, VisibilityMap } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = {
  ageRange: "年齡範圍",
  city: "所在城市",
  jobField: "職業領域",
  interests: "興趣",
  values: "重視的價值",
  lifestyle: "生活型態",
  lookingFor: "想找的關係",
  commsStyle: "溝通風格",
  dealbreakers: "絕對地雷",
};

export default function ProfilePage() {
  const router = useRouter();
  const { me } = useMe();
  const [compiled, setCompiled] = useState<CompiledProfile | null>(null);
  const [visibility, setVisibility] = useState<VisibilityMap>({
    ...DEFAULT_VISIBILITY,
  });
  const [saved, setSaved] = useState(false);
  const [justCompiled, setJustCompiled] = useState(false);
  const [newChip, setNewChip] = useState<Record<string, string>>({});
  const [memory, setMemory] = useState<{
    total: number;
    avgRating: number | null;
    metCount: number;
    hasMemory: boolean;
    note: string;
    positiveInterests: Record<string, number>;
    positiveTags: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    api<{ memory: NonNullable<typeof memory> }>("/api/feedback")
      .then((r) => setMemory(r.memory))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("compiled"))
      setJustCompiled(true);
    api<{
      profile: {
        status: string;
        compiled: CompiledProfile | null;
        visibility: VisibilityMap | null;
      };
    }>("/api/profile").then(({ profile }) => {
      if (profile.status !== "ready" || !profile.compiled) {
        router.replace("/onboarding");
        return;
      }
      setCompiled(profile.compiled);
      if (profile.visibility) setVisibility(profile.visibility);
    });
  }, [router]);

  if (!compiled)
    return (
      <>
        <AppHeader />
        <main className="flex flex-1 items-center justify-center p-8 text-muted">
          載入中…
        </main>
      </>
    );

  const set = (patch: Partial<CompiledProfile>) => {
    setCompiled({ ...compiled, ...patch });
    setSaved(false);
  };

  const chipRemove =
    (field: "interests" | "values" | "dealbreakers") => (i: number) => {
      const arr = [...compiled[field]];
      arr.splice(i, 1);
      set({ [field]: arr } as Partial<CompiledProfile>);
    };

  const chipAdd = (field: "interests" | "values" | "dealbreakers") => () => {
    const v = (newChip[field] ?? "").trim();
    if (!v) return;
    set({ [field]: [...compiled[field], v] } as Partial<CompiledProfile>);
    setNewChip({ ...newChip, [field]: "" });
  };

  const chipDraft =
    (field: "interests" | "values" | "dealbreakers") => (v: string) =>
      setNewChip({ ...newChip, [field]: v });

  async function save() {
    await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ compiled, visibility }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-3xl flex-1 px-4 pb-16">
        {justCompiled && (
          <div className="rise-in card mt-6 border-accent/30 bg-accent-soft p-4 text-sm text-ink-soft">
            你的月老已根據訪談編譯出這份檔案。檢查內容、調整想分享的範圍，
            就可以讓祂出擊了。
          </div>
        )}

        {memory?.hasMemory && (
          <div className="card rise-in mt-6 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">
                代理人的記憶
                <span className="ml-2 text-xs font-normal text-muted">
                  來自你的見面回饋
                </span>
              </div>
              <span className="rounded border border-line px-2 py-0.5 font-mono text-[10px] text-muted">
                回饋 ×{memory.total}
                {memory.avgRating !== null && ` · 平均 ${memory.avgRating}`}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">{memory.note}</p>
            {Object.keys(memory.positiveInterests).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(memory.positiveInterests)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([k, v]) => (
                    <span key={k} className="chip chip-on">
                      {k} ×{v}
                    </span>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 mb-5 flex items-center justify-between">
          <h1 className="font-display text-xl font-bold">我的檔案</h1>
          <button onClick={save} className="btn btn-ink px-5 py-2 text-sm">
            {saved ? (
              <>
                <IconCheck size={15} />
                已儲存
              </>
            ) : (
              "儲存變更"
            )}
          </button>
        </div>

        <div className="card mb-4 p-5">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-paper text-3xl">
              {me?.emoji ?? "🙂"}
            </span>
            <div className="min-w-0 flex-1">
              <input
                value={compiled.nickname}
                onChange={(e) => set({ nickname: e.target.value })}
                className="font-display w-full bg-transparent text-xl font-bold outline-none"
              />
              <div className="mt-1 text-sm text-accent">{compiled.vibe}</div>
            </div>
          </div>
          <textarea
            value={compiled.bio}
            onChange={(e) => set({ bio: e.target.value })}
            rows={2}
            className="mt-4 w-full resize-none rounded-xl border border-line bg-paper p-3 text-sm outline-none focus:border-ink/40"
            placeholder="對外簡介"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Section label="基本資料">
            <Line label="年齡" value={compiled.ageRange} onChange={(v) => set({ ageRange: v })} />
            <Line label="城市" value={compiled.city} onChange={(v) => set({ city: v })} />
            <Line label="職業" value={compiled.jobField} onChange={(v) => set({ jobField: v })} />
          </Section>

          <Section label="對關係的期待">
            <Area label="想找的關係" value={compiled.lookingFor} onChange={(v) => set({ lookingFor: v })} />
            <Area label="溝通風格" value={compiled.commsStyle} onChange={(v) => set({ commsStyle: v })} />
          </Section>

          <Section label="生活型態">
            <Area label="" value={compiled.lifestyle} onChange={(v) => set({ lifestyle: v })} />
          </Section>

          <Section label="一句話人設">
            <Area label="" value={compiled.vibe} onChange={(v) => set({ vibe: v })} />
          </Section>

          <Section label="興趣">
            <ChipEditor
              items={compiled.interests}
              draft={newChip.interests ?? ""}
              onDraft={chipDraft("interests")}
              onAdd={chipAdd("interests")}
              onRemove={chipRemove("interests")}
            />
          </Section>

          <Section label="重視的價值">
            <ChipEditor
              items={compiled.values}
              draft={newChip.values ?? ""}
              onDraft={chipDraft("values")}
              onAdd={chipAdd("values")}
              onRemove={chipRemove("values")}
            />
          </Section>

          <Section label="絕對地雷（僅供你的月老判斷）">
            <ChipEditor
              items={compiled.dealbreakers}
              draft={newChip.dealbreakers ?? ""}
              onDraft={chipDraft("dealbreakers")}
              onAdd={chipAdd("dealbreakers")}
              onRemove={chipRemove("dealbreakers")}
            />
          </Section>

          <Section label="分享範圍（對方月老能看到的內容）" wide>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {VISIBILITY_FIELDS.map((f) => {
                const on = visibility[f] ?? true;
                return (
                  <button
                    key={f}
                    onClick={() => {
                      setVisibility({ ...visibility, [f]: !on });
                      setSaved(false);
                    }}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition ${
                      on
                        ? "border-sage/40 bg-sage-soft text-ink"
                        : "border-line bg-paper text-muted"
                    }`}
                  >
                    <span>{FIELD_LABELS[f]}</span>
                    <span className="flex items-center gap-1">
                      {on ? <IconEye size={13} /> : <IconEyeOff size={13} />}
                      {on ? "分享" : "不分享"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              關閉的欄位不會傳給對方月老——連 AI 也看不到，不只是介面上隱藏。
            </p>
          </Section>
        </div>

        <div className="mt-8 flex justify-center">
          <button
            onClick={() => router.push("/agent")}
            className="btn btn-accent px-8 py-3"
          >
            前往我的月老，開始認識人
            <IconArrowRight size={17} />
          </button>
        </div>
      </main>
    </>
  );
}

function ChipEditor({
  items,
  draft,
  onDraft,
  onAdd,
  onRemove,
}: {
  items: string[];
  draft: string;
  onDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="flex items-center gap-1 rounded-full border border-line bg-paper py-1 pr-1 pl-3 text-xs text-ink-soft"
        >
          {v}
          <button
            onClick={() => onRemove(i)}
            className="flex h-4 w-4 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onAdd()}
        placeholder="新增…"
        className="w-24 rounded-full border border-dashed border-line bg-transparent px-2 py-1 text-xs outline-none focus:border-ink/40"
      />
    </div>
  );
}

function Section({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`card p-4 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="mb-2.5 text-xs font-bold tracking-wider text-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

function Line({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mb-2 flex items-center gap-3 text-sm last:mb-0">
      <span className="w-10 shrink-0 text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 outline-none focus:border-ink/40"
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mb-2 block text-sm last:mb-0">
      {label && <span className="mb-1 block text-muted">{label}</span>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full resize-none rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm outline-none focus:border-ink/40"
      />
    </label>
  );
}
