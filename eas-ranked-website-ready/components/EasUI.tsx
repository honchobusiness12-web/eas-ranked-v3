import Link from "next/link";
import { getRank, getNextRank } from "@/lib/ranks";

export type Player = {
  user_id: string;
  name?: string;
  username?: string | null;
  discord_username?: string | null;
  roblox_username?: string | null;
  avatar_url?: string | null;
  cr?: number;
  wins?: number;
  losses?: number;
  kills?: number;
  matches?: number;
  mvp_count?: number;
  placement_matches?: number;
  ranked?: boolean;
};

export function PlayerAvatar({ player, large = false }: { player?: Partial<Player>; large?: boolean }) {
  const letter = (player?.name || player?.username || "?").slice(0, 1).toUpperCase();
  const cls = large ? "eas-avatar eas-avatar-lg" : "eas-avatar";
  return (
    <div className={cls}>
      {player?.avatar_url ? <img src={player.avatar_url} alt="" /> : letter}
    </div>
  );
}

export function RankPill({ cr = 0 }: { cr?: number }) {
  return <span className="eas-rank-pill">✦ {getRank(Number(cr || 0))}</span>;
}

export function StatCard({ label, value, sub, icon }: { label: string; value: React.ReactNode; sub?: string; icon?: string }) {
  return (
    <div className="eas-card eas-stat" style={{ transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1), box-shadow 0.22s cubic-bezier(0.4,0,0.2,1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="eas-stat-label">{label}</div>
          <div className="eas-stat-value" style={{ transition: "color 0.18s cubic-bezier(0.4,0,0.2,1)" }}>{value}</div>
          {sub && <div className="eas-stat-sub">{sub}</div>}
        </div>
        <div className="eas-logo" style={{ width: 48, height: 48, borderRadius: 16, fontSize: 21, transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)" }}>{icon || "✦"}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", text = "Data will show here once your bot/database sends it." }) {
  return (
    <div className="eas-empty">
      <div className="eas-empty-icon">⌁</div>
      <div className="eas-empty-title">{title}</div>
      <p>{text}</p>
    </div>
  );
}

export function PlayerRow({ player, index }: { player: Player; index: number }) {
  const wins = Number(player.wins || 0);
  const losses = Number(player.losses || 0);
  const matches = Number(player.matches || wins + losses || 0);
  const wr = matches ? Math.round((wins / matches) * 100) : 0;
  const name = player.name || player.username || "Unknown Player";

  return (
    <Link href={`/profile/${player.user_id}`} className="eas-player-row">
      <div style={{ fontWeight: 1000, color: index < 3 ? "var(--gold)" : "#8d96ab" }}>
        {index < 3 ? ["🥇", "🥈", "🥉"][index] : `#${index + 1}`}
      </div>

      <div className="eas-player-cell">
        <PlayerAvatar player={player} />
        <div style={{ minWidth: 0 }}>
          <div className="eas-player-name">{name}</div>
          <div className="eas-player-sub">{player.username || player.discord_username || player.roblox_username || player.user_id}</div>
        </div>
      </div>

      <div className="hide-mobile"><RankPill cr={player.cr} /></div>
      <div className="eas-cr eas-right">{Number(player.cr || 0).toLocaleString()}</div>
      <div className="eas-right hide-mobile">{wins.toLocaleString()} - {losses.toLocaleString()}</div>
      <div className="eas-right hide-mobile">{wr}%</div>
      <div className="eas-right hide-mobile">{Number(player.kills || 0).toLocaleString()}</div>
    </Link>
  );
}

export function ProfileStats({ player }: { player: Player }) {
  const wins = Number(player.wins || 0), losses = Number(player.losses || 0), matches = Number(player.matches || wins + losses || 0), kills = Number(player.kills || 0), mvps = Number(player.mvp_count || 0);
  const wr = matches ? Math.round((wins / matches) * 100) : 0;
  return (
    <div className="eas-grid eas-stats-grid" style={{ marginTop: 22 }}>
      <StatCard label="CR" value={Number(player.cr || 0).toLocaleString()} icon="⚡" />
      <StatCard label="Wins" value={wins.toLocaleString()} icon="🏆" />
      <StatCard label="Losses" value={losses.toLocaleString()} icon="⌁" />
      <StatCard label="Win Rate" value={`${wr}%`} icon="◎" />
      <StatCard label="Kills" value={kills.toLocaleString()} icon="✦" />
      <StatCard label="MVPs" value={mvps.toLocaleString()} icon="★" />
    </div>
  );
}

export function ProgressCard({ cr = 0 }: { cr?: number }) {
  const next = getNextRank(Number(cr || 0));
  const pct = next ? Math.min(100, Math.round((Number(cr || 0) / next.min) * 100)) : 100;
  return (
    <div className="eas-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <div className="eas-stat-label">Rank Progression</div>
          <h3 style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 1000 }}>{getRank(Number(cr || 0))}</h3>
        </div>
        <RankPill cr={cr} />
      </div>
      <div style={{ marginTop: 22, height: 12, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
        <div className="eas-progress-bar" style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: "linear-gradient(90deg, var(--purple), var(--blue), var(--gold))", transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
      <p className="eas-player-sub" style={{ marginTop: 10 }}>{next ? `${Math.max(0, next.min - Number(cr || 0)).toLocaleString()} CR to ${next.name}` : "Highest tier reached"}</p>
    </div>
  );
}
