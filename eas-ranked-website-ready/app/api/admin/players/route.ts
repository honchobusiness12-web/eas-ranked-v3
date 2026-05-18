import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DEVELOPER_USER_ID } from "@/lib/premium";
import { pool } from "@/lib/db";

function isDeveloper(userId: string): boolean {
  return userId === DEVELOPER_USER_ID;
}

// ---------------------------------------------------------------------------
// GET /api/admin/players?search=xxx&limit=20&offset=0
// GET /api/admin/players?userId=xxx
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get("userId");
  const search = req.nextUrl.searchParams.get("search");
  const limit  = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 20), 1), 100);
  const offset = Math.max(Number(req.nextUrl.searchParams.get("offset") ?? 0), 0);

  // Single player lookup
  if (userId) {
    try {
      const result = await pool.query(
        `SELECT
           user_id,
           COALESCE(data->>'display_name', data->>'username', 'Unknown Player') AS name,
           data->>'username'   AS username,
           data->>'avatar_url' AS avatar_url,
           COALESCE((data->>'cr')::int, 0)      AS cr,
           COALESCE((data->>'wins')::int, 0)     AS wins,
           COALESCE((data->>'losses')::int, 0)   AS losses,
           COALESCE((data->>'kills')::int, 0)    AS kills,
           COALESCE((data->>'matches')::int, 0)  AS matches,
           COALESCE((data->>'mvp_count')::int, 0) AS mvp_count,
           COALESCE((data->>'placement_matches')::int, 0) AS placement_matches,
           COALESCE((data->>'ranked')::boolean, false)      AS ranked,
           COALESCE((data->>'registered')::boolean, false)  AS registered,
           COALESCE((data->>'blacklisted')::boolean, false) AS blacklisted,
           premium_expires_at
         FROM players
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "Player not found" }, { status: 404 });
      }
      return NextResponse.json({ player: result.rows[0] });
    } catch (err) {
      console.error("[api/admin/players] GET single failed:", err);
      return NextResponse.json({ error: "Failed to fetch player" }, { status: 500 });
    }
  }

  // Search / list players
  try {
    const whereClause = search
      ? `WHERE (
           LOWER(COALESCE(data->>'display_name', '')) LIKE $3
           OR LOWER(COALESCE(data->>'username', ''))   LIKE $3
           OR user_id = $4
         )`
      : "";

    const params: (string | number)[] = [limit, offset];
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      params.push(search.trim());
    }

    const [playersResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           user_id,
           COALESCE(data->>'display_name', data->>'username', 'Unknown Player') AS name,
           data->>'username'   AS username,
           data->>'avatar_url' AS avatar_url,
           COALESCE((data->>'cr')::int, 0)      AS cr,
           COALESCE((data->>'wins')::int, 0)     AS wins,
           COALESCE((data->>'losses')::int, 0)   AS losses,
           COALESCE((data->>'matches')::int, 0)  AS matches,
           COALESCE((data->>'blacklisted')::boolean, false) AS blacklisted,
           COALESCE((data->>'ranked')::boolean, false)      AS ranked
         FROM players
         ${whereClause}
         ORDER BY cr DESC
         LIMIT $1 OFFSET $2`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM players ${
          search
            ? `WHERE (
               LOWER(COALESCE(data->>'display_name', '')) LIKE $1
               OR LOWER(COALESCE(data->>'username', ''))   LIKE $1
               OR user_id = $2
             )`
            : ""
        }`,
        search ? [`%${search.toLowerCase()}%`, search.trim()] : []
      ),
    ]);

    return NextResponse.json({
      players: playersResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset,
    });
  } catch (err) {
    console.error("[api/admin/players] GET list failed:", err);
    return NextResponse.json({ error: "Failed to fetch players" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT /api/admin/players — full stat edit or reset
// Body: { userId, action: "edit" | "reset", stats?: { cr, wins, losses, kills, matches, mvp_count, placement_matches } }
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  let body: {
    userId?: string;
    action?: "edit" | "reset";
    stats?: {
      cr?: number;
      wins?: number;
      losses?: number;
      kills?: number;
      matches?: number;
      mvp_count?: number;
      placement_matches?: number;
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userId, action, stats } = body;

  if (!userId?.trim()) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (action !== "edit" && action !== "reset") {
    return NextResponse.json({ error: "action must be 'edit' or 'reset'" }, { status: 400 });
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

    if (action === "reset") {
      // Reset all stats to zero, keep identity fields (name, username, avatar, roles, etc.)
      await pool.query(
        `UPDATE players
         SET data = data
           || '{"cr":0,"wins":0,"losses":0,"kills":0,"matches":0,"mvp_count":0,"placement_matches":0,"ranked":false}'::jsonb
         WHERE user_id = $1`,
        [userId.trim()]
      );
    } else if (action === "edit" && stats) {
      // Build a partial JSONB patch from only the fields that were provided
      const patch: Record<string, unknown> = {};
      const numericFields = ["cr", "wins", "losses", "kills", "matches", "mvp_count", "placement_matches"] as const;
      for (const field of numericFields) {
        if (typeof stats[field] === "number" && !isNaN(stats[field] as number)) {
          patch[field] = stats[field];
        }
      }
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: "No valid stat fields provided" }, { status: 400 });
      }
      await pool.query(
        `UPDATE players
         SET data = data || $1::jsonb
         WHERE user_id = $2`,
        [JSON.stringify(patch), userId.trim()]
      );
    }

    // Return updated player
    const result = await pool.query(
      `SELECT
         user_id,
         COALESCE(data->>'display_name', data->>'username', 'Unknown Player') AS name,
         data->>'username'   AS username,
         data->>'avatar_url' AS avatar_url,
         COALESCE((data->>'cr')::int, 0)      AS cr,
         COALESCE((data->>'wins')::int, 0)     AS wins,
         COALESCE((data->>'losses')::int, 0)   AS losses,
         COALESCE((data->>'kills')::int, 0)    AS kills,
         COALESCE((data->>'matches')::int, 0)  AS matches,
         COALESCE((data->>'mvp_count')::int, 0) AS mvp_count,
         COALESCE((data->>'placement_matches')::int, 0) AS placement_matches,
         COALESCE((data->>'ranked')::boolean, false)      AS ranked,
         COALESCE((data->>'registered')::boolean, false)  AS registered,
         COALESCE((data->>'blacklisted')::boolean, false) AS blacklisted,
         premium_expires_at
       FROM players WHERE user_id = $1 LIMIT 1`,
      [userId.trim()]
    );

    return NextResponse.json({ success: true, player: result.rows[0] });
  } catch (err) {
    console.error("[api/admin/players] PUT failed:", err);
    return NextResponse.json({ error: "Failed to update player" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/players — update player (blacklist toggle, etc.)
// Body: { userId, blacklisted?: boolean }
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  let body: { userId?: string; blacklisted?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userId, blacklisted } = body;

  if (!userId?.trim()) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
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

    if (typeof blacklisted === "boolean") {
      await pool.query(
        `UPDATE players
         SET data = jsonb_set(COALESCE(data, '{}'), '{blacklisted}', $1::text::jsonb)
         WHERE user_id = $2`,
        [blacklisted, userId.trim()]
      );
    }

    // Return updated player
    const result = await pool.query(
      `SELECT
         user_id,
         COALESCE(data->>'display_name', data->>'username', 'Unknown Player') AS name,
         COALESCE((data->>'cr')::int, 0)      AS cr,
         COALESCE((data->>'wins')::int, 0)     AS wins,
         COALESCE((data->>'losses')::int, 0)   AS losses,
         COALESCE((data->>'blacklisted')::boolean, false) AS blacklisted
       FROM players WHERE user_id = $1 LIMIT 1`,
      [userId.trim()]
    );

    return NextResponse.json({ success: true, player: result.rows[0] });
  } catch (err) {
    console.error("[api/admin/players] PATCH failed:", err);
    return NextResponse.json({ error: "Failed to update player" }, { status: 500 });
  }
}
