"use client";

import Shell from "@/components/Shell";
import { EmptyState, PlayerAvatar } from "@/components/EasUI";
import Pagination from "@/components/Pagination";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const PLACEMENT_TOTAL = 10;
const PAGE_SIZE = 25;

type PlacementPlayer = {
  user_id: string;
  name: string;
  username: string | null;
  discord_username: string | null;
  roblox_username: string | null;
  avatar_url: string | null;
  cr: number;
  placement_matches: number;
};

export default function PlacementsPage() {
  const [players, setPlayers] = useState<PlacementPlayer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  function load() {
    setLoading(true);
    fetch("/api/placements")
      .then((r) => r.json())
      .then((d) => setPlayers(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const lower = q.toLowerCase();
    return players.filter((p) =>
      `${p.name || ""} ${p.username || ""} ${p.discord_username || ""} ${p.roblox_username || ""} ${p.user_id || ""}`
        .toLowerCase()
        .includes(lower)
    );
  }, [players, q]);

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
          <div className="eas-kicker">EAS Arena</div>
          <h1 className="eas-page-title">Placements</h1>
          <p className="eas-page-sub">
            {loading
              ? "Loading placement players..."
              : `${filtered.length} player${filtered.length !== 1 ? "s" : ""} still completing placement matches`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={load} className="eas-btn">
            ↻ Refresh
          </button>
          <Link href="/leaderboard" className="eas-btn eas-btn-primary">
            Leaderboard
          </Link>
        </div>
      </div>

      {/* Search toolbar */}
      <div className="eas-toolbar" style={{ gridTemplateColumns: "1fr auto" }}>
        <input
          className="eas-input"
          placeholder="Search by name, Discord, Roblox, or ID..."
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <Link href="/guide#placements" className="eas-btn">
          📖 What are placements?
        </Link>
      </div>

      {/* Table */}
      <div className="eas-card eas-table" style={{ padding: 0 }}>
        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "50px minmax(200px, 1.5fr) minmax(160px, 1fr) 130px 110px 100px",
            alignItems: "center",
            gap: 14,
            padding: "15px 20px",
            color: "#727b92",
            fontSize: 11,
            fontWeight: 1000,
            letterSpacing: ".20em",
            textTransform: "uppercase",
            background: "rgba(255,255,255,.035)",
            borderBottom: "1px solid rgba(255,255,255,.08)",
          }}
        >
          <span>#</span>
          <span>Player</span>
          <span>Username</span>
          <span style={{ textAlign: "center" }}>Progress</span>
          <span style={{ textAlign: "center" }}>Remaining</span>
          <span style={{ textAlign: "right" }}>CR</span>
        </div>

        {loading ? (
          <div className="eas-empty">
            <div className="eas-empty-title">Loading placements...</div>
          </div>
        ) : paginated.length === 0 ? (
          <EmptyState
            title="No players in placements"
            text={
              q
                ? "No players match your search. Try a different name or ID."
                : "All registered players have completed their placement matches."
            }
          />
        ) : (
          paginated.map((p, i) => {
            const completed = Number(p.placement_matches || 0);
            const remaining = Math.max(0, PLACEMENT_TOTAL - completed);
            const pct = Math.round((completed / PLACEMENT_TOTAL) * 100);
            const displayName = p.name || p.username || "Unknown Player";
            const subName =
              p.discord_username || p.roblox_username || p.username || p.user_id;
            const globalIndex = (safePage - 1) * PAGE_SIZE + i + 1;

            return (
              <Link
                key={p.user_id}
                href={`/profile/${p.user_id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "50px minmax(200px, 1.5fr) minmax(160px, 1fr) 130px 110px 100px",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 20px",
                  borderBottom: "1px solid rgba(255,255,255,.06)",
                  transition: ".16s ease",
                  textDecoration: "none",
                  color: "inherit",
                }}
                className="eas-player-row"
              >
                {/* Index */}
                <div
                  style={{
                    fontWeight: 1000,
                    color: "#8d96ab",
                    fontSize: 13,
                  }}
                >
                  #{globalIndex}
                </div>

                {/* Player */}
                <div className="eas-player-cell">
                  <PlayerAvatar player={p} />
                  <div style={{ minWidth: 0 }}>
                    <div className="eas-player-name">{displayName}</div>
                    <div className="eas-player-sub">{subName}</div>
                  </div>
                </div>

                {/* Username */}
                <div
                  style={{
                    color: "#97a0b5",
                    fontSize: 13,
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.discord_username
                    ? `@${p.discord_username}`
                    : p.roblox_username
                    ? p.roblox_username
                    : "—"}
                </div>

                {/* Progress */}
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 950,
                      color: pct >= 70 ? "var(--green)" : pct >= 40 ? "var(--gold)" : "var(--muted)",
                      marginBottom: 5,
                    }}
                  >
                    {completed}/{PLACEMENT_TOTAL}
                  </div>
                  <div
                    style={{
                      height: 5,
                      borderRadius: 999,
                      background: "rgba(255,255,255,.10)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        borderRadius: 999,
                        background:
                          pct >= 70
                            ? "var(--green)"
                            : pct >= 40
                            ? "var(--gold)"
                            : "var(--purple)",
                        transition: "width .3s ease",
                      }}
                    />
                  </div>
                </div>

                {/* Remaining */}
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 13,
                    fontWeight: 950,
                    color: remaining === 0 ? "var(--green)" : "var(--muted)",
                  }}
                >
                  {remaining === 0 ? "Done ✓" : `${remaining} left`}
                </div>

                {/* CR */}
                <div
                  style={{
                    textAlign: "right",
                    fontWeight: 1000,
                    color: "var(--gold)",
                    fontSize: 14,
                  }}
                >
                  {Number(p.cr || 0).toLocaleString()}
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Pagination */}
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

