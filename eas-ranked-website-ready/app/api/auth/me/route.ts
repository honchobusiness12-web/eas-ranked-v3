import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isOwnerIdentity } from "@/lib/admin";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null, isOwner: false });
  return NextResponse.json({
    user: session.discordUser,
    robloxUser: session.robloxUser ?? null,
    isOwner: isOwnerIdentity(session.userId, session.robloxUser?.sub),
  });
}
