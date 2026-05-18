import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DEVELOPER_USER_ID } from "@/lib/premium";
import { pool } from "@/lib/db";

function isDeveloper(userId: string): boolean {
  return userId === DEVELOPER_USER_ID;
}

// ---------------------------------------------------------------------------
// Ensure moderation_logs table exists
// ---------------------------------------------------------------------------

async function ensureModerationTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS moderation_logs (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id   VARCHAR(32) NOT NULL,
        action      VARCHAR(50) NOT NULL,
        reason      TEXT        NOT NULL DEFAULT '',
        performed_by VARCHAR(32) NOT NULL,
        created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_moderation_logs_player_id ON moderation_logs(player_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_moderation_logs_created_at ON moderation_logs(created_at DESC)`
    );
  } catch (err) {
    console.error("[moderation] ensureModerationTable failed:", err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/moderation?type=blacklisted|all&limit=50&offset=0
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  await ensureModerationTable();

  const type   = req.nextUrl.searchParams.get("type") ?? "blacklisted";
  const limit  = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 50), 1), 200);
  const offset = Math.max(Number(req.nextUrl.searchParams.get("offset") ?? 0), 0);

  try {
    const whereClause =
      type === "blacklisted"
        ? `WHERE COALESCE((data->>'blacklisted')::boolean, false) = true`
        : "";

    const [playersResult, countResult, logsResult] = await Promise.all([
      pool.query(
        `SELECT
           user_id,
           COALESCE(data->>'display_name', data->>'username', 'Unknown Player') AS name,
           data->>'username'   AS username,
           data->>'avatar_url' AS avatar_url,
           COALESCE((data->>'cr')::int, 0)      AS cr,
           COALESCE((data->>'wins')::int, 0)     AS wins,
           COALESCE((data->>'losses')::int, 0)   AS losses,
           COALESCE((data->>'blacklisted')::boolean, false) AS blacklisted
         FROM players
         ${whereClause}
         ORDER BY name ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM players ${whereClause}`
      ),
      // Recent moderation actions
      pool.query(`
        SELECT
          ml.id,
          ml.player_id,
          COALESCE(p.data->>'display_name', p.data->>'username', ml.player_id) AS player_name,
          ml.action,
          ml.reason,
          ml.performed_by,
          ml.created_at
        FROM moderation_logs ml
        LEFT JOIN players p ON p.user_id = ml.player_id
        ORDER BY ml.created_at DESC
        LIMIT 20
      `),
    ]);

    return NextResponse.json({
      players: playersResult.rows,
      total:   parseInt(countResult.rows[0].count, 10),
      logs:    logsResult.rows,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[api/admin/moderation] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch moderation data" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/moderation — blacklist / unblacklist a player
// Body: { userId, action: "blacklist" | "unblacklist", reason? }
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  await ensureModerationTable();

  let body: { userId?: string; action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userId, action, reason = "" } = body;

  if (!userId?.trim()) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (action !== "blacklist" && action !== "unblacklist") {
    return NextResponse.json({ error: "action must be 'blacklist' or 'unblacklist'" }, { status: 400 });
  }

  try {
    // Check player exists
    const check = await pool.query(
      `SELECT user_id FROM players WHERE user_id = $1 LIMIT 1`,
      [userId.trim()]
    );
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const blacklisted = action === "blacklist";

    await pool.query(
      `UPDATE players
       SET data = jsonb_set(COALESCE(data, '{}'), '{blacklisted}', $1::text::jsonb)
       WHERE user_id = $2`,
      [blacklisted, userId.trim()]
    );

    // Log the action
    await pool.query(
      `INSERT INTO moderation_logs (player_id, action, reason, performed_by)
       VALUES ($1, $2, $3, $4)`,
      [userId.trim(), action, reason.trim(), session.userId]
    );

    return NextResponse.json({ success: true, userId, action, blacklisted });
  } catch (err) {
    console.error("[api/admin/moderation] POST failed:", err);
    return NextResponse.json({ error: "Failed to perform moderation action" }, { status: 500 });
  }
}
