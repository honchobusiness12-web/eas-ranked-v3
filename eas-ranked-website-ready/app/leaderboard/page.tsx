"use client";

import Shell from "@/components/Shell";
import { EmptyState, PlayerRow } from "@/components/EasUI";
import { useEffect, useMemo, useState } from "react";

type Player = any;

export default function LeaderboardPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [rank, setRank] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setPlayers(Array.isArray(d) ? d : Array.isArray(d?.players) ? d.players : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return players.filter((p) => {
      const haystack = `${p.name || ""} ${p.username || ""} ${p.discord_username || ""} ${p.roblox_username || ""} ${p.user_id || ""}`.toLowerCase();
      const search = haystack.includes(q.toLowerCase());
      const cr = Number(p.cr || 0);
      const rankMatch =
        rank === "all" ||
        (rank === "r10" ? cr >= 4500 :
        rank === "r9" ? cr >= 3550 && cr < 4500 :
        rank === "r8" ? cr >= 2750 && cr < 3550 :
        rank === "r7" ? cr >= 2100 && cr < 2750 :
        rank === "r6" ? cr >= 1600 && cr < 2100 :
        rank === "r5" ? cr >= 1200 && cr < 1600 :
        rank === "r4" ? cr >= 1000 && cr < 1200 :
        rank === "r3" ? cr >= 700 && cr < 1000 :
        rank === "r2" ? cr >= 400 && cr < 700 :
        cr < 400);
      return search && rankMatch;
    });
  }, [players, q, rank]);

  return (
    <Shell>
      <div className="eas-page-header">
        <div>
          <div className="eas-kicker">Competitive Standings</div>
          <h1 className="eas-page-title">Leaderboard</h1>
          <p className="eas-page-sub">{filtered.length} players shown</p>
        </div>
        <button onClick={() => location.reload()} className="eas-btn">↻ Refresh</button>
      </div>

      <div className="eas-toolbar">
        <input className="eas-input" placeholder="Search player name, Discord, Roblox, or ID..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="eas-select" value={rank} onChange={(e) => setRank(e.target.value)}>
          <option value="all">All Ranks</option>
          {["r10","r9","r8","r7","r6","r5","r4","r3","r2","r1"].map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
        </select>
        <a className="eas-btn eas-btn-primary" href="/players">View Players</a>
      </div>

      <div className="eas-card eas-table" style={{ padding: 0 }}>
        <div className="eas-table-head">
          <span>Rank</span>
          <span>Player</span>
          <span>Tier</span>
          <span className="eas-right">CR</span>
          <span className="eas-right">Record</span>
          <span className="eas-right">Win %</span>
          <span className="eas-right">Kills</span>
        </div>
        {loading ? (
          <div className="eas-empty"><div className="eas-empty-title">Loading leaderboard...</div></div>
        ) : filtered.length ? (
          filtered.map((p, i) => <PlayerRow key={p.user_id || i} player={p} index={i} />)
        ) : (
          <EmptyState title="No players found" text="Try removing filters or wait for ranked data to sync." />
        )}
      </div>
    </Shell>
  );
}
