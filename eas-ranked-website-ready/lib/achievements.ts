import type { CachedPlayer } from "@/lib/cache";

// ---------------------------------------------------------------------------
// Achievement definitions
// ---------------------------------------------------------------------------

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (p: CachedPlayer) => boolean;
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: "first_blood",
    name: "First Blood",
    description: "Play your first match",
    icon: "⚔️",
    check: (p) => Number(p.matches || 0) >= 1,
  },
  {
    id: "ranked_up",
    name: "Ranked Up",
    description: "Complete placement matches and earn a rank",
    icon: "🏅",
    check: (p) => Boolean(p.ranked),
  },
  {
    id: "cr_500",
    name: "Rising Star",
    description: "Reach 500 CR",
    icon: "⭐",
    check: (p) => Number(p.cr || 0) >= 500,
  },
  {
    id: "cr_1000",
    name: "Four-Digit Club",
    description: "Reach 1,000 CR",
    icon: "💎",
    check: (p) => Number(p.cr || 0) >= 1000,
  },
  {
    id: "cr_2000",
    name: "Elite Climber",
    description: "Reach 2,000 CR",
    icon: "🔥",
    check: (p) => Number(p.cr || 0) >= 2000,
  },
  {
    id: "cr_3000",
    name: "Legend Territory",
    description: "Reach 3,000 CR",
    icon: "👑",
    check: (p) => Number(p.cr || 0) >= 3000,
  },
  {
    id: "cr_5000",
    name: "Hall of Famer",
    description: "Reach 5,000 CR — the pinnacle",
    icon: "🏆",
    check: (p) => Number(p.cr || 0) >= 5000,
  },
  {
    id: "wins_10",
    name: "On a Roll",
    description: "Win 10 matches",
    icon: "🎯",
    check: (p) => Number(p.wins || 0) >= 10,
  },
  {
    id: "wins_50",
    name: "Veteran",
    description: "Win 50 matches",
    icon: "🛡️",
    check: (p) => Number(p.wins || 0) >= 50,
  },
  {
    id: "wins_100",
    name: "Century Club",
    description: "Win 100 matches",
    icon: "💯",
    check: (p) => Number(p.wins || 0) >= 100,
  },
  {
    id: "kills_50",
    name: "Sharpshooter",
    description: "Record 50 kills",
    icon: "🎖️",
    check: (p) => Number(p.kills || 0) >= 50,
  },
  {
    id: "kills_200",
    name: "Killing Machine",
    description: "Record 200 kills",
    icon: "💀",
    check: (p) => Number(p.kills || 0) >= 200,
  },
  {
    id: "mvp_1",
    name: "Most Valuable",
    description: "Earn your first MVP",
    icon: "🌟",
    check: (p) => Number(p.mvp_count || 0) >= 1,
  },
  {
    id: "mvp_10",
    name: "MVP Machine",
    description: "Earn 10 MVPs",
    icon: "🥇",
    check: (p) => Number(p.mvp_count || 0) >= 10,
  },
  {
    id: "winrate_60",
    name: "Consistent",
    description: "Maintain a 60%+ win rate (min 20 matches)",
    icon: "📈",
    check: (p) => {
      const m = Number(p.matches || 0);
      const w = Number(p.wins || 0);
      return m >= 20 && w / m >= 0.6;
    },
  },
  {
    id: "winrate_75",
    name: "Dominant",
    description: "Maintain a 75%+ win rate (min 20 matches)",
    icon: "⚡",
    check: (p) => {
      const m = Number(p.matches || 0);
      const w = Number(p.wins || 0);
      return m >= 20 && w / m >= 0.75;
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAchievements(player: CachedPlayer): Achievement[] {
  return ACHIEVEMENT_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    unlocked: def.check(player),
  }));
}

export function getUnlockedCount(player: CachedPlayer): number {
  return ACHIEVEMENT_DEFS.filter((def) => def.check(player)).length;
}
