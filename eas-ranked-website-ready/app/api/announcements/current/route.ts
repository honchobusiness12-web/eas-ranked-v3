import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentAnnouncements } from "@/lib/announcements";

// ---------------------------------------------------------------------------
// GET /api/announcements/current — public endpoint
// Returns non-dismissed announcements. If authenticated, filters by user.
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    const userId = session?.userId;

    const announcements = await getCurrentAnnouncements(userId);
    return NextResponse.json({ announcements });
  } catch (err) {
    console.error("[api/announcements/current] GET failed:", err);
    return NextResponse.json({ announcements: [] });
  }
}
