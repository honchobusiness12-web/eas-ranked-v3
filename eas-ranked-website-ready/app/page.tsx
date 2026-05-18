"use client";

import Link from "next/link";
import Shell from "@/components/Shell";
import { StatCard, PlayerRow } from "@/components/EasUI";
import { useEffect, useState } from "react";

export default function HomePage() {
  const [players, setPlayers] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setPlayers(Array.isArray(d) ? d.slice(0, 5) : Array.isArray(d?.players) ? d.players.slice(0, 5) : []))
      .catch(() => {});
  }, []);

  const totalCR = players.reduce((a, p) => a + Number(p.cr || 0), 0);

  return (
    <Shell>
      <section className="eas-hero">
        <div className="eas-hero-main">
          <div className="eas-kicker">Welcome to</div>
          <h1 className="eas-title">EAS <span>RANKED</span></h1>
          <p className="eas-subtitle">
            The official ranked hub for Elevate All-Stars TimeBomb Duels. Track CR, rankings,
            placements, profiles, seasons, and league progress in one clean dashboard.
          </p>
          <div className="eas-actions">
            <Link href="/leaderboard" className="eas-btn eas-btn-primary">View Leaderboard</Link>
            <Link href="/players" className="eas-btn">Search Players</Link>
            <Link href="/ranks" className="eas-btn eas-btn-gold">View Ranks</Link>
          </div>
        </div>

        <div className="eas-card" style={{ display: "grid", alignContent: "space-between", minHeight: 390 }}>
          <div>
            <div className="eas-kicker">Current Season</div>
            <h2 style={{ fontSize: 46, lineHeight: 1, margin: "12px 0 8px", fontWeight: 1000 }}>Season 7</h2>
            <p className="eas-page-sub">Competitive ranked season is live.</p>
          </div>
          <div className="eas-card" style={{ background: "rgba(255,255,255,.045)" }}>
            <div className="eas-stat-label">Top Player Preview</div>
            <h3 style={{ margin: "10px 0 0", fontSize: 26, fontWeight: 1000 }}>{players[0]?.name || "Awaiting Players"}</h3>
            <p className="eas-cr" style={{ marginTop: 8 }}>{Number(players[0]?.cr || 0).toLocaleString()} CR</p>
          </div>
        </div>
      </section>

      <section className="eas-grid eas-stats-grid">
        <StatCard label="Players" value={players.length ? "Live" : "0"} sub="database connected" icon="👥" />
        <StatCard label="Total CR Preview" value={totalCR.toLocaleString()} sub="top visible players" icon="⚡" />
        <StatCard label="Ranked System" value="R1-R10" sub="league progression" icon="🏆" />
        <StatCard label="Status" value="Online" sub="website active" icon="●" />
      </section>

      <section className="eas-grid eas-page-grid">
        <div className="eas-card eas-table" style={{ padding: 0 }}>
          <div style={{ padding: 22, borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div className="eas-kicker">Top Players</div>
              <h2 style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 1000 }}>Leaderboard Preview</h2>
            </div>
            <Link href="/leaderboard" className="eas-btn">Full Board</Link>
          </div>
          {players.length ? players.map((p, i) => <PlayerRow key={p.user_id || i} player={p} index={i} />) : <div className="eas-empty">No players loaded yet.</div>}
        </div>

        <div className="eas-card">
          <div className="eas-kicker">System</div>
          <h2 style={{ margin: "8px 0 16px", fontSize: 28, fontWeight: 1000 }}>League Hub</h2>
          <div className="eas-grid">
            <Link className="eas-btn" href="/placements">Placement Queue</Link>
            <Link className="eas-btn" href="/compare">Compare Players</Link>
            <Link className="eas-btn" href="/guide">Ranked Guide</Link>
          </div>
        </div>
      </section>
    </Shell>
  );
}
