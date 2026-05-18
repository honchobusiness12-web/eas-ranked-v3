import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getSeasonById,
  updateSeason,
  deleteSeason,
  type SeasonStatus,
} from "@/lib/seasons";

// ---------------------------------------------------------------------------
// Owner check
// ---------------------------------------------------------------------------

function isDeveloper(userId: string): boolean {
  return userId === "733871667788644445";
}

const VALID_STATUSES: SeasonStatus[] = ["active", "paused", "ended", "upcoming"];

// ---------------------------------------------------------------------------
// GET /api/admin/seasons/:id — get single season (owner only)
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
    return NextResponse.json({ season });
  } catch (err) {
    console.error("[api/admin/seasons/[id]] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch season" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/seasons/:id — update season (owner only)
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
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

  let body: {
    name?: string;
    description?: string;
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Validate status if provided
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status as SeasonStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate dates if provided
  if (body.start_date && isNaN(Date.parse(body.start_date))) {
    return NextResponse.json({ error: "Invalid start_date" }, { status: 400 });
  }
  if (body.end_date && isNaN(Date.parse(body.end_date))) {
    return NextResponse.json({ error: "Invalid end_date" }, { status: 400 });
  }
  if (body.start_date && body.end_date && new Date(body.start_date) >= new Date(body.end_date)) {
    return NextResponse.json({ error: "start_date must be before end_date" }, { status: 400 });
  }

  try {
    const updates: Parameters<typeof updateSeason>[1] = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description.trim();
    if (body.status !== undefined) updates.status = body.status as SeasonStatus;
    if ("start_date" in body) updates.start_date = body.start_date ?? null;
    if ("end_date" in body) updates.end_date = body.end_date ?? null;

    const season = await updateSeason(id, updates);
    if (!season) {
      return NextResponse.json({ error: "Season not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, season });
  } catch (err) {
    console.error("[api/admin/seasons/[id]] PATCH failed:", err);
    const message = err instanceof Error ? err.message : "Failed to update season";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/seasons/:id — delete season (owner only)
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

  try {
    const deleted = await deleteSeason(id);
    if (!deleted) {
      return NextResponse.json({ error: "Season not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/admin/seasons/[id]] DELETE failed:", err);
    const message = err instanceof Error ? err.message : "Failed to delete season";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
