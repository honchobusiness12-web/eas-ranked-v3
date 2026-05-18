import type { UserBadge } from "@/lib/premium";

interface BadgeDisplayProps {
  badges: UserBadge[];
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-[10px] gap-1",
  md: "px-3 py-1 text-xs gap-1.5",
  lg: "px-4 py-1.5 text-sm gap-2",
};

/**
 * Renders a horizontal row of user badges (developer, content creator, staff,
 * premium). Each badge is styled with its own accent colour and a subtle glow.
 */
export default function BadgeDisplay({
  badges,
  size = "md",
  className = "",
}: BadgeDisplayProps) {
  if (!badges || badges.length === 0) return null;

  const sizeClass = SIZE_CLASSES[size];

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {badges.map((badge) => (
        <span
          key={badge.id}
          className={`inline-flex items-center rounded-lg font-black tracking-wide ${sizeClass}`}
          style={{
            background: `linear-gradient(135deg, ${badge.color}33, ${badge.color}18)`,
            border: `1px solid ${badge.color}60`,
            color: badge.color,
            boxShadow: `0 0 8px ${badge.color}30`,
            textShadow: "0 1px 2px rgba(0,0,0,0.5)",
          }}
          title={badge.description}
        >
          <span>{badge.icon}</span>
          <span>{badge.label}</span>
        </span>
      ))}
    </div>
  );
}
