import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DEVELOPER_USER_ID } from "@/lib/premium";
import { pool } from "@/lib/db";

function isDeveloper(userId: string): boolean {
  return userId === DEVELOPER_USER_ID;
}

// ---------------------------------------------------------------------------
// GET /api/admin/analytics — aggregate stats for the analytics dashboard
// ---------------------------------------------------------------------------

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  try {
    const [
      totalsResult,
      crDistResult,
      topPlayersResult,
      recentCREditsResult,
    ] = await Promise.all([
      // Overall totals
      pool.query(`
        SELECT
          COUNT(*)                                                          AS total_players,
          COUNT(*) FILTER (WHERE COALESCE((data->>'ranked')::boolean, false))     AS ranked_players,
          COUNT(*) FILTER (WHERE COALESCE((data->>'blacklisted')::boolean, false)) AS blacklisted_players,
          COALESCE(AVG((data->>'cr')::int), 0)::int                        AS avg_cr,
          COALESCE(SUM((data->>'matches')::int), 0)::int                   AS total_matches,
          COALESCE(SUM((data->>'wins')::int), 0)::int                      AS total_wins,
          COALESCE(SUM((data->>'losses')::int), 0)::int                    AS total_losses,
          COALESCE(MAX((data->>'cr')::int), 0)                             AS max_cr,
          COALESCE(MIN((data->>'cr')::int), 0)                             AS min_cr
        FROM players
      `),

      // CR distribution buckets (0-499, 500-999, 1000-1499, 1500-1999, 2000+)
      pool.query(`
        SELECT
          CASE
            WHEN COALESCE((data->>'cr')::int, 0) < 500  THEN '0–499'
            WHEN COALESCE((data->>'cr')::int, 0) < 1000 THEN '500–999'
            WHEN COALESCE((data->>'cr')::int, 0) < 1500 THEN '1000–1499'
            WHEN COALESCE((data->>'cr')::int, 0) < 2000 THEN '1500–1999'
            ELSE '2000+'
          END AS bucket,
          COUNT(*) AS count
        FROM players
        GROUP BY bucket
        ORDER BY MIN(COALESCE((data->>'cr')::int, 0))
      `),

      // Top 10 most active players by matches
      pool.query(`
        SELECT
          user_id,
          COALESCE(data->>'display_name', data->>'username', 'Unknown') AS name,
          COALESCE((data->>'cr')::int, 0)     AS cr,
          COALESCE((data->>'matches')::int, 0) AS matches,
          COALESCE((data->>'wins')::int, 0)    AS wins,
          COALESCE((data->>'losses')::int, 0)  AS losses
        FROM players
        WHERE COALESCE((data->>'matches')::int, 0) > 0
        ORDER BY matches DESC
        LIMIT 10
      `),

      // Recent CR edits (last 10)
      pool.query(`
        SELECT
          cal.player_id,
          COALESCE(p.data->>'display_name', p.data->>'username', cal.player_id) AS player_name,
          cal.old_cr,
          cal.new_cr,
          cal.edited_by,
          cal.edited_at,
          cal.reason
        FROM cr_audit_logs cal
        LEFT JOIN players p ON p.user_id = cal.player_id
        ORDER BY cal.edited_at DESC
        LIMIT 10
      `).catch(() => ({ rows: [] })), // graceful if table doesn't exist yet
    ]);

    const totals = totalsResult.rows[0];

    return NextResponse.json({
      totals: {
        totalPlayers:       parseInt(totals.total_players, 10),
        rankedPlayers:      parseInt(totals.ranked_players, 10),
        blacklistedPlayers: parseInt(totals.blacklisted_players, 10),
        avgCR:              parseInt(totals.avg_cr, 10),
        totalMatches:       parseInt(totals.total_matches, 10),
        totalWins:          parseInt(totals.total_wins, 10),
        totalLosses:        parseInt(totals.total_losses, 10),
        maxCR:              parseInt(totals.max_cr, 10),
        minCR:              parseInt(totals.min_cr, 10),
      },
      crDistribution: crDistResult.rows.map((r) => ({
        bucket: r.bucket,
        count:  parseInt(r.count, 10),
      })),
      topActivePlayers: topPlayersResult.rows,
      recentCREdits:    recentCREditsResult.rows,
    });
  } catch (err) {
    console.error("[api/admin/analytics] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
