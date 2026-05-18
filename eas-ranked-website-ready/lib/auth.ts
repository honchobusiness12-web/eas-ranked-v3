import { cookies } from "next/headers";

export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
  global_name: string | null;
  avatar: string | null;
  email?: string;
}

export interface RobloxUser {
  sub: string;
  name?: string;
  nickname?: string;
  preferred_username?: string;
  profile?: string;
  picture?: string;
}

export interface Session {
  userId: string;
  accessToken: string;
  discordUser: DiscordUser;
  robloxUser?: RobloxUser | null;
  robloxAccessToken?: string | null;
  expiresAt: number;
}

export function getDiscordAuthUrl(): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!;
  const redirectUri = process.env.DISCORD_REDIRECT_URI!;
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "identify" });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const body = new URLSearchParams({ client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!, client_secret: process.env.DISCORD_CLIENT_SECRET!, grant_type: "authorization_code", code, redirect_uri: process.env.DISCORD_REDIRECT_URI! });
  const res = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (!res.ok) throw new Error(`Discord token exchange failed: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

export async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error("Failed to fetch Discord user");
  return res.json() as Promise<DiscordUser>;
}

export function getAvatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
}

export function getRobloxAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.ROBLOX_CLIENT_ID!,
    redirect_uri: process.env.ROBLOX_REDIRECT_URI!,
    response_type: "code",
    scope: "openid profile",
    state,
  });
  return `https://authorize.roblox.com/?${params.toString()}`;
}

export async function exchangeRobloxCodeForToken(code: string): Promise<string> {
  const credentials = Buffer.from(`${process.env.ROBLOX_CLIENT_ID!}:${process.env.ROBLOX_CLIENT_SECRET!}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: process.env.ROBLOX_REDIRECT_URI! });
  const res = await fetch("https://apis.roblox.com/oauth/v1/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${credentials}` }, body: body.toString() });
  if (!res.ok) throw new Error(`Roblox token exchange failed: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

export async function getRobloxUser(accessToken: string): Promise<RobloxUser> {
  const res = await fetch("https://apis.roblox.com/oauth/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Failed to fetch Roblox user: ${await res.text()}`);
  return res.json() as Promise<RobloxUser>;
}

const SESSION_COOKIE = "eas_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export async function createSession(session: Session): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, Buffer.from(JSON.stringify(session)).toString("base64"), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: SESSION_MAX_AGE, path: "/" });
}

export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE);
    if (!cookie?.value) return null;
    const session = JSON.parse(Buffer.from(cookie.value, "base64").toString("utf-8")) as Session;
    if (Date.now() > session.expiresAt) return null;
    return session;
  } catch { return null; }
}

export async function updateSession(partial: Partial<Session>): Promise<Session | null> {
  const current = await getSession();
  if (!current) return null;
  const next = { ...current, ...partial };
  await createSession(next);
  return next;
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/" });
}
