import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await context.params;

    const result = await pool.query(
      `
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
        COALESCE((data->>'blacklisted')::boolean, false) AS blacklisted,
        COALESCE(data->'history', '[]'::jsonb) AS history,
        COALESCE(data->'notes', '[]'::jsonb) AS notes
      FROM players
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Profile API error:", error);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
