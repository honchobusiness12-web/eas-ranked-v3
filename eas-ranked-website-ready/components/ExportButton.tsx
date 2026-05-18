"use client";

import { useSounds } from "@/components/SoundProvider";
import { useToast } from "@/components/ToastProvider";
import { getRank } from "@/lib/ranks";

interface Player {
  user_id: string;
  name: string;
  username?: string | null;
  cr: number;
  wins: number;
  losses: number;
  kills: number;
  matches: number;
  mvp_count: number;
  ranked: boolean;
}

interface ExportButtonProps {
  players: Player[];
  filename?: string;
}

export default function ExportButton({ players, filename = "leaderboard" }: ExportButtonProps) {
  const { click } = useSounds();
  const { addToast } = useToast();

  function exportCSV() {
    click();
    const headers = ["Rank", "Name", "Username", "CR", "Rank Tier", "Wins", "Losses", "Kills", "Matches", "Win Rate", "MVPs"];
    const rows = players.map((p, i) => {
      const matches = Number(p.matches || 0);
      const winRate = matches ? Math.round((Number(p.wins || 0) / matches) * 100) : 0;
      return [
        i + 1,
        p.name,
        p.username || "",
        p.cr,
        getRank(Number(p.cr || 0)),
        p.wins,
        p.losses,
        p.kills,
        p.matches,
        `${winRate}%`,
        p.mvp_count,
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    downloadFile(`${filename}.csv`, csv, "text/csv");
    addToast(`Exported ${players.length} players as CSV`, "success");
  }

  function exportJSON() {
    click();
    const data = players.map((p, i) => ({
      position: i + 1,
      name: p.name,
      username: p.username,
      cr: p.cr,
      rank: getRank(Number(p.cr || 0)),
      wins: p.wins,
      losses: p.losses,
      kills: p.kills,
      matches: p.matches,
      mvp_count: p.mvp_count,
      ranked: p.ranked,
    }));

    downloadFile(`${filename}.json`, JSON.stringify(data, null, 2), "application/json");
    addToast(`Exported ${players.length} players as JSON`, "success");
  }

  function downloadFile(name: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={exportCSV}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-zinc-300 hover:border-green-600 hover:bg-green-950/30 hover:text-green-300 transition"
        title="Export as CSV"
      >
        📥 CSV
      </button>
      <button
        onClick={exportJSON}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-zinc-300 hover:border-blue-600 hover:bg-blue-950/30 hover:text-blue-300 transition"
        title="Export as JSON"
      >
        📋 JSON
      </button>
    </div>
  );
}
