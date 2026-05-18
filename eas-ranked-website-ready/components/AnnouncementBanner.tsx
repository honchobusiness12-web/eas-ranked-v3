"use client";

import { useState, useEffect, useRef } from "react";
import { ANNOUNCEMENT_COLORS } from "@/lib/announcement-constants";
import { playSuccess } from "@/lib/sounds";

interface Announcement {
  id: string;
  title: string;
  message: string;
  color: string;
  sound_enabled: boolean;
  created_by: string;
  created_at: string;
  dismissed_by: string[];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const playedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        // Check login status
        const meRes = await fetch("/api/auth/me");
        const meData = await meRes.json();
        setIsLoggedIn(!!meData.user);

        // Fetch current announcements (no-cache for real-time)
        const res = await fetch("/api/announcements/current", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const list: Announcement[] = data.announcements ?? [];
        setAnnouncements(list);

        // Play sound for new announcements that have sound enabled.
        // Delayed by 800ms so it only fires after a real user interaction
        // has had a chance to unlock the AudioContext (avoids autoplay glitch).
        for (const ann of list) {
          if (ann.sound_enabled && !playedRef.current.has(ann.id)) {
            playedRef.current.add(ann.id);
            setTimeout(() => playSuccess(0.18), 800);
            break; // Only play once even if multiple sound-enabled announcements
          }
        }
      } catch {
        // Silently fail — announcements are non-critical
      }
    }

    load();
  }, []);

  async function handleDismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));

    if (isLoggedIn) {
      try {
        await fetch(`/api/announcements/${id}/dismiss`, { method: "POST" });
      } catch {
        // Silently fail
      }
    }
  }

  const visible = announcements.filter((a) => !dismissed.has(a.id));

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4 animate-fade-in">
      {visible.map((ann) => {
        const meta = ANNOUNCEMENT_COLORS.find((c) => c.id === ann.color);
        return (
          <div
            key={ann.id}
            className={`relative overflow-hidden rounded-xl border p-3.5 backdrop-blur-sm ${meta?.bg ?? "bg-blue-500/[0.06]"} ${meta?.border ?? "border-blue-500/20"}`}
          >
            {/* Subtle left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl ${meta?.text ? "" : "bg-blue-400/40"}`} style={meta?.text ? { background: "currentColor", opacity: 0.4 } : {}} />
            <div className="flex items-start justify-between gap-3 pl-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${meta?.text ?? "text-blue-300"}`}>
                    📢 Announcement
                  </span>
                  {ann.sound_enabled && <span className="text-xs text-yellow-400">🔔</span>}
                  <span className="text-[10px] text-zinc-600">{timeAgo(ann.created_at)}</span>
                </div>
                <p className="text-sm font-bold text-white">{ann.title}</p>
                <p className="mt-0.5 text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">{ann.message}</p>
              </div>
              <button
                onClick={() => handleDismiss(ann.id)}
                className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[10px] font-bold text-zinc-600 transition-all duration-200 hover:bg-white/[0.08] hover:text-zinc-300"
                aria-label="Dismiss announcement"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
