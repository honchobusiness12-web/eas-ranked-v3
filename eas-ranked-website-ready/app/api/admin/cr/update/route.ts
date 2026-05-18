import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updatePlayerCR, validateCRValue, getPlayerCRInfo } from "@/lib/cr-admin";

// ---------------------------------------------------------------------------
// Owner check helper (mirrors pattern used across other admin routes)
// ---------------------------------------------------------------------------

function isDeveloper(userId: string): boolean {
  return userId === "733871667788644445";
}

// ---------------------------------------------------------------------------
// POST /api/admin/cr/update
// Body: { playerId, newCR, reason }
// Requires: authenticated owner session
// Updates a single player's CR and writes an audit log entry.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. Require authentication
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Require owner
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  // 3. Parse body
  let body: { playerId?: string; newCR?: unknown; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const playerId = (body.playerId ?? "").toString().trim();
  const newCR = Number(body.newCR);
  const reason = (body.reason ?? "").toString().trim();

  // 4. Validate inputs
  if (!playerId) {
    return NextResponse.json({ error: "playerId is required." }, { status: 400 });
  }
  if (isNaN(newCR)) {
    return NextResponse.json({ error: "newCR must be a number." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "reason is required." }, { status: 400 });
  }
  if (reason.length > 500) {
    return NextResponse.json({ error: "reason must be 500 characters or fewer." }, { status: 400 });
  }

  const crValidation = validateCRValue(newCR);
  if (!crValidation.valid) {
    return NextResponse.json({ error: crValidation.error }, { status: 400 });
  }

  // 5. Confirm player exists before attempting update
  const player = await getPlayerCRInfo(playerId);
  if (!player) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  // 6. Perform the update (single player, with audit log)
  const result = await updatePlayerCR(playerId, newCR, session.userId, reason);

  if (result.success === false) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    playerId,
    playerName: player.name,
    oldCR: result.oldCR,
    newCR,
    editedBy: session.userId,
    reason,
  });
}
