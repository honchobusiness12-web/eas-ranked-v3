import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DEVELOPER_USER_ID } from "@/lib/premium";
import { pool } from "@/lib/db";
import { updatePlayerCR, validateCRValue } from "@/lib/cr-admin";

function isDeveloper(userId: string): boolean {
  return userId === DEVELOPER_USER_ID;
}

// ---------------------------------------------------------------------------
// GET /api/admin/leaderboard?limit=100&offset=0&sort=cr
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  const limit  = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 100), 1), 250);
  const offset = Math.max(Number(req.nextUrl.searchParams.get("offset") ?? 0), 0);
  const sort   = req.nextUrl.searchParams.get("sort") ?? "cr";

  const SORT_MAP: Record<string, string> = {
    cr:      "cr DESC",
    wins:    "wins DESC",
    losses:  "losses DESC",
    matches: "matches DESC",
    name:    "name ASC",
  };
  const orderBy = SORT_MAP[sort] ?? "cr DESC";

  try {
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
           COALESCE((data->>'kills')::int, 0)    AS kills,
           COALESCE((data->>'matches')::int, 0)  AS matches,
           COALESCE((data->>'mvp_count')::int, 0) AS mvp_count,
           COALESCE((data->>'blacklisted')::boolean, false) AS blacklisted,
           COALESCE((data->>'ranked')::boolean, false)      AS ranked
         FROM players
         ORDER BY ${orderBy}
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(`SELECT COUNT(*) AS count FROM players`),
    ]);

    return NextResponse.json({
      players: playersResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset,
    });
  } catch (err) {
    console.error("[api/admin/leaderboard] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/leaderboard — quick CR edit
// Body: { userId, newCR, reason }
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  let body: { userId?: string; newCR?: unknown; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const userId = (body.userId ?? "").toString().trim();
  const newCR  = Number(body.newCR);
  const reason = (body.reason ?? "Admin leaderboard edit").toString().trim();

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (isNaN(newCR)) {
    return NextResponse.json({ error: "newCR must be a number" }, { status: 400 });
  }

  const validation = validateCRValue(newCR);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const result = await updatePlayerCR(userId, newCR, session.userId, reason);
  if (!result.success) {
    const failureResult = result as { success: false; error: string };
    return NextResponse.json({ error: failureResult.error }, { status: failureResult.error === "Player not found." ? 404 : 500 });
  }

  return NextResponse.json({ success: true, userId, oldCR: result.oldCR, newCR });
}
