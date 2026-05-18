import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { getPlayerFromDB, type CachedPlayer } from "@/lib/cache";
import { invalidatePremiumStatusCache } from "@/lib/premium";

export async function POST(req: NextRequest) {
  // ------------------------------------------------------------------
  // 1. Authenticate the request using the shared webhook secret.
  // ------------------------------------------------------------------
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] WEBHOOK_SECRET env var is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const providedSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (providedSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ------------------------------------------------------------------
  // 2. Parse the request body.
  //    Supports optional premium sync fields from the Discord bot:
  //      premium          — boolean: whether user has the premium role
  //      premium_role_synced — boolean: whether role was synced
  //      premium_granted_at  — ISO timestamp of when role was detected
  // ------------------------------------------------------------------
  let body: {
    user_id?: string;
    data?: Partial<CachedPlayer>;
    // Premium sync fields sent by the Discord bot
    premium?: boolean;
    premium_role_synced?: boolean;
    premium_granted_at?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body?.user_id;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid user_id" },
      { status: 400 }
    );
  }

  // ------------------------------------------------------------------
  // 3. If the bot sent premium sync data, write it to the database now.
  //    This is the primary path for Discord role → website premium sync.
  //    We upsert a minimal player record if one doesn't exist yet.
  // ------------------------------------------------------------------
  const hasPremiumPayload =
    body.premium !== undefined ||
    body.premium_role_synced !== undefined ||
    body.premium_granted_at !== undefined;

  if (hasPremiumPayload) {
    const premiumValue = body.premium === true;
    const grantedAt = body.premium_granted_at ?? new Date().toISOString();

    try {
      // Ensure a player record exists (bot may send this before the player logs in)
      await pool.query(
        `INSERT INTO players (user_id, name, data)
         VALUES ($1, $1, '{}'::jsonb)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      // Update the premium fields in data JSONB
      await pool.query(
        `UPDATE players
         SET data = data
           || jsonb_build_object(
                'premium',            $2::boolean,
                'premium_role_synced', $3::boolean,
                'premium_granted_at',  $4::text
              )
         WHERE user_id = $1`,
        [
          userId,
          premiumValue,
          body.premium_role_synced ?? premiumValue,
          grantedAt,
        ]
      );

      console.log(
        `[webhook] Premium sync for user ${userId}: premium=${premiumValue}, ` +
        `role_synced=${body.premium_role_synced ?? premiumValue}, granted_at=${grantedAt}`
      );
    } catch (dbErr) {
      console.error(`[webhook] Failed to write premium data for ${userId}:`, dbErr);
      return NextResponse.json(
        { error: "Failed to update premium status in database" },
        { status: 500 }
      );
    }
  }

  // ------------------------------------------------------------------
  // 4. Fetch the authoritative record from PostgreSQL so we can log it
  //    and return it to the caller.
  // ------------------------------------------------------------------
  const dbPlayer = await getPlayerFromDB(userId);
  if (!dbPlayer) {
    // Player not in DB yet — still return 200 so the bot isn't retried.
    console.warn(`[webhook] Player ${userId} not found in DB after upsert attempt`);
    return NextResponse.json({ ok: true, player: null }, { status: 200 });
  }

  // ------------------------------------------------------------------
  // 5. Invalidate the in-process premium/badge status cache so the next
  //    request reflects any role or subscription changes the bot sent.
  // ------------------------------------------------------------------
  invalidatePremiumStatusCache(userId);

  // ------------------------------------------------------------------
  // 6. Invalidate all cached Next.js pages so they regenerate with fresh
  //    data from PostgreSQL on the next request.
  // ------------------------------------------------------------------
  revalidatePath(`/profile/${userId}`);
  revalidatePath("/leaderboard");
  revalidatePath("/");

  console.log(
    `[webhook] Processed update for player ${userId} (${dbPlayer.name}) — CR: ${dbPlayer.cr}`
  );

  return NextResponse.json({ ok: true, player: dbPlayer }, { status: 200 });
}
