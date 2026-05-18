import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCodeRedemptions } from "@/lib/giveaway";

// ---------------------------------------------------------------------------
// GET /api/giveaway/redemptions?code=EAS-1WEEK
// Requires: owner session
// ---------------------------------------------------------------------------

function isDeveloper(userId: string): boolean {
  return userId === "733871667788644445";
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "code query parameter is required." }, { status: 400 });
  }

  try {
    const redemptions = await getCodeRedemptions(code);
    return NextResponse.json({ redemptions });
  } catch (err) {
    console.error("[giveaway/redemptions] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
