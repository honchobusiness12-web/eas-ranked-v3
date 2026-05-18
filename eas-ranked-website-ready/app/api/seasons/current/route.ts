import { NextResponse } from "next/server";
import { getCurrentSeason } from "@/lib/seasons";

// ---------------------------------------------------------------------------
// GET /api/seasons/current — public endpoint to get the active season
// Returns only safe fields (no admin-only data)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const season = await getCurrentSeason();
    if (!season) {
      return NextResponse.json({ season: null });
    }

    // Return only public-safe fields
    return NextResponse.json({
      season: {
        id: season.id,
        name: season.name,
        description: season.description,
        status: season.status,
        start_date: season.start_date,
        end_date: season.end_date,
      },
    });
  } catch (err) {
    console.error("[api/seasons/current] GET failed:", err);
    return NextResponse.json({ season: null });
  }
}
