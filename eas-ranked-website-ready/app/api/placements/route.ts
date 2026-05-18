import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        user_id,
        COALESCE(data->>'display_name', data->>'username', 'Unknown Player') AS name,
        data->>'username' AS username,
        data->>'discord_username' AS discord_username,
        data->>'roblox_username' AS roblox_username,
        data->>'avatar_url' AS avatar_url,
        COALESCE((data->>'cr')::int, 0) AS cr,
        COALESCE((data->>'placement_matches')::int, 0) AS placement_matches
      FROM players
      WHERE
        COALESCE((data->>'blacklisted')::boolean, false) = false
        AND COALESCE((data->>'placement_matches')::int, 0) < 10
      ORDER BY placement_matches DESC
      LIMIT 250
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Placements API error:", error);
    return NextResponse.json({ error: "Failed to load placements" }, { status: 500 });
  }
}
