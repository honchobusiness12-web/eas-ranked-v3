import { pool } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeasonStatus = "active" | "paused" | "ended" | "upcoming";

export interface Season {
  id: string;
  name: string;
  description: string;
  status: SeasonStatus;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface SeasonStats {
  total_matches: number;
  total_players: number;
  avg_cr: number;
  top_players: TopPlayer[];
}

export interface TopPlayer {
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  cr: number;
  matches: number;
  wins: number;
}

// ---------------------------------------------------------------------------
// Ensure table exists
// ---------------------------------------------------------------------------

async function ensureSeasonsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS seasons (
        id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(255) NOT NULL,
        description TEXT         NOT NULL DEFAULT '',
        status      VARCHAR(32)  NOT NULL DEFAULT 'upcoming'
                                 CHECK (status IN ('active', 'paused', 'ended', 'upcoming')),
        start_date  TIMESTAMP,
        end_date    TIMESTAMP,
        created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
        created_by  VARCHAR(32)  NOT NULL
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_seasons_status     ON seasons(status)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_seasons_start_date ON seasons(start_date DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_seasons_created_at ON seasons(created_at DESC)
    `);
  } catch (err) {
    console.error("[seasons] ensureSeasonsTable failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Get current (active) season
// ---------------------------------------------------------------------------

export async function getCurrentSeason(): Promise<Season | null> {
  await ensureSeasonsTable();

  const result = await pool.query<Season>(
    `SELECT * FROM seasons WHERE status = 'active' ORDER BY start_date DESC LIMIT 1`
  );

  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Get all seasons
// ---------------------------------------------------------------------------

export async function getAllSeasons(limit = 50): Promise<Season[]> {
  await ensureSeasonsTable();

  const result = await pool.query<Season>(
    `SELECT * FROM seasons ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );

  return result.rows;
}

// ---------------------------------------------------------------------------
// Get a single season by ID
// ---------------------------------------------------------------------------

export async function getSeasonById(id: string): Promise<Season | null> {
  await ensureSeasonsTable();

  const result = await pool.query<Season>(
    `SELECT * FROM seasons WHERE id = $1`,
    [id]
  );

  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Create season
// ---------------------------------------------------------------------------

export async function createSeason(
  name: string,
  description: string,
  status: SeasonStatus,
  startDate: string | null,
  endDate: string | null,
  createdBy: string
): Promise<Season> {
  await ensureSeasonsTable();

  // Enforce only one active season at a time
  if (status === "active") {
    await pool.query(
      `UPDATE seasons SET status = 'paused', updated_at = NOW() WHERE status = 'active'`
    );
  }

  const result = await pool.query<Season>(
    `
    INSERT INTO seasons (name, description, status, start_date, end_date, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [name, description, status, startDate ?? null, endDate ?? null, createdBy]
  );

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Update season
// ---------------------------------------------------------------------------

export async function updateSeason(
  id: string,
  updates: {
    name?: string;
    description?: string;
    status?: SeasonStatus;
    start_date?: string | null;
    end_date?: string | null;
  }
): Promise<Season | null> {
  await ensureSeasonsTable();

  // Enforce only one active season at a time
  if (updates.status === "active") {
    await pool.query(
      `UPDATE seasons SET status = 'paused', updated_at = NOW() WHERE status = 'active' AND id != $1`,
      [id]
    );
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push(`description = $${idx++}`);
    values.push(updates.description);
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(updates.status);
  }
  if ("start_date" in updates) {
    fields.push(`start_date = $${idx++}`);
    values.push(updates.start_date ?? null);
  }
  if ("end_date" in updates) {
    fields.push(`end_date = $${idx++}`);
    values.push(updates.end_date ?? null);
  }

  if (fields.length === 0) return getSeasonById(id);

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query<Season>(
    `UPDATE seasons SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );

  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Delete season
// ---------------------------------------------------------------------------

export async function deleteSeason(id: string): Promise<boolean> {
  await ensureSeasonsTable();

  // Safety: cannot delete an active season
  const season = await getSeasonById(id);
  if (!season) return false;
  if (season.status === "active") {
    throw new Error("Cannot delete an active season. End or pause it first.");
  }

  const result = await pool.query(
    `DELETE FROM seasons WHERE id = $1`,
    [id]
  );

  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Get season statistics (derived from the players table)
// ---------------------------------------------------------------------------

export async function getSeasonStats(_seasonId: string): Promise<SeasonStats> {
  // Statistics are derived from the global players table since matches are
  // not yet partitioned per season. This returns overall arena stats.
  const statsResult = await pool.query<{
    total_players: string;
    total_matches: string;
    avg_cr: string;
  }>(`
    SELECT
      COUNT(*)                                    AS total_players,
      COALESCE(SUM(matches), 0)                   AS total_matches,
      COALESCE(ROUND(AVG(cr)::numeric, 0), 0)     AS avg_cr
    FROM players
    WHERE registered = TRUE
  `);

  const row = statsResult.rows[0];

  const topResult = await pool.query<TopPlayer>(`
    SELECT
      user_id,
      name,
      username,
      avatar_url,
      cr,
      COALESCE(matches, 0) AS matches,
      COALESCE(wins, 0)    AS wins
    FROM players
    WHERE registered = TRUE
    ORDER BY cr DESC
    LIMIT 10
  `);

  return {
    total_players: Number(row?.total_players ?? 0),
    total_matches: Number(row?.total_matches ?? 0),
    avg_cr: Number(row?.avg_cr ?? 0),
    top_players: topResult.rows,
  };
}

// ---------------------------------------------------------------------------
// Get top players for a season
// ---------------------------------------------------------------------------

export async function getSeasonPlayers(
  _seasonId: string,
  limit = 10
): Promise<TopPlayer[]> {
  const result = await pool.query<TopPlayer>(
    `
    SELECT
      user_id,
      name,
      username,
      avatar_url,
      cr,
      COALESCE(matches, 0) AS matches,
      COALESCE(wins, 0)    AS wins
    FROM players
    WHERE registered = TRUE
    ORDER BY cr DESC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}
