import { pool } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CRAuditLog {
  id: string;
  player_id: string;
  player_name: string | null;
  old_cr: number;
  new_cr: number;
  edited_by: string;
  edited_at: string;
  reason: string;
  created_at: string;
}

export interface PlayerCRInfo {
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  cr: number;
}

// ---------------------------------------------------------------------------
// Ensure the audit log table exists (idempotent)
// ---------------------------------------------------------------------------

async function ensureCRAuditTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cr_audit_logs (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id  VARCHAR(32) NOT NULL,
        old_cr     INT         NOT NULL,
        new_cr     INT         NOT NULL,
        edited_by  VARCHAR(32) NOT NULL,
        edited_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
        reason     TEXT        NOT NULL,
        created_at TIMESTAMP   NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_cr_audit_logs_player_id ON cr_audit_logs(player_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_cr_audit_logs_edited_at ON cr_audit_logs(edited_at DESC)`
    );
  } catch (err) {
    console.error("[cr-admin] ensureCRAuditTable failed:", err);
  }
}

// ---------------------------------------------------------------------------
// validateCRValue — CR must be an integer between 0 and 9999
// ---------------------------------------------------------------------------

export function validateCRValue(cr: number): { valid: boolean; error?: string } {
  if (!Number.isInteger(cr)) {
    return { valid: false, error: "CR must be a whole number." };
  }
  if (cr < 0) {
    return { valid: false, error: "CR cannot be negative." };
  }
  if (cr > 9999) {
    return { valid: false, error: "CR cannot exceed 9999." };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// getPlayerCRInfo — look up a single player by Discord user ID
// ---------------------------------------------------------------------------

export async function getPlayerCRInfo(playerId: string): Promise<PlayerCRInfo | null> {
  const result = await pool.query<PlayerCRInfo>(
    `
    SELECT
      user_id,
      COALESCE(data->>'display_name', data->>'username', 'Unknown Player') AS name,
      data->>'username' AS username,
      data->>'avatar_url' AS avatar_url,
      COALESCE((data->>'cr')::int, 0) AS cr
    FROM players
    WHERE user_id = $1
    LIMIT 1
    `,
    [playerId]
  );

  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// updatePlayerCR — update a single player's CR and write an audit log entry
// This is the ONLY sanctioned path for admin CR edits.
// ---------------------------------------------------------------------------

export async function updatePlayerCR(
  playerId: string,
  newCR: number,
  editedBy: string,
  reason: string
): Promise<{ success: true; oldCR: number } | { success: false; error: string }> {
  await ensureCRAuditTable();

  const validation = validateCRValue(newCR);
  if (!validation.valid) {
    return { success: false, error: validation.error! };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the player row and read current CR
    const playerResult = await client.query(
      `SELECT COALESCE((data->>'cr')::int, 0) AS cr FROM players WHERE user_id = $1 FOR UPDATE`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { success: false, error: "Player not found." };
    }

    const oldCR: number = playerResult.rows[0].cr;

    // Update the CR inside the JSONB data column
    await client.query(
      `UPDATE players SET data = jsonb_set(data, '{cr}', $1::text::jsonb) WHERE user_id = $2`,
      [newCR, playerId]
    );

    // Write the immutable audit log entry
    await client.query(
      `
      INSERT INTO cr_audit_logs (player_id, old_cr, new_cr, edited_by, reason)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [playerId, oldCR, newCR, editedBy, reason.trim()]
    );

    await client.query("COMMIT");

    console.log(
      `[cr-admin] ${editedBy} updated ${playerId} CR: ${oldCR} → ${newCR} | reason: ${reason}`
    );

    return { success: true, oldCR };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[cr-admin] updatePlayerCR(${playerId}, ${newCR}) failed:`, err);
    return { success: false, error: "Database error. Please try again." };
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getCRAuditLogs — paginated audit log retrieval
// Pass playerId to filter to a specific player, or omit for all logs.
// ---------------------------------------------------------------------------

export async function getCRAuditLogs(
  playerId?: string,
  limit = 10,
  offset = 0
): Promise<{ logs: CRAuditLog[]; total: number }> {
  await ensureCRAuditTable();

  const whereClause = playerId ? `WHERE cal.player_id = $3` : "";
  const params: (string | number)[] = [limit, offset];
  if (playerId) params.push(playerId);

  const [logsResult, countResult] = await Promise.all([
    pool.query<CRAuditLog>(
      `
      SELECT
        cal.id,
        cal.player_id,
        COALESCE(p.data->>'display_name', p.data->>'username', cal.player_id) AS player_name,
        cal.old_cr,
        cal.new_cr,
        cal.edited_by,
        cal.edited_at,
        cal.reason,
        cal.created_at
      FROM cr_audit_logs cal
      LEFT JOIN players p ON p.user_id = cal.player_id
      ${whereClause}
      ORDER BY cal.edited_at DESC
      LIMIT $1 OFFSET $2
      `,
      params
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM cr_audit_logs ${playerId ? "WHERE player_id = $1" : ""}`,
      playerId ? [playerId] : []
    ),
  ]);

  return {
    logs: logsResult.rows,
    total: parseInt(countResult.rows[0].count, 10),
  };
}
