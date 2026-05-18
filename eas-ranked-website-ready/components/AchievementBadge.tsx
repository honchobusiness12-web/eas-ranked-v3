import type { Achievement } from "@/lib/achievements";

interface AchievementBadgeProps {
  achievement: Achievement;
  size?: "sm" | "md";
}

export default function AchievementBadge({ achievement, size = "md" }: AchievementBadgeProps) {
  const isLocked = !achievement.unlocked;

  const sizeClasses = size === "sm"
    ? "p-2 text-xl"
    : "p-3 text-2xl";

  return (
    <div
      className={`relative flex flex-col items-center gap-1 rounded-xl border transition group ${
        isLocked
          ? "border-white/5 bg-white/3 opacity-40 grayscale"
          : "border-orange-700/40 bg-orange-950/20 hover:border-orange-500/60"
      } ${sizeClasses}`}
      title={`${achievement.name}: ${achievement.description}${isLocked ? " (Locked)" : ""}`}
    >
      <span className={isLocked ? "opacity-50" : ""}>{achievement.icon}</span>
      {size === "md" && (
        <span className={`text-center text-xs font-bold leading-tight ${isLocked ? "text-zinc-600" : "text-zinc-300"}`}>
          {achievement.name}
        </span>
      )}
      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#0d0d14] px-3 py-2 text-xs text-zinc-300 opacity-0 shadow-xl transition group-hover:opacity-100 z-10">
        <p className="font-bold text-white">{achievement.name}</p>
        <p className="mt-0.5 text-zinc-400">{achievement.description}</p>
        {isLocked && <p className="mt-1 text-red-400">🔒 Locked</p>}
        {!isLocked && <p className="mt-1 text-green-400">✅ Unlocked</p>}
      </div>
    </div>
  );
}
