import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/session";
import { llm } from "@/lib/llm";
import { DEFAULT_VISIBILITY } from "@/lib/types";

export const dynamic = "force-dynamic";

type Turn = { role: "agent" | "user"; content: string; ts: number };

export async function POST() {
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: uid } });
  const profile = await prisma.agentProfile.findUnique({ where: { userId: uid } });
  if (!user || !profile)
    return NextResponse.json({ error: "no profile" }, { status: 400 });
  if (profile.status === "ready")
    return NextResponse.json({ error: "already_compiled" }, { status: 409 });

  const interview = (profile.interview as unknown as Turn[]) ?? [];
  const answers = interview
    .filter((t) => t.role === "user")
    .map((t) => t.content);
  if (answers.length < 4)
    return NextResponse.json({ error: "interview_incomplete" }, { status: 400 });

  const compiled = await llm.compileProfile(user.name, answers, uid);

  await prisma.agentProfile.update({
    where: { userId: uid },
    data: {
      compiled: compiled as unknown as object,
      visibility: { ...DEFAULT_VISIBILITY } as unknown as object,
      status: "ready",
    },
  });

  return NextResponse.json({ compiled });
}
