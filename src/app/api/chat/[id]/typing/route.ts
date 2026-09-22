import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/session";
import { publish } from "@/lib/bus";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const match = await prisma.match.findUnique({ where: { id } });
  if (!match || (match.userAId !== uid && match.userBId !== uid))
    return NextResponse.json({ error: "not found" }, { status: 404 });

  publish(`match:${id}`, { type: "typing", userId: uid });
  return NextResponse.json({ ok: true });
}
