import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dismissAnnouncement } from "@/lib/announcements";

// ---------------------------------------------------------------------------
// POST /api/announcements/:id/dismiss — dismiss for authenticated user
// ---------------------------------------------------------------------------

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await dismissAnnouncement(id, session.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/announcements/[id]/dismiss] POST failed:", err);
    return NextResponse.json({ error: "Failed to dismiss announcement" }, { status: 500 });
  }
}
