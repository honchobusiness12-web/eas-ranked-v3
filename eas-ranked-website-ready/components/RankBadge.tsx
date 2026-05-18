import { getRank } from "@/lib/ranks";
import { getTierColor } from "@/lib/charts";
import { GRADIENT_PRESETS } from "@/lib/cosmetic-constants";

const TIER_ICONS: Record<string, string> = {
  "R1 Rookie":        "🔰",
  "R2 Amateur":       "🟢",
  "R3 Pro":           "🔵",
  "R4 Elite":         "🟣",
  "R5 All-Star":      "🌟",
  "R6 SuperStar":     "🔴",
  "R7 Remorseless":   "💥",
  "R8 Legend":        "🔶",
  "R9 Unreal":        "🌀",
  "R10 Hall Of Fame": "🏆",
};

function getTierIcon(rankName: string): string {
  for (const [tier, icon] of Object.entries(TIER_ICONS)) {
    if (rankName.startsWith(tier)) return icon;
  }
  return "🎮";
}

export type RankBadgeStyle =
  | "default"
  | "glowing"
  | "pulsing"
  | "gradient"
  | "holographic";

interface RankBadgeProps {
  cr: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  badgeStyle?: RankBadgeStyle | string | null;
  /** Optional gradient preset ID from player_cosmetics.badge_gradient */
  gradientId?: string | null;
}

function buildStyleProps(
  color: string,
  badgeStyle: RankBadgeStyle | string | null | undefined
): React.CSSProperties {
  const base: React.CSSProperties = {
    borderColor: `${color}60`,
    backgroundColor: `${color}18`,
    color,
  };

  switch (badgeStyle) {
    case "glowing":
      return {
        ...base,
        boxShadow: `0 0 12px ${color}80, 0 0 24px ${color}40`,
      };
    case "gradient":
      return {
        ...base,
        background: `linear-gradient(135deg, ${color}30, ${color}10)`,
        borderColor: `${color}80`,
      };
    case "holographic":
      return {
        ...base,
        background: `linear-gradient(135deg, ${color}40, #ffffff18, ${color}30)`,
        borderColor: `${color}90`,
        boxShadow: `0 0 16px ${color}60, inset 0 0 8px rgba(255,255,255,0.08)`,
      };
    default:
      return base;
  }
}

export default function RankBadge({
  cr,
  size = "md",
  showLabel = true,
  badgeStyle = "default",
  gradientId = null,
}: RankBadgeProps) {
  const rankName = getRank(cr);
  const color = getTierColor(rankName);
  const icon = getTierIcon(rankName);

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[11px] gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
    lg: "px-3.5 py-1.5 text-sm gap-2",
  }[size];

  // "pulsing" needs a Tailwind animation class; others are pure inline styles
  const isPulsing = badgeStyle === "pulsing";

  // If a custom gradient preset is provided, override the default style
  const gradientPreset = gradientId
    ? GRADIENT_PRESETS.find((g) => g.id === gradientId)
    : null;

  const customGradientStyle: React.CSSProperties | undefined = gradientPreset
    ? {
        background: gradientPreset.css,
        borderColor: `${gradientPreset.to}60`,
        color: "#ffffff",
      }
    : undefined;

  return (
    <span
      className={`inline-flex items-center rounded-lg border font-bold ${sizeClasses}${isPulsing ? " animate-pulse" : ""}`}
      style={customGradientStyle ?? buildStyleProps(color, badgeStyle)}
      title={`${rankName} — ${cr} CR`}
      {...(customGradientStyle ? { "data-gradient-badge": "true" } : {})}
    >
      <span>{icon}</span>
      {showLabel && <span>{rankName}</span>}
    </span>
  );
}
