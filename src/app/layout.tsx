import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "賽博月老 · 心動代理人",
  description:
    "線上月老幫你先相親。你的專屬月老替你跟對方的月老面談、過濾，只有雙方都點頭的人才會出現。專為社恐與沒時間的人設計的代理交友。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-TW" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
