import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/session";
import { publish } from "@/lib/bus";
import { scheduleBotReply } from "@/lib/bot";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const { content } = (await req.json()) as { content?: string };
  if (!content?.trim())
    return NextResponse.json({ error: "content required" }, { status: 400 });

  const match = await prisma.match.findUnique({ where: { id } });
  if (!match || (match.userAId !== uid && match.userBId !== uid))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (match.status !== "matched")
    return NextResponse.json({ error: "locked" }, { status: 423 });

  const msg = await prisma.message.create({
    data: { matchId: id, senderId: uid, content: content.trim().slice(0, 2000) },
  });

  publish(`match:${id}`, { type: "message", message: msg });

  // 若對方是模擬用戶 → 排程擬真回覆
  const otherId = match.userAId === uid ? match.userBId : match.userAId;
  const other = await prisma.user.findUnique({
    where: { id: otherId },
    select: { isBot: true },
  });
  if (other?.isBot) scheduleBotReply(id, uid);

  return NextResponse.json({ message: msg });
}
