/**
 * Discord role sync utilities.
 *
 * Checks whether a user has the premium Discord role and updates the
 * subscriptions table accordingly.  Called on every login so that premium
 * access is granted / revoked in real-time without any manual DB work.
 *
 * An in-memory cache (5-minute TTL) prevents redundant Discord API calls when
 * the same user logs in multiple times within a short window.
 */

import { pool } from "@/lib/db";
import { PREMIUM_ROLE_ID, ensurePremiumTables } from "@/lib/premium";

// ---------------------------------------------------------------------------
// Role-check cache (per user, server-side in-process)
// ---------------------------------------------------------------------------

const ROLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface RoleCacheEntry {
  roles: string[] | null;
  expiresAt: number;
}

const roleCheckCache = new Map<string, RoleCacheEntry>();

/** Invalidate the cached roles for a specific user (or all users). */
export function invalidateDiscordSyncCache(userId?: string): void {
  if (userId) {
    roleCheckCache.delete(userId);
  } else {
    roleCheckCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  userId: string;
  hasPremiumRole: boolean;
  previousStatus: string | null;
  newStatus: string | null;
  changed: boolean;
}

// ---------------------------------------------------------------------------
// Fetch the member's roles from Discord using the bot token
// ---------------------------------------------------------------------------

/**
 * Returns the Discord role IDs for a guild member.
 *
 * Results are cached in-process for 5 minutes so that repeated logins within
 * the same server instance don't trigger redundant API calls.
 * Pass `force = true` to bypass the cache.
 */
async function getMemberRoles(userId: string, force = false): Promise<string[] | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    // Bot token / guild ID not configured — skip role check
    return null;
  }

  // Check cache first
  if (!force) {
    const cached = roleCheckCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.roles;
    }
  }

  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (res.status === 404) {
      // User is not in the guild — cache the empty result
      roleCheckCache.set(userId, { roles: [], expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
      return [];
    }

    if (!res.ok) {
      console.warn(`[discord-sync] Failed to fetch member ${userId}: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const roles = Array.isArray(data.roles) ? (data.roles as string[]) : [];

    // Store in cache
    roleCheckCache.set(userId, { roles, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });

    return roles;
  } catch (err) {
    console.error(`[discord-sync] getMemberRoles(${userId}) error:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

/**
 * Checks the user's Discord roles and syncs their premium status in the DB.
 *
 * - If the user has the premium role → upsert subscription_status = "active"
 * - If the user lost the role       → set subscription_status = "canceled"
 *   (only if their current status was "active" and source is "discord_role")
 *
 * Returns a SyncResult describing what happened.
 */
export async function syncPremiumFromDiscord(userId: string): Promise<SyncResult> {
  await ensurePremiumTables();

  // Fetch current subscription row
  let previousStatus: string | null = null;
  let previousSource: string | null = null;
  try {
    const existing = await pool.query(
      `SELECT subscription_status, lemonsqueezy_customer_id FROM subscriptions WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (existing.rows.length > 0) {
      previousStatus = existing.rows[0].subscription_status ?? null;
      // Use lemonsqueezy_customer_id = 'discord_role' as a sentinel to track source
      previousSource = existing.rows[0].lemonsqueezy_customer_id ?? null;
    }
  } catch (err) {
    console.error(`[discord-sync] Failed to read existing subscription for ${userId}:`, err);
  }

  // Fetch Discord roles
  const roles = await getMemberRoles(userId);

  if (roles === null) {
    // Could not reach Discord API — leave DB unchanged
    return {
      userId,
      hasPremiumRole: false,
      previousStatus,
      newStatus: previousStatus,
      changed: false,
    };
  }

  const hasPremiumRole = roles.includes(PREMIUM_ROLE_ID);

  let newStatus = previousStatus;
  let changed = false;

  if (hasPremiumRole) {
    // Grant premium via Discord role
    if (previousStatus !== "active") {
      await pool.query(
        `
        INSERT INTO subscriptions (user_id, lemonsqueezy_customer_id, subscription_status, updated_at)
        VALUES ($1, 'discord_role', 'active', NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          subscription_status = 'active',
          lemonsqueezy_customer_id = CASE
            WHEN subscriptions.lemonsqueezy_customer_id IS NULL
              OR subscriptions.lemonsqueezy_customer_id = 'discord_role'
            THEN 'discord_role'
            ELSE subscriptions.lemonsqueezy_customer_id
          END,
          updated_at = NOW()
        `,
        [userId]
      );
      newStatus = "active";
      changed = true;
    }
  } else {
    // User does not have the premium role.
    // Only revoke if the subscription was granted via Discord role (not Lemonsqueezy).
    if (
      previousStatus === "active" &&
      (previousSource === "discord_role" || previousSource === null)
    ) {
      await pool.query(
        `UPDATE subscriptions SET subscription_status = 'canceled', updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
      newStatus = "canceled";
      changed = true;
    }
  }

  return {
    userId,
    hasPremiumRole,
    previousStatus,
    newStatus,
    changed,
  };
}
