"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface PlayerResult {
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  cr: number;
}

/**
 * Dropdown menu for searching and navigating to player profiles.
 * Renders a search input that queries /api/players/search and shows
 * matching players as clickable links.
 */
export default function ProfileMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/players/search?q=${encodeURIComponent(query.trim())}`
        );
        if (res.ok) {
          const data = await res.json();
          // API returns an array directly
          const players: PlayerResult[] = Array.isArray(data) ? data : (data.players ?? []);
          setResults(players.slice(0, 6));
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [query]);

  function handleSelect(userId: string) {
    setOpen(false);
    router.push(`/profile/${userId}`);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-2.5 py-1.5 text-xs font-bold text-zinc-400 transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.08] hover:text-white"
        aria-label="Search player profiles"
      >
        <span>🔍</span>
        <span className="hidden sm:inline">Profiles</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-white/[0.07] shadow-depth-xl z-50 overflow-hidden animate-scale-in" style={{ background: "rgba(11,11,31,0.97)", backdropFilter: "blur(20px)" }}>
          <div className="p-2.5 border-b border-white/[0.06]">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or username…"
              className="w-full rounded-lg border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-xs text-white placeholder-zinc-600 transition-all duration-200 focus:border-purple-500/40 focus:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-purple-500/20"
            />
          </div>

          <div className="max-h-60 overflow-y-auto">
            {loading && (
              <p className="px-3 py-2.5 text-xs text-zinc-600">Searching…</p>
            )}

            {!loading && query.trim() && results.length === 0 && (
              <p className="px-3 py-2.5 text-xs text-zinc-600">No players found.</p>
            )}

            {!loading && !query.trim() && (
              <div className="p-1.5">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-700">Quick links</p>
                <button
                  onClick={() => { setOpen(false); router.push("/leaderboard"); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-zinc-400 transition-all duration-200 hover:bg-white/[0.05] hover:text-white text-left"
                >
                  🏆 Leaderboard
                </button>
                <button
                  onClick={() => { setOpen(false); router.push("/players"); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-zinc-400 transition-all duration-200 hover:bg-white/[0.05] hover:text-white text-left"
                >
                  👥 All Players
                </button>
              </div>
            )}

            {results.map((player) => (
              <button
                key={player.user_id}
                onClick={() => handleSelect(player.user_id)}
                className="group flex w-full items-center gap-2.5 px-3 py-2.5 transition-all duration-200 hover:bg-purple-500/[0.05] text-left border-t border-white/[0.04] first:border-t-0"
              >
                {player.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={player.avatar_url}
                    alt={player.name}
                    className="h-7 w-7 rounded-full shrink-0 ring-1 ring-white/10"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-white/[0.08] flex items-center justify-center text-xs shrink-0">
                    👤
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate group-hover:text-purple-200 transition-colors">{player.name}</p>
                  {player.username && (
                    <p className="text-[10px] text-zinc-600 truncate">@{player.username}</p>
                  )}
                </div>
                <span className="text-xs font-black text-purple-400 shrink-0">{Number(player.cr).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
