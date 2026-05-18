import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getAllSeasons,
  createSeason,
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
// GET /api/admin/seasons — list all seasons (owner only)
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
    Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 50), 1),
    200
  );

  try {
    const seasons = await getAllSeasons(limit);
    return NextResponse.json({ seasons });
  } catch (err) {
    console.error("[api/admin/seasons] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch seasons" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/seasons — create new season (owner only)
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

  const { name, description, status, start_date, end_date } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const resolvedStatus: SeasonStatus = VALID_STATUSES.includes(status as SeasonStatus)
    ? (status as SeasonStatus)
    : "upcoming";

  // Validate dates if provided
  if (start_date && isNaN(Date.parse(start_date))) {
    return NextResponse.json({ error: "Invalid start_date" }, { status: 400 });
  }
  if (end_date && isNaN(Date.parse(end_date))) {
    return NextResponse.json({ error: "Invalid end_date" }, { status: 400 });
  }
  if (start_date && end_date && new Date(start_date) >= new Date(end_date)) {
    return NextResponse.json({ error: "start_date must be before end_date" }, { status: 400 });
  }

  try {
    const season = await createSeason(
      name.trim(),
      (description ?? "").trim(),
      resolvedStatus,
      start_date ?? null,
      end_date ?? null,
      session.userId
    );
    return NextResponse.json({ success: true, season }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/seasons] POST failed:", err);
    return NextResponse.json({ error: "Failed to create season" }, { status: 500 });
  }
}
