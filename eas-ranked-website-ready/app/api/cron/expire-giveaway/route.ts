import { NextRequest, NextResponse } from "next/server";
import { expireGiveawayPremium } from "@/lib/giveaway";

// ---------------------------------------------------------------------------
// GET /api/cron/expire-giveaway
// Called daily by a cron job (e.g. Railway cron, Vercel cron, or external).
// Authenticates via CRON_SECRET header to prevent unauthorized calls.
//
// Set up a daily cron that calls:
//   GET https://your-domain.com/api/cron/expire-giveaway
//   Authorization: Bearer <CRON_SECRET>
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // If CRON_SECRET is configured, enforce it
  if (secret) {
    const authHeader = req.headers.get("authorization") ?? "";
    const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  try {
    const expired = await expireGiveawayPremium();
    console.log(`[cron/expire-giveaway] Expired ${expired} giveaway premium user(s)`);
    return NextResponse.json({
      ok: true,
      expired,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron/expire-giveaway] Failed:", err);
    return NextResponse.json({ error: "Expiration job failed." }, { status: 500 });
  }
}
