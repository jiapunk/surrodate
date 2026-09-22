import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/session";
import { acceptSecondDate, generateSecondDate } from "@/lib/seconddate";

export const dynamic = "force-dynamic";

/** 接受提案 or 換一個（重新生成） */
export async function POST(req: Request) {
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    matchId?: string;
    action?: "accept" | "regenerate";
  };
  if (!body.matchId || !body.action)
    return NextResponse.json({ error: "matchId and action required" }, { status: 400 });

  const match = await prisma.match.findUnique({ where: { id: body.matchId } });
  if (!match || (match.userAId !== uid && match.userBId !== uid))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (match.status !== "matched")
    return NextResponse.json({ error: "not_matched" }, { status: 409 });

  if (body.action === "accept") {
    const sd = await acceptSecondDate(body.matchId, uid);
    if (!sd) return NextResponse.json({ error: "no_proposal" }, { status: 404 });
    return NextResponse.json({ ok: true, secondDate: sd });
  }

  const sd = await generateSecondDate(body.matchId, uid);
  if (!sd) return NextResponse.json({ error: "cannot_generate" }, { status: 409 });
  return NextResponse.json({ ok: true, secondDate: sd });
}
