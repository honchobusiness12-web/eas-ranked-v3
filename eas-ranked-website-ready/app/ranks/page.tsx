import Shell from "@/components/Shell";
import Link from "next/link";

const RANK_TIERS = [
  {
    number: "R1",
    name: "Rookie",
    crMin: 0,
    crMax: 399,
    icon: "🌱",
    color: "#6b7280",
    glow: "rgba(107,114,128,0.25)",
    border: "rgba(107,114,128,0.30)",
    description:
      "The starting point for every competitor. Rookies are learning the fundamentals of EAS Ranked and building their first CR.",
  },
  {
    number: "R2",
    name: "Amateur",
    crMin: 400,
    crMax: 699,
    icon: "⚔️",
    color: "#22c55e",
    glow: "rgba(34,197,94,0.22)",
    border: "rgba(34,197,94,0.30)",
    description:
      "Players who have proven they can compete. Amateurs are developing consistency and starting to climb the ladder.",
  },
  {
    number: "R3",
    name: "Pro",
    crMin: 700,
    crMax: 999,
    icon: "🔥",
    color: "#38bdf8",
    glow: "rgba(56,189,248,0.22)",
    border: "rgba(56,189,248,0.30)",
    description:
      "Skilled players with solid mechanics and game sense. Pros are a cut above the average and compete with purpose.",
  },
  {
    number: "R4",
    name: "Elite",
    crMin: 1000,
    crMax: 1199,
    icon: "💎",
    color: "#818cf8",
    glow: "rgba(129,140,248,0.22)",
    border: "rgba(129,140,248,0.30)",
    description:
      "Top-tier competitors who consistently outperform. Elite players have mastered the core systems and rarely slip up.",
  },
  {
    number: "R5",
    name: "All-Star",
    crMin: 1200,
    crMax: 1599,
    icon: "⭐",
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.25)",
    border: "rgba(167,139,250,0.35)",
    description:
      "The best of the best in the general pool. All-Stars are recognized names in the EAS community and feared opponents.",
  },
  {
    number: "R6",
    name: "Superstar",
    crMin: 1600,
    crMax: 2099,
    icon: "🌟",
    color: "#c084fc",
    glow: "rgba(192,132,252,0.28)",
    border: "rgba(192,132,252,0.38)",
    description:
      "Exceptional players who dominate lobbies. Superstars set the standard for high-level EAS Ranked play.",
  },
  {
    number: "R7",
    name: "Remorseless",
    crMin: 2100,
    crMax: 2749,
    icon: "💀",
    color: "#f43f5e",
    glow: "rgba(244,63,94,0.25)",
    border: "rgba(244,63,94,0.35)",
    description:
      "Ruthless competitors who show no mercy. Reaching Remorseless means you have outlasted and outplayed hundreds of rivals.",
  },
  {
    number: "R8",
    name: "Legend",
    crMin: 2750,
    crMax: 3549,
    icon: "🏆",
    color: "#f5c542",
    glow: "rgba(245,197,66,0.28)",
    border: "rgba(245,197,66,0.40)",
    description:
      "Legendary status. These players are talked about in the community and have proven themselves across countless matches.",
  },
  {
    number: "R9",
    name: "Unreal",
    crMin: 3550,
    crMax: 4499,
    icon: "⚡",
    color: "#fb923c",
    glow: "rgba(251,146,60,0.28)",
    border: "rgba(251,146,60,0.40)",
    description:
      "Beyond elite — Unreal players operate at a level most can only dream of. A rare tier reserved for the truly exceptional.",
  },
  {
    number: "R10",
    name: "Hall of Fame",
    crMin: 4500,
    crMax: null,
    icon: "👑",
    color: "#f5c542",
    glow: "rgba(245,197,66,0.40)",
    border: "rgba(245,197,66,0.55)",
    description:
      "The pinnacle of EAS Ranked. Hall of Fame players are immortalized in the competitive history of EAS Arena.",
  },
];

