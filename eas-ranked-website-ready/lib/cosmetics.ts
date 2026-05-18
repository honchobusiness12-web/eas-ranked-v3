import { pool } from "@/lib/db";
export type { GradientPreset, UsernameColor } from "@/lib/cosmetic-constants";
export { GRADIENT_PRESETS, USERNAME_COLORS } from "@/lib/cosmetic-constants";
import { GRADIENT_PRESETS, USERNAME_COLORS } from "@/lib/cosmetic-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerCosmetics {
  user_id: string;
  badge_gradient: string | null;
  username_color: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Ensure table exists
// ---------------------------------------------------------------------------

async function ensurePlayerCosmeticsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS player_cosmetics (
        user_id        VARCHAR(32) PRIMARY KEY,
        badge_gradient VARCHAR(64),
        username_color VARCHAR(32),
        updated_at     TIMESTAMP   NOT NULL DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.error("[cosmetics] ensurePlayerCosmeticsTable failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Get player cosmetics
// ---------------------------------------------------------------------------

export async function getPlayerCosmetics(userId: string): Promise<PlayerCosmetics | null> {
  try {
    await ensurePlayerCosmeticsTable();
    const result = await pool.query<PlayerCosmetics>(
      `SELECT * FROM player_cosmetics WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    console.error(`[cosmetics] getPlayerCosmetics(${userId}) failed:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Update badge gradient
// ---------------------------------------------------------------------------

export async function updateBadgeGradient(userId: string, gradientId: string): Promise<void> {
  await ensurePlayerCosmeticsTable();
  await pool.query(
    `
    INSERT INTO player_cosmetics (user_id, badge_gradient, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      badge_gradient = EXCLUDED.badge_gradient,
      updated_at     = NOW()
    `,
    [userId, gradientId]
  );
}

// ---------------------------------------------------------------------------
// Update username color
// ---------------------------------------------------------------------------

export async function updateUsernameColor(userId: string, colorId: string): Promise<void> {
  await ensurePlayerCosmeticsTable();
  await pool.query(
    `
    INSERT INTO player_cosmetics (user_id, username_color, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      username_color = EXCLUDED.username_color,
      updated_at     = NOW()
    `,
    [userId, colorId]
  );
}

// ---------------------------------------------------------------------------
// Resolve gradient CSS from preset ID
// ---------------------------------------------------------------------------

export function resolveGradientCss(gradientId: string | null | undefined): string | null {
  if (!gradientId) return null;
  return GRADIENT_PRESETS.find((g) => g.id === gradientId)?.css ?? null;
}

// ---------------------------------------------------------------------------
// Resolve username hex from color ID
// ---------------------------------------------------------------------------

export function resolveUsernameHex(colorId: string | null | undefined): string | null {
  if (!colorId) return null;
  return USERNAME_COLORS.find((c) => c.id === colorId)?.hex ?? null;
}
