"use client";

import Shell from "@/components/Shell";
import { EmptyState, PlayerRow } from "@/components/EasUI";
import Pagination from "@/components/Pagination";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 25;

export default function PlayersPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setPlayers(Array.isArray(d) ? d : Array.isArray(d?.players) ? d.players : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      players.filter((p) =>
        `${p.name || ""} ${p.username || ""} ${p.discord_username || ""} ${p.roblox_username || ""} ${p.user_id || ""}`
          .toLowerCase()
          .includes(q.toLowerCase())
      ),
    [players, q]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSearch(val: string) {
    setQ(val);
    setPage(1);
  }

  return (
    <Shell>
      <div className="eas-page-header">
        <div>
          <div className="eas-kicker">Player Directory</div>
          <h1 className="eas-page-title">Players</h1>
          <p className="eas-page-sub">
            {loading
              ? "Loading players..."
              : `${filtered.length} player${filtered.length !== 1 ? "s" : ""} in the EAS Ranked database`}
          </p>
        </div>
      </div>
      <div className="eas-toolbar" style={{ gridTemplateColumns: "1fr auto" }}>
        <input
          className="eas-input"
          placeholder="Search by name, Discord, Roblox, or ID..."
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <a className="eas-btn eas-btn-primary" href="/leaderboard">Leaderboard</a>
      </div>
      <div className="eas-card eas-table" style={{ padding: 0 }}>
        <div className="eas-table-head">
          <span>#</span>
          <span>Player</span>
          <span>Tier</span>
          <span className="eas-right">CR</span>
          <span className="eas-right">Record</span>
          <span className="eas-right">Win %</span>
          <span className="eas-right">Kills</span>
        </div>
        {loading ? (
          <div className="eas-empty">
            <div className="eas-empty-title">Loading players...</div>
          </div>
        ) : paginated.length ? (
          paginated.map((p, i) => (
            <PlayerRow
              key={p.user_id || i}
              player={p}
              index={(safePage - 1) * PAGE_SIZE + i}
            />
          ))
        ) : (
          <EmptyState title="No players found" />
        )}
      </div>

      {!loading && filtered.length > PAGE_SIZE && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          itemsPerPage={PAGE_SIZE}
          totalItems={filtered.length}
        />
      )}
    </Shell>
  );
}
