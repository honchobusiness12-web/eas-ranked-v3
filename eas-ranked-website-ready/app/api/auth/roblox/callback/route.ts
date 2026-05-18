import { NextRequest, NextResponse } from "next/server";
import { exchangeRobloxCodeForToken, getRobloxUser, getSession, updateSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/auth/login?error=discord_required", req.url));
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL(`/profile/${session.userId}?roblox=denied`, req.url));
  try {
    const robloxAccessToken = await exchangeRobloxCodeForToken(code);
    const robloxUser = await getRobloxUser(robloxAccessToken);
    await updateSession({ robloxUser, robloxAccessToken });
    return NextResponse.redirect(new URL(`/profile/${session.userId}?linked=roblox`, req.url));
  } catch (err) {
    console.error("[auth] Roblox OAuth callback error:", err);
    return NextResponse.redirect(new URL(`/profile/${session.userId}?roblox=failed`, req.url));
  }
}
