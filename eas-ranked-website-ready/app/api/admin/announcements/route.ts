import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createAnnouncement,
  getAnnouncements,
  updateAnnouncement,
  ANNOUNCEMENT_COLORS,
  type AnnouncementColor,
} from "@/lib/announcements";

// ---------------------------------------------------------------------------
// Developer-only check
// ---------------------------------------------------------------------------

function isDeveloper(userId: string): boolean {
  return userId === "733871667788644445";
}

// ---------------------------------------------------------------------------
// GET /api/admin/announcements — list all announcements (owner only)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 20), 1),
    100
  );

  try {
    const announcements = await getAnnouncements(limit);
    return NextResponse.json({ announcements });
  } catch (err) {
    console.error("[api/admin/announcements] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch announcements" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/announcements — create announcement (owner only)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  let body: {
    title?: string;
    message?: string;
    color?: string;
    sound_enabled?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { title, message, color, sound_enabled } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const validColors = ANNOUNCEMENT_COLORS.map((c) => c.id);
  const resolvedColor: AnnouncementColor = validColors.includes(color as AnnouncementColor)
    ? (color as AnnouncementColor)
    : "blue";

  try {
    const announcement = await createAnnouncement(
      title.trim(),
      message.trim(),
      resolvedColor,
      sound_enabled ?? false,
      session.userId
    );
    return NextResponse.json({ success: true, announcement });
  } catch (err) {
    console.error("[api/admin/announcements] POST failed:", err);
    return NextResponse.json({ error: "Failed to create announcement" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/announcements — update announcement (owner only)
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  let body: {
    id?: string;
    title?: string;
    message?: string;
    color?: string;
    sound_enabled?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id, title, message, color, sound_enabled } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!message?.trim()) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const validColors = ANNOUNCEMENT_COLORS.map((c) => c.id);
  const resolvedColor: AnnouncementColor = validColors.includes(color as AnnouncementColor)
    ? (color as AnnouncementColor)
    : "blue";

  try {
    const updated = await updateAnnouncement(id, title.trim(), message.trim(), resolvedColor, sound_enabled ?? false);
    if (!updated) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, announcement: updated });
  } catch (err) {
    console.error("[api/admin/announcements] PATCH failed:", err);
    return NextResponse.json({ error: "Failed to update announcement" }, { status: 500 });
  }
}
