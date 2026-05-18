import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteAnnouncement } from "@/lib/announcements";

function isDeveloper(userId: string): boolean {
  return userId === "733871667788644445";
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/announcements/:id — delete announcement (developer only)
// ---------------------------------------------------------------------------

export async function DELETE(
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
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const deleted = await deleteAnnouncement(id);
    if (!deleted) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/admin/announcements/[id]] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete announcement" }, { status: 500 });
  }
}
