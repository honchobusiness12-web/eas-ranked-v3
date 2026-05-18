import Shell from "@/components/Shell";
import { PlayerAvatar, ProfileStats, ProgressCard, RankPill } from "@/components/EasUI";

async function getPlayer(userId: string) {
  try {
    const base = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "";
    const url = base ? `${base.replace(/\/$/, "")}/api/player/${userId}` : `/api/player/${userId}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function ProfilePage({ params }: { params: { userId: string } }) {
  const player = await getPlayer(params.userId);
  const p = player || { user_id: params.userId, name: "Player Profile", cr: 0, wins: 0, losses: 0, kills: 0, matches: 0 };

  return (
    <Shell>
      <div className="eas-profile-hero">
        <PlayerAvatar player={p} large />
        <div>
          <div className="eas-kicker">Player Profile</div>
          <h1 className="eas-page-title" style={{ marginTop: 6 }}>{p.name || p.username || "Unknown Player"}</h1>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <RankPill cr={p.cr} />
            <span className="eas-rank-pill"><span className="eas-cr">{Number(p.cr || 0).toLocaleString()}</span> CR</span>
          </div>
        </div>
      </div>
      <ProfileStats player={p} />
      <div className="eas-grid eas-page-grid" style={{ marginTop: 22 }}>
        <ProgressCard cr={p.cr} />
        <div className="eas-card">
          <div className="eas-kicker">Account</div>
          <p className="eas-page-sub">Discord/Roblox linked data will show here when available.</p>
        </div>
      </div>
    </Shell>
  );
}
