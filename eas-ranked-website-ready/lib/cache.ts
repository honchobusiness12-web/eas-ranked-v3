import { pool } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachedPlayer {
  guild_id: string;
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  cr: number;
  wins: number;
  losses: number;
  kills: number;
  matches: number;
  mvp_count: number;
  placement_matches: number;
  ranked: boolean;
  registered: boolean;
  blacklisted: boolean;
  history?: string[];
  notes?: string[];
}

// ---------------------------------------------------------------------------
// DB query helpers
// ---------------------------------------------------------------------------

const LEADERBOARD_SQL = `
  SELECT
    guild_id,
    user_id,
    COALESCE(data->>'display_name', data->>'username', 'Unknown Player') AS name,
    data->>'username'   AS username,
    data->>'avatar_url' AS avatar_url,
    COALESCE((data->>'cr')::int,                0) AS cr,
    COALESCE((data->>'wins')::int,              0) AS wins,
    COALESCE((data->>'losses')::int,            0) AS losses,
    COALESCE((data->>'kills')::int,             0) AS kills,
    COALESCE((data->>'matches')::int,           0) AS matches,
    COALESCE((data->>'mvp_count')::int,         0) AS mvp_count,
    COALESCE((data->>'placement_matches')::int, 0) AS placement_matches,
    COALESCE((data->>'ranked')::boolean,      false) AS ranked,
    COALESCE((data->>'registered')::boolean,  false) AS registered,
    COALESCE((data->>'blacklisted')::boolean, false) AS blacklisted
  FROM players
  WHERE COALESCE((data->>'blacklisted')::boolean, false) = false
  ORDER BY cr DESC
  LIMIT 250
`;

const SINGLE_PLAYER_SQL = `
  SELECT
    guild_id,
    user_id,
    COALESCE(data->>'display_name', data->>'username', 'Unknown Player') AS name,
    data->>'username'   AS username,
    data->>'avatar_url' AS avatar_url,
    COALESCE((data->>'cr')::int,                0) AS cr,
    COALESCE((data->>'wins')::int,              0) AS wins,
    COALESCE((data->>'losses')::int,            0) AS losses,
    COALESCE((data->>'kills')::int,             0) AS kills,
    COALESCE((data->>'matches')::int,           0) AS matches,
    COALESCE((data->>'mvp_count')::int,         0) AS mvp_count,
    COALESCE((data->>'placement_matches')::int, 0) AS placement_matches,
    COALESCE((data->>'ranked')::boolean,      false) AS ranked,
    COALESCE((data->>'registered')::boolean,  false) AS registered,
    COALESCE((data->>'blacklisted')::boolean, false) AS blacklisted,
    COALESCE(data->'history', '[]'::jsonb) AS history,
    COALESCE(data->'notes',   '[]'::jsonb) AS notes
  FROM players
  WHERE user_id = $1
  LIMIT 1
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all players from PostgreSQL, sorted by CR descending.
 * Pages use Next.js ISR (revalidate) so this runs at most once per interval.
 */
export async function syncPlayersFromDB(): Promise<CachedPlayer[]> {
  try {
    const result = await pool.query(LEADERBOARD_SQL);
    console.log(`[db] Fetched ${result.rows.length} players from DB`);
    return result.rows as CachedPlayer[];
  } catch (err) {
    console.error("[db] syncPlayersFromDB failed:", err);
    return [];
  }
}

/**
 * Fetch a single player from PostgreSQL by user_id.
 */
export async function getPlayerFromDB(
  userId: string
): Promise<CachedPlayer | null> {
  try {
    const result = await pool.query(SINGLE_PLAYER_SQL, [userId]);
    return result.rows[0] ?? null;
  } catch (err) {
    console.error(`[db] getPlayerFromDB(${userId}) failed:`, err);
    return null;
  }
}
