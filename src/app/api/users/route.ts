import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  const users = await prisma.user.findMany({
    orderBy: [{ isBot: "desc" }, { createdAt: "asc" }],
    include: { profile: { select: { status: true } } },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      emoji: u.emoji,
      tagline: u.tagline,
      isBot: u.isBot,
      profileStatus: u.profile?.status ?? "draft",
      isMe: u.id === uid,
    })),
  });
}

export async function POST(req: Request) {
  const { name, emoji } = (await req.json()) as {
    name?: string;
    emoji?: string;
  };
  if (!name?.trim())
    return NextResponse.json({ error: "name required" }, { status: 400 });
  const user = await prisma.user.create({
    data: {
      name: name.trim().slice(0, 12),
      emoji: emoji || "🙂",
      tagline: "新朋友",
      isBot: false,
      profile: { create: { status: "draft", interview: [] } },
    },
  });
  return NextResponse.json({ id: user.id });
}
