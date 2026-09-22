import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { startMatching } from "@/lib/matching";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getCurrentUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const runIds = await startMatching(uid);
    if (runIds.length === 0)
      return NextResponse.json({ error: "no_candidates" }, { status: 409 });
    return NextResponse.json({ runIds });
  } catch (e) {
    if ((e as Error).message === "PROFILE_NOT_READY")
      return NextResponse.json({ error: "profile_not_ready" }, { status: 400 });
    throw e;
  }
}