function RankCard({ tier, index }: { tier: (typeof RANK_TIERS)[0]; index: number }) {
  const crRange =
    tier.crMax !== null
      ? `${tier.crMin.toLocaleString()}–${tier.crMax.toLocaleString()} CR`
      : `${tier.crMin.toLocaleString()}+ CR`;

  return (
    <div
      className="eas-rank-card"
      style={{
        background: `linear-gradient(135deg, rgba(15,23,42,.88), rgba(2,6,23,.80))`,
        border: `1px solid ${tier.border}`,
        borderRadius: 24,
        padding: "22px 24px",
        boxShadow: `0 0 32px ${tier.glow}, inset 0 1px 0 rgba(255,255,255,.055)`,
        backdropFilter: "blur(18px)",
        display: "flex",
        flexDirection: "column" as const,
        gap: 12,
        position: "relative" as const,
        overflow: "hidden" as const,
      }}
    >
      {/* Background rank number watermark */}
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: -10,
          fontSize: 80,
          fontWeight: 1000,
          color: "rgba(255,255,255,.04)",
          lineHeight: 1,
          letterSpacing: "-0.04em",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {tier.number}
      </div>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 16,
            display: "grid",
            placeItems: "center",
            fontSize: 22,
            background: `linear-gradient(135deg, ${tier.glow}, rgba(0,0,0,0.2))`,
            border: `1px solid ${tier.border}`,
            flexShrink: 0,
          }}
        >
          {tier.icon}
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: tier.color,
            }}
          >
            {tier.number}
          </div>
          <div style={{ fontSize: 20, fontWeight: 1000, lineHeight: 1.1 }}>{tier.name}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            CR Range
          </div>
          <div style={{ fontSize: 13, fontWeight: 950, color: tier.color, marginTop: 2 }}>
            {crRange}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: `rgba(255,255,255,.07)` }} />

      {/* Description */}
      <p
        style={{
          margin: 0,
          color: "#b7bfd2",
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.65,
        }}
      >
        {tier.description}
      </p>

      {/* Progression indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
        {RANK_TIERS.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 999,
              background: i <= index ? tier.color : "rgba(255,255,255,.10)",
              transition: "background .2s",
            }}
          />
        ))}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "var(--muted)",
          letterSpacing: "0.12em",
        }}
      >
        Tier {index + 1} of {RANK_TIERS.length}
      </div>
    </div>
  );
}

export default function RanksPage() {
  return (
    <Shell>
      <div className="eas-page-header">
        <div>
          <div className="eas-kicker">EAS Arena</div>
          <h1 className="eas-page-title">Ranks</h1>
          <p className="eas-page-sub">
            10 tiers of competitive progression — from Rookie to Hall of Fame.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/guide" className="eas-btn">
            📖 Guide
          </Link>
          <Link href="/leaderboard" className="eas-btn eas-btn-primary">
            Leaderboard
          </Link>
        </div>
      </div>

      {/* Summary stat cards */}
      <div
        className="eas-grid"
        style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginBottom: 28 }}
      >
        <div className="eas-card eas-stat">
          <div className="eas-stat-label">Total Tiers</div>
          <div className="eas-stat-value">10</div>
          <div className="eas-stat-sub">R1 through R10</div>
        </div>
        <div className="eas-card eas-stat">
          <div className="eas-stat-label">Entry CR</div>
          <div className="eas-stat-value">0</div>
          <div className="eas-stat-sub">Start at R1 Rookie</div>
        </div>
        <div className="eas-card eas-stat">
          <div className="eas-stat-label">Max CR</div>
          <div className="eas-stat-value">4,500+</div>
          <div className="eas-stat-sub">R10 Hall of Fame</div>
        </div>
      </div>

      {/* Rank cards grid */}
      <div
        className="eas-grid"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 18 }}
      >
        {RANK_TIERS.map((tier, i) => (
          <RankCard key={tier.number} tier={tier} index={i} />
        ))}
      </div>

      {/* Footer note */}
      <div
        className="eas-card"
        style={{ marginTop: 28, textAlign: "center", padding: "20px 24px" }}
      >
        <p style={{ margin: 0, color: "var(--muted)", fontWeight: 700, fontSize: 13 }}>
          Each rank tier has Low, Mid, and High sub-divisions. Complete your{" "}
          <Link href="/placements" style={{ color: "var(--purple)", fontWeight: 900 }}>
            10 placement matches
          </Link>{" "}
          to receive your starting rank. CR is earned and lost through wins and losses in ranked
          matches.
        </p>
      </div>
    </Shell>
  );
}

