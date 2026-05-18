"use client";

import { useState, useEffect, useRef } from "react";
import PlayerAvatar from "@/components/PlayerAvatar";
import RankBadge from "@/components/RankBadge";

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
  ranked: boolean;
}

interface PlayerSearchProps {
  players: Player[];
  onSelect?: (player: Player) => void;
  placeholder?: string;
  /** If true, navigates to /profile/[userId] on select */
  navigateOnSelect?: boolean;
}

export default function PlayerSearch({
  players,
  onSelect,
  placeholder = "Search players…",
  navigateOnSelect = false,
}: PlayerSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Player[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        setOpen(false);
        return;
      }
      const q = query.toLowerCase();
      const filtered = players
        .filter(
          (p) =>
            p.name?.toLowerCase().includes(q) ||
            p.username?.toLowerCase().includes(q)
        )
        .slice(0, 8);
      setResults(filtered);
      setOpen(filtered.length > 0);
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, players]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(player: Player) {
    setQuery(player.name);
    setOpen(false);
    if (onSelect) onSelect(player);
    if (navigateOnSelect) {
      window.location.href = `/profile/${player.user_id}`;
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/[0.07] bg-white/[0.04] py-2.5 pl-9 pr-8 text-sm text-white placeholder-zinc-600 outline-none transition-all duration-200 focus:border-purple-500/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-purple-500/20 backdrop-blur-sm"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 transition-colors hover:text-zinc-300 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-white/[0.07] shadow-depth-lg overflow-hidden animate-scale-in" style={{ background: "rgba(11,11,31,0.97)", backdropFilter: "blur(20px)" }}>
          {results.map((player) => (
            <button
              key={player.user_id}
              onClick={() => handleSelect(player)}
              className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all duration-200 hover:bg-purple-500/[0.05] border-b border-white/[0.04] last:border-0"
            >
              <PlayerAvatar name={player.name} avatar={player.avatar_url} size="h-8 w-8" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate group-hover:text-white transition-colors">{player.name}</p>
                <p className="text-xs text-zinc-600 truncate">{player.username || "—"}</p>
              </div>
              <RankBadge cr={Number(player.cr || 0)} size="sm" showLabel={false} />
              <span className="text-xs font-black text-purple-400">{Number(player.cr).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
