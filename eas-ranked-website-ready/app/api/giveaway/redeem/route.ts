import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { redeemCode } from "@/lib/giveaway";

// ---------------------------------------------------------------------------
// POST /api/giveaway/redeem
// Body: { code: string }
// Requires: authenticated session
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. Require authentication
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "You must be logged in to redeem a code." }, { status: 401 });
  }

  // 2. Parse body
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "A code is required." }, { status: 400 });
  }

  // 3. Attempt redemption
  try {
    const result = await redeemCode(code, session.userId);

    if (!result.success) {
      const failureResult = result as { success: false; error: string };
      const messages: Record<string, string> = {
        invalid_code:     "Invalid code. Please check and try again.",
        code_expired:     "This code has expired.",
        max_uses_reached: "This code has reached its maximum number of uses.",
        already_redeemed: "You have already redeemed this code.",
        code_inactive:    "This code is no longer active.",
      };
      return NextResponse.json(
        { error: messages[failureResult.error] ?? "Failed to redeem code." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      premium_expires_at: result.premium_expires_at,
    });
  } catch (err) {
    console.error("[giveaway/redeem] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
