import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSeasonById, getSeasonStats } from "@/lib/seasons";

// ---------------------------------------------------------------------------
// Owner check
// ---------------------------------------------------------------------------

function isDeveloper(userId: string): boolean {
  return userId === "733871667788644445";
}

// ---------------------------------------------------------------------------
// GET /api/admin/seasons/:id/stats — get season statistics (owner only)
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const season = await getSeasonById(id);
    if (!season) {
      return NextResponse.json({ error: "Season not found" }, { status: 404 });
    }

    const stats = await getSeasonStats(id);
    return NextResponse.json({ season, stats });
  } catch (err) {
    console.error("[api/admin/seasons/[id]/stats] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch season stats" }, { status: 500 });
  }
}
