import { pool } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PremiumCode {
  id: string;
  code: string;
  duration_days: number;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
}

export interface CodeRedemption {
  id: string;
  code_id: string;
  user_id: string;
  redeemed_at: string;
  premium_expires_at: string;
}

export interface PremiumCodeWithRedemptions extends PremiumCode {
  redemption_count: number;
}

export type RedeemResult =
  | { success: true; premium_expires_at: string }
  | { success: false; error: "invalid_code" | "code_expired" | "max_uses_reached" | "already_redeemed" | "code_inactive" };

// ---------------------------------------------------------------------------
// Ensure tables exist (idempotent)
// ---------------------------------------------------------------------------

async function ensureGiveawayTables(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS premium_codes (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        code          VARCHAR(64) NOT NULL UNIQUE,
        duration_days INT         NOT NULL,
        max_uses      INT         NOT NULL DEFAULT 1,
        uses          INT         NOT NULL DEFAULT 0,
        expires_at    TIMESTAMP,
        active        BOOLEAN     NOT NULL DEFAULT TRUE,
        created_by    VARCHAR(32) NOT NULL,
        created_at    TIMESTAMP   NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS premium_code_redemptions (
        id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        code_id            UUID        NOT NULL REFERENCES premium_codes(id) ON DELETE CASCADE,
        user_id            VARCHAR(32) NOT NULL,
        redeemed_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
        premium_expires_at TIMESTAMP   NOT NULL,
        UNIQUE (code_id, user_id)
      )
    `);

    // Ensure players table has giveaway columns
    await pool.query(`
      ALTER TABLE players
        ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS premium_source      VARCHAR(32)
    `);
  } catch (err) {
    console.error("[giveaway] ensureGiveawayTables failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Create a giveaway code (owner only — caller must verify ownership)
// ---------------------------------------------------------------------------

export async function createGiveawayCode(
  code: string,
  durationDays: number,
  maxUses: number,
  expiresAt: Date | null,
  createdBy: string
): Promise<PremiumCode> {
  await ensureGiveawayTables();

  const result = await pool.query<PremiumCode>(
    `
    INSERT INTO premium_codes (code, duration_days, max_uses, expires_at, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [code.toUpperCase().trim(), durationDays, maxUses, expiresAt ?? null, createdBy]
  );

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Redeem a code for a user
// ---------------------------------------------------------------------------

export async function redeemCode(code: string, userId: string): Promise<RedeemResult> {
  await ensureGiveawayTables();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the code row for update to prevent race conditions
    const codeResult = await client.query<PremiumCode>(
      `SELECT * FROM premium_codes WHERE code = $1 FOR UPDATE`,
      [code.toUpperCase().trim()]
    );

    if (codeResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { success: false, error: "invalid_code" };
    }

    const premiumCode = codeResult.rows[0];

    if (!premiumCode.active) {
      await client.query("ROLLBACK");
      return { success: false, error: "code_inactive" };
    }

    if (premiumCode.expires_at && new Date(premiumCode.expires_at) < new Date()) {
      await client.query("ROLLBACK");
      return { success: false, error: "code_expired" };
    }

    if (premiumCode.uses >= premiumCode.max_uses) {
      await client.query("ROLLBACK");
      return { success: false, error: "max_uses_reached" };
    }

    // Check if user already redeemed this code
    const existingRedemption = await client.query(
      `SELECT id FROM premium_code_redemptions WHERE code_id = $1 AND user_id = $2`,
      [premiumCode.id, userId]
    );

    if (existingRedemption.rows.length > 0) {
      await client.query("ROLLBACK");
      return { success: false, error: "already_redeemed" };
    }

    // Calculate premium expiry — extend existing premium if already active
    const now = new Date();
    const existingPremium = await client.query(
      `SELECT premium_expires_at FROM players WHERE user_id = $1`,
      [userId]
    );

    let baseDate = now;
    if (
      existingPremium.rows.length > 0 &&
      existingPremium.rows[0].premium_expires_at &&
      new Date(existingPremium.rows[0].premium_expires_at) > now
    ) {
      // Stack on top of existing giveaway premium
      baseDate = new Date(existingPremium.rows[0].premium_expires_at);
    }

    const premiumExpiresAt = new Date(baseDate);
    premiumExpiresAt.setDate(premiumExpiresAt.getDate() + premiumCode.duration_days);

    // Record the redemption
    await client.query(
      `
      INSERT INTO premium_code_redemptions (code_id, user_id, premium_expires_at)
      VALUES ($1, $2, $3)
      `,
      [premiumCode.id, userId, premiumExpiresAt]
    );

    // Increment use count
    await client.query(
      `UPDATE premium_codes SET uses = uses + 1 WHERE id = $1`,
      [premiumCode.id]
    );

    // Update player premium status
    await client.query(
      `
      UPDATE players
      SET premium_expires_at = $1,
          premium_source      = 'giveaway_code'
      WHERE user_id = $2
      `,
      [premiumExpiresAt, userId]
    );

    await client.query("COMMIT");

    return { success: true, premium_expires_at: premiumExpiresAt.toISOString() };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[giveaway] redeemCode(${code}, ${userId}) failed:`, err);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Get a single code by name
// ---------------------------------------------------------------------------

export async function getGiveawayCode(code: string): Promise<PremiumCode | null> {
  await ensureGiveawayTables();

  const result = await pool.query<PremiumCode>(
    `SELECT * FROM premium_codes WHERE code = $1`,
    [code.toUpperCase().trim()]
  );

  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// List all codes (with redemption counts)
// ---------------------------------------------------------------------------

export async function getAllGiveawayCodes(): Promise<PremiumCodeWithRedemptions[]> {
  await ensureGiveawayTables();

  const result = await pool.query<PremiumCodeWithRedemptions>(`
    SELECT
      pc.*,
      COUNT(pcr.id)::int AS redemption_count
    FROM premium_codes pc
    LEFT JOIN premium_code_redemptions pcr ON pcr.code_id = pc.id
    GROUP BY pc.id
    ORDER BY pc.created_at DESC
  `);

  return result.rows;
}

// ---------------------------------------------------------------------------
// Disable a code
// ---------------------------------------------------------------------------

export async function disableCode(code: string): Promise<boolean> {
  await ensureGiveawayTables();

  const result = await pool.query(
    `UPDATE premium_codes SET active = FALSE WHERE code = $1`,
    [code.toUpperCase().trim()]
  );

  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Get redemptions for a specific code
// ---------------------------------------------------------------------------

export async function getCodeRedemptions(code: string): Promise<CodeRedemption[]> {
  await ensureGiveawayTables();

  const result = await pool.query<CodeRedemption>(
    `
    SELECT pcr.*
    FROM premium_code_redemptions pcr
    JOIN premium_codes pc ON pc.id = pcr.code_id
    WHERE pc.code = $1
    ORDER BY pcr.redeemed_at DESC
    `,
    [code.toUpperCase().trim()]
  );

  return result.rows;
}

// ---------------------------------------------------------------------------
// Check if a code is currently valid (active, not expired, has uses left)
// ---------------------------------------------------------------------------

export async function isCodeValid(code: string): Promise<boolean> {
  await ensureGiveawayTables();

  const result = await pool.query(
    `
    SELECT 1
    FROM premium_codes
    WHERE code    = $1
      AND active  = TRUE
      AND uses    < max_uses
      AND (expires_at IS NULL OR expires_at > NOW())
    `,
    [code.toUpperCase().trim()]
  );

  return result.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Check if a user has active premium from any source
// ---------------------------------------------------------------------------

export async function checkPremiumStatus(userId: string): Promise<{
  hasPremium: boolean;
  source: string | null;
  expiresAt: string | null;
}> {
  await ensureGiveawayTables();

  const result = await pool.query(
    `
    SELECT premium_expires_at, premium_source
    FROM players
    WHERE user_id = $1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return { hasPremium: false, source: null, expiresAt: null };
  }

  const { premium_expires_at, premium_source } = result.rows[0];

  if (!premium_expires_at) {
    return { hasPremium: false, source: null, expiresAt: null };
  }

  const isActive = new Date(premium_expires_at) > new Date();
  return {
    hasPremium: isActive,
    source: isActive ? premium_source : null,
    expiresAt: isActive ? premium_expires_at : null,
  };
}

// ---------------------------------------------------------------------------
// Auto-expire giveaway premium for users whose premium_expires_at has passed
// Only removes giveaway_code premium — Discord role premium is managed separately
// ---------------------------------------------------------------------------

export async function expireGiveawayPremium(): Promise<number> {
  await ensureGiveawayTables();

  const result = await pool.query(`
    UPDATE players
    SET premium_expires_at = NULL,
        premium_source      = NULL
    WHERE premium_source      = 'giveaway_code'
      AND premium_expires_at IS NOT NULL
      AND premium_expires_at  < NOW()
  `);

  const expired = result.rowCount ?? 0;
  if (expired > 0) {
    console.log(`[giveaway] Expired giveaway premium for ${expired} user(s)`);
  }

  return expired;
}
