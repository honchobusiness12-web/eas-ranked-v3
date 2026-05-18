import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isOwnerIdentity } from "@/lib/admin";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ isDeveloper: !!session && isOwnerIdentity(session.userId, session.robloxUser?.sub) });
}
