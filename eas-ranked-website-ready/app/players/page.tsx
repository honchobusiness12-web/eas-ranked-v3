"use client";

import Shell from "@/components/Shell";
import { EmptyState, PlayerRow } from "@/components/EasUI";
import { useEffect, useMemo, useState } from "react";

export default function PlayersPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setPlayers(Array.isArray(d) ? d : Array.isArray(d?.players) ? d.players : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => players.filter((p) => `${p.name || ""} ${p.username || ""} ${p.user_id || ""}`.toLowerCase().includes(q.toLowerCase())), [players, q]);

  return (
    <Shell>
      <div className="eas-page-header">
        <div>
          <div className="eas-kicker">Player Directory</div>
          <h1 className="eas-page-title">Players</h1>
          <p className="eas-page-sub">Search every ranked EAS player profile.</p>
        </div>
      </div>
      <div className="eas-toolbar" style={{ gridTemplateColumns: "1fr auto" }}>
        <input className="eas-input" placeholder="Search players..." value={q} onChange={(e) => setQ(e.target.value)} />
        <a className="eas-btn eas-btn-primary" href="/leaderboard">Leaderboard</a>
      </div>
      <div className="eas-card eas-table" style={{ padding: 0 }}>
        <div className="eas-table-head">
          <span>#</span><span>Player</span><span>Tier</span><span className="eas-right">CR</span><span className="eas-right">Record</span><span className="eas-right">Win %</span><span className="eas-right">Kills</span>
        </div>
        {loading ? <div className="eas-empty">Loading players...</div> : filtered.length ? filtered.map((p, i) => <PlayerRow key={p.user_id || i} player={p} index={i} />) : <EmptyState title="No players found" />}
      </div>
    </Shell>
  );
}
