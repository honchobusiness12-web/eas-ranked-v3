import { NextResponse } from "next/server";
import { getSession, getRobloxAuthUrl } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/auth/login?error=discord_required", req.url));
  const state = Buffer.from(JSON.stringify({ d: session.userId, t: Date.now() })).toString("base64url");
  return NextResponse.redirect(getRobloxAuthUrl(state));
}
