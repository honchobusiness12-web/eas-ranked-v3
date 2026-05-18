import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, getDiscordUser, createSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  if (error || !code) return NextResponse.redirect(new URL("/auth/login?error=access_denied", req.url));
  try {
    const accessToken = await exchangeCodeForToken(code);
    const discordUser = await getDiscordUser(accessToken);
    await createSession({ userId: discordUser.id, accessToken, discordUser, robloxUser: null, robloxAccessToken: null, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    return NextResponse.redirect(new URL(`/profile/${discordUser.id}`, req.url));
  } catch (err) {
    console.error("[auth] Discord OAuth callback error:", err);
    return NextResponse.redirect(new URL("/auth/login?error=oauth_failed", req.url));
  }
}
