import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const result = await pool.query(
      `
      SELECT
        user_id,
        COALESCE(data->>'display_name', data->>'username', 'Unknown Player') AS name,
        data->>'username' AS username,
        data->>'avatar_url' AS avatar_url,
        COALESCE((data->>'cr')::int, 0) AS cr,
        COALESCE((data->>'wins')::int, 0) AS wins,
        COALESCE((data->>'losses')::int, 0) AS losses,
        COALESCE((data->>'ranked')::boolean, false) AS ranked
      FROM players
      WHERE
        COALESCE((data->>'blacklisted')::boolean, false) = false
        AND (
          LOWER(COALESCE(data->>'display_name', '')) LIKE $1
          OR LOWER(COALESCE(data->>'username', '')) LIKE $1
        )
      ORDER BY cr DESC
      LIMIT 10
      `,
      [`%${q.toLowerCase()}%`]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Player search API error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
