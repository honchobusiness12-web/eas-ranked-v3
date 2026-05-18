import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        guild_id,
        user_id,
        COALESCE(data->>'display_name', data->>'username', 'Unknown Player') AS name,
        data->>'username' AS username,
        data->>'avatar_url' AS avatar_url,
        COALESCE((data->>'cr')::int, 0) AS cr,
        COALESCE((data->>'wins')::int, 0) AS wins,
        COALESCE((data->>'losses')::int, 0) AS losses,
        COALESCE((data->>'kills')::int, 0) AS kills,
        COALESCE((data->>'matches')::int, 0) AS matches,
        COALESCE((data->>'mvp_count')::int, 0) AS mvp_count,
        COALESCE((data->>'placement_matches')::int, 0) AS placement_matches,
        COALESCE((data->>'ranked')::boolean, false) AS ranked,
        COALESCE((data->>'registered')::boolean, false) AS registered,
        COALESCE((data->>'blacklisted')::boolean, false) AS blacklisted
      FROM players
      WHERE COALESCE((data->>'blacklisted')::boolean, false) = false
      ORDER BY cr DESC
      LIMIT 250
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Leaderboard API error:", error);
    return NextResponse.json({ error: "Failed to load leaderboard" }, { status: 500 });
  }
}
