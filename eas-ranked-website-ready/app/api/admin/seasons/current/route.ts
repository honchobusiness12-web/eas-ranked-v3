import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentSeason, getSeasonStats } from "@/lib/seasons";
import { isDeveloper } from "@/lib/premium";

// ---------------------------------------------------------------------------
// GET /api/admin/seasons/current — get active season with stats (owner only)
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
    const season = await getCurrentSeason();
    if (!season) {
      return NextResponse.json({ season: null, stats: null });
    }

    const stats = await getSeasonStats(season.id);
    return NextResponse.json({ season, stats });
  } catch (err) {
    console.error("[api/admin/seasons/current] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch current season" }, { status: 500 });
  }
}
