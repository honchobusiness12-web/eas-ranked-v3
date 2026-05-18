import Shell from "@/components/Shell";
import { getSession } from "@/lib/auth";
export default async function ServerShell({ children }: { children: React.ReactNode }) { const session = await getSession(); return <Shell user={session?.discordUser ?? null} robloxUser={session?.robloxUser ?? null}>{children}</Shell>; }
