"use client";

import PlayerAvatar from "@/components/PlayerAvatar";
import RankBadge from "@/components/RankBadge";
import { CompareBar, CompareLegend } from "@/components/StatsChart";
import { WinLossChart } from "@/components/StatsChart";

interface Player {
  user_id: string;
  name: string;
  username?: string | null;
  avatar_url?: string | null;
  cr: number;
  wins: number;
  losses: number;
  kills: number;
  matches: number;
  mvp_count: number;
}

interface PlayerComparisonProps {
  playerA: Player;
  playerB: Player;
}

export default function PlayerComparison({ playerA, playerB }: PlayerComparisonProps) {
  const crA = Number(playerA.cr || 0);
  const crB = Number(playerB.cr || 0);
  const winsA = Number(playerA.wins || 0);
  const winsB = Number(playerB.wins || 0);
  const lossesA = Number(playerA.losses || 0);
  const lossesB = Number(playerB.losses || 0);
  const killsA = Number(playerA.kills || 0);
  const killsB = Number(playerB.kills || 0);
  const matchesA = Number(playerA.matches || 0);
  const matchesB = Number(playerB.matches || 0);
  const mvpA = Number(playerA.mvp_count || 0);
  const mvpB = Number(playerB.mvp_count || 0);

  const winRateA = matchesA ? Math.round((winsA / matchesA) * 100) : 0;
  const winRateB = matchesB ? Math.round((winsB / matchesB) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ── Header — side by side ── */}
      <div className="grid grid-cols-[1fr_48px_1fr] items-center gap-3">
        {/* Player A */}
        <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-orange-700/20 bg-orange-950/10 p-4">
          <PlayerAvatar name={playerA.name} avatar={playerA.avatar_url} size="h-14 w-14" />
          <div className="text-center">
            <p className="text-sm font-black">{playerA.name}</p>
            <p className="text-xs text-zinc-600">{playerA.username || "—"}</p>
          </div>
          <RankBadge cr={crA} size="sm" />
          <p className="text-xl font-black text-orange-400">{crA.toLocaleString()} CR</p>
        </div>

        <div className="text-center text-sm font-black text-zinc-600">VS</div>

        {/* Player B */}
        <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-blue-700/20 bg-blue-950/10 p-4">
          <PlayerAvatar name={playerB.name} avatar={playerB.avatar_url} size="h-14 w-14" />
          <div className="text-center">
            <p className="text-sm font-black">{playerB.name}</p>
            <p className="text-xs text-zinc-600">{playerB.username || "—"}</p>
          </div>
          <RankBadge cr={crB} size="sm" />
          <p className="text-xl font-black text-blue-400">{crB.toLocaleString()} CR</p>
        </div>
      </div>

      {/* ── Win/Loss charts ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/[0.07] bg-[#0d0d18] p-4">
          <p className="mb-3 text-xs font-bold text-zinc-500 text-center truncate">{playerA.name}</p>
          <WinLossChart wins={winsA} losses={lossesA} matches={matchesA} />
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#0d0d18] p-4">
          <p className="mb-3 text-xs font-bold text-zinc-500 text-center truncate">{playerB.name}</p>
          <WinLossChart wins={winsB} losses={lossesB} matches={matchesB} />
        </div>
      </div>

      {/* ── Comparison bars ── */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#0d0d18] p-5 space-y-4">
        <h3 className="text-sm font-black">📊 Head-to-Head Stats</h3>
        <CompareLegend nameA={playerA.name} nameB={playerB.name} />
        <CompareBar label="CR" valueA={crA} valueB={crB} nameA={playerA.name} nameB={playerB.name} />
        <CompareBar label="Wins" valueA={winsA} valueB={winsB} nameA={playerA.name} nameB={playerB.name} />
        <CompareBar label="Kills" valueA={killsA} valueB={killsB} nameA={playerA.name} nameB={playerB.name} />
        <CompareBar label="Matches" valueA={matchesA} valueB={matchesB} nameA={playerA.name} nameB={playerB.name} />
        <CompareBar label="MVPs" valueA={mvpA} valueB={mvpB} nameA={playerA.name} nameB={playerB.name} />
        <CompareBar
          label="Win Rate"
          valueA={winRateA}
          valueB={winRateB}
          nameA={playerA.name}
          nameB={playerB.name}
          format={(v) => `${v}%`}
        />
      </div>

      {/* ── Quick verdict ── */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#0d0d18] p-4">
        <h3 className="mb-3 text-sm font-black">🏆 Verdict</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <VerdictCell
            label="Higher CR"
            winner={crA > crB ? playerA.name : crB > crA ? playerB.name : "Tied"}
            tied={crA === crB}
            nameA={playerA.name}
          />
          <VerdictCell
            label="More Wins"
            winner={winsA > winsB ? playerA.name : winsB > winsA ? playerB.name : "Tied"}
            tied={winsA === winsB}
            nameA={playerA.name}
          />
          <VerdictCell
            label="Best Win Rate"
            winner={winRateA > winRateB ? playerA.name : winRateB > winRateA ? playerB.name : "Tied"}
            tied={winRateA === winRateB}
            nameA={playerA.name}
          />
        </div>
      </div>
    </div>
  );
}

function VerdictCell({
  label,
  winner,
  tied,
  nameA,
}: {
  label: string;
  winner: string;
  tied: boolean;
  nameA: string;
}) {
  const isA = !tied && winner === nameA;
  const colorClass = tied
    ? "text-zinc-500"
    : isA
    ? "text-orange-400"
    : "text-blue-400";
  return (
    <div className="rounded-lg bg-white/[0.04] p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600 mb-1">{label}</p>
      <p className={`text-xs font-black truncate ${colorClass}`}>{winner}</p>
    </div>
  );
}
