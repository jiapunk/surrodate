import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/session";
import { LLM_MODE } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  const llmMode = LLM_MODE;
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ user: null, llmMode });
  const user = await prisma.user.findUnique({
    where: { id: uid },
    include: { profile: { select: { status: true } } },
  });
  if (!user) return NextResponse.json({ user: null, llmMode });
  return NextResponse.json({
    llmMode,
    user: {
      id: user.id,
      name: user.name,
      emoji: user.emoji,
      tagline: user.tagline,
      isBot: user.isBot,
      profileStatus: user.profile?.status ?? "draft",
    },
  });
}
