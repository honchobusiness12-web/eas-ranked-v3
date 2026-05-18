import { NextRequest, NextResponse } from "next/server";
import { checkPremiumStatus } from "@/lib/giveaway";

// ---------------------------------------------------------------------------
// GET /api/giveaway/status?userId=<discordId>
// Returns the giveaway premium status for a user.
// Public endpoint — used by the redeem page to show current status.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  try {
    const status = await checkPremiumStatus(userId);
    return NextResponse.json(status);
  } catch (err) {
    console.error("[giveaway/status] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
