"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, useMe, type Me } from "@/lib/client";
import { IconCompass, IconHeart, IconUser } from "./Icons";

interface UserRow extends Me {
  tagline: string;
}

export default function AppHeader() {
  const { me, loading } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open)
      api<{ users: UserRow[] }>("/api/users").then((d) => setUsers(d.users));
  }, [open]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  async function switchTo(id: string) {
    await api("/api/session", {
      method: "POST",
      body: JSON.stringify({ userId: id }),
    });
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const nav = [
    { href: "/agent", label: "我的月老", icon: IconCompass },
    { href: "/matches", label: "配對", icon: IconHeart },
    { href: "/profile", label: "我的檔案", icon: IconUser },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-5 px-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-xl font-bold tracking-tight">
            賽博月老
          </span>
          <span className="hidden text-xs text-muted sm:inline">
            心動代理人
          </span>
        </Link>

        {me && (
          <nav className="ml-1 hidden items-center gap-1 md:flex">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
                    active
                      ? "bg-white text-ink shadow-sm ring-1 ring-line"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon size={16} />
                  {n.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2" ref={ref}>
          {loading ? null : me ? (
            <div className="relative">
              <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pr-3 pl-1 text-sm transition hover:border-muted"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper text-base">
                  {me.emoji}
                </span>
                <span className="max-w-24 truncate">{me.name}</span>
                <span className="text-[10px] text-muted">▼</span>
              </button>
              {open && (
                <div className="card rise-in absolute right-0 mt-2 max-h-96 w-72 overflow-y-auto p-2">
                  <div className="px-2 py-1.5 text-xs text-muted">
                    切換身分（可開兩個瀏覽器互相聊天）
                  </div>
                  {users
                    .filter((u) => u.id !== me.id)
                    .map((u) => (
                      <button
                        key={u.id}
                        onClick={() => switchTo(u.id)}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-paper"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-lg">
                          {u.emoji}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {u.name}
                            {u.isBot && (
                              <span className="ml-1.5 rounded border border-line px-1 py-0.5 text-[10px] text-muted">
                                模擬用戶
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {u.tagline}
                          </span>
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <Link href="/" className="btn btn-ink px-4 py-1.5 text-sm">
              選擇身分
            </Link>
          )}
        </div>
      </div>

      {me && (
        <nav className="flex gap-1 border-t border-line px-3 pb-2 pt-1 md:hidden">
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
                  pathname.startsWith(n.href)
                    ? "bg-white text-ink ring-1 ring-line"
                    : "text-muted"
                }`}
              >
                <Icon size={14} />
                {n.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
