import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/session";
import { sseResponse } from "@/lib/sse";
import { subscribe } from "@/lib/bus";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = await getCurrentUserId();
  if (!uid) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!match || (match.userAId !== uid && match.userBId !== uid))
    return new Response("not found", { status: 404 });
  if (match.status !== "matched")
    return new Response("locked", { status: 423 });

  const otherId = match.userAId === uid ? match.userBId : match.userAId;

  return sseResponse(async (send, signal) => {
    // 初始狀態 + 歷史訊息
    const other = await prisma.user.findUnique({ where: { id: otherId } });
    send({
      type: "init",
      me: uid,
      other: { id: otherId, name: other?.name, emoji: other?.emoji },
      messages: match.messages,
    });

    const unsub = subscribe(`match:${id}`, (data: string) => {
      const evt = JSON.parse(data);
      if (evt.type === "message" || evt.type === "typing") send(evt);
    });
    signal.addEventListener("abort", unsub);
  });
}
