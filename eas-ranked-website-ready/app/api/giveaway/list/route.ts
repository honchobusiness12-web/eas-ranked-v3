import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllGiveawayCodes } from "@/lib/giveaway";

// ---------------------------------------------------------------------------
// GET /api/giveaway/list
// Requires: owner session
// ---------------------------------------------------------------------------

function isDeveloper(userId: string): boolean {
  return userId === "733871667788644445";
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  try {
    const codes = await getAllGiveawayCodes();
    return NextResponse.json({ codes });
  } catch (err) {
    console.error("[giveaway/list] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
