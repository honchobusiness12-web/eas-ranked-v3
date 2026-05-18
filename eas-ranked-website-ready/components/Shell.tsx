"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { DiscordUser, RobloxUser } from "@/lib/auth";

const mainNav = [
  ["Home", "/", "⌂"],
  ["Leaderboard", "/leaderboard", "🏆"],
  ["Players", "/players", "👥"],
  ["Ranks", "/ranks", "✦"],
  ["Placements", "/placements", "📋"],
  ["Compare", "/compare", "⚔️"],
  ["Guide", "/guide", "📖"],
];

const adminNav = [
  ["Admin Panel", "/admin", "🛡️"],
  ["Players", "/admin/players", "👥"],
  ["CR Admin", "/admin/cr", "⚙️"],
  ["Seasons", "/admin/seasons", "🏆"],
  ["Badges", "/admin/badges", "🏅"],
  ["Moderation", "/admin/moderation", "🔨"],
  ["Analytics", "/admin/analytics", "📊"],
];

function discordAvatar(user?: DiscordUser | null) {
  return user?.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=96` : null;
}

export default function Shell({
  children,
  user,
  robloxUser,
}: {
  children: React.ReactNode;
  user?: DiscordUser | null;
  robloxUser?: RobloxUser | null;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    fetch("/api/admin/check")
      .then((r) => r.json())
      .then((d) => setIsOwner(Boolean(d?.ok || d?.isOwner || d?.allowed)))
      .catch(() => setIsOwner(false));
  }, []);

  return (
    <div className="eas-app">
      <aside className={`eas-sidebar ${open ? "open" : ""}`}>
        <Link href="/" className="eas-brand" onClick={() => setOpen(false)}>
          <div className="eas-logo">✦</div>
          <div>
            <div className="eas-brand-title">EAS ARENA</div>
            <div className="eas-brand-sub">RANKED</div>
          </div>
        </Link>

        <div className="eas-nav-section">
          <div className="eas-nav-label">Main</div>
          <div className="eas-nav-list">
            {mainNav.map(([label, href, icon]) => {
              const active = path === href || (href !== "/" && path.startsWith(href));
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)} className={`eas-nav-link ${active ? "active" : ""}`}>
                  <span className="eas-nav-ico">{icon}</span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {isOwner && (
          <div className="eas-nav-section">
            <div className="eas-nav-label">Owner</div>
            <div className="eas-nav-list">
              {adminNav.map(([label, href, icon]) => {
                const active = path === href || path.startsWith(href + "/");
                return (
                  <Link key={href} href={href} onClick={() => setOpen(false)} className={`eas-nav-link ${active ? "active" : ""}`}>
                    <span className="eas-nav-ico">{icon}</span>
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="eas-sidebar-bottom">
          {user ? (
            <div className="eas-card" style={{ padding: 14 }}>
              <div className="eas-player-cell">
                <div className="eas-avatar">
                  {discordAvatar(user) ? <img src={discordAvatar(user)!} alt="" /> : (user.global_name || user.username || "?").slice(0, 1)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="eas-player-name">{user.global_name || user.username}</div>
                  <div className="eas-player-sub">Discord linked</div>
                </div>
              </div>
              {robloxUser ? (
                <div className="eas-rank-pill" style={{ marginTop: 12 }}>Roblox: {robloxUser.preferred_username || robloxUser.name || robloxUser.sub}</div>
              ) : (
                <Link href="/api/auth/roblox" className="eas-btn" style={{ width: "100%", marginTop: 12 }}>Link Roblox</Link>
              )}
            </div>
          ) : (
            <Link className="eas-btn eas-btn-primary" style={{ width: "100%" }} href="/auth/login">Login with Discord</Link>
          )}
        </div>
      </aside>

      {open && <button aria-label="Close menu" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30, background: "rgba(0,0,0,.72)", border: 0 }} />}

      <div className="eas-main">
        <header className="eas-topbar">
          <button onClick={() => setOpen(true)} className="eas-btn eas-mobile-menu">☰</button>
          <div>
            <div className="eas-top-kicker">Elevate All-Stars</div>
            <div className="eas-top-title">TimeBomb Duels Ranked</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {user && <Link className="eas-btn" href={`/profile/${user.id}`}>Profile</Link>}
            {user ? <a className="eas-btn" href="/api/auth/logout">Logout</a> : <Link className="eas-btn eas-btn-primary" href="/auth/login">Login</Link>}
          </div>
        </header>
        <main className="eas-content">{children}</main>
      </div>
    </div>
  );
}
