/**
 * Batch role sync.
 *
 * Fetches all Discord guild members that hold the Content Creator, Staff, or
 * Premium role and upserts their premium / badge status into the database in
 * parallel.  Designed to run on server startup (via middleware) and on demand
 * via the admin sync-roles API route.
 *
 * A simple in-process lock + 5-minute cooldown prevents concurrent or
 * back-to-back runs from hammering the Discord API.
 */

import { pool } from "@/lib/db";
import {
  PREMIUM_ROLE_ID,
  STAFF_ROLE_IDS,
  CONTENT_CREATOR_ROLE_IDS,
  ensurePremiumTables,
} from "@/lib/premium";
import { fetchAllUsersWithRole, invalidateRoleCache } from "@/lib/discord-roles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BatchSyncResult {
  premiumUpdated: number;
  staffUpdated: number;
  contentCreatorUpdated: number;
  totalUpdated: number;
  durationMs: number;
  cachedRun: boolean;
}

// ---------------------------------------------------------------------------
// Cooldown / lock
// ---------------------------------------------------------------------------

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

let lastRunAt = 0;
let running = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Upsert a premium subscription row for a Discord-role-granted user.
 * Only sets status to "active" — never downgrades an existing Lemonsqueezy sub.
 */
async function grantPremiumRole(userId: string): Promise<void> {
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
}

/**
 * Upsert a badge role into the player's data->roles JSON array.
 * Creates a minimal player row if one doesn't exist yet.
 */
async function grantBadgeRole(userId: string, roleId: string): Promise<void> {
  await pool.query(
    `
    INSERT INTO players (user_id, data)
    VALUES ($1, jsonb_build_object('roles', jsonb_build_array($2::text)))
    ON CONFLICT (user_id) DO UPDATE SET
      data = jsonb_set(
        COALESCE(players.data, '{}'),
        '{roles}',
        (
          SELECT jsonb_agg(DISTINCT r)
          FROM jsonb_array_elements_text(
            COALESCE(players.data->'roles', '[]'::jsonb) || jsonb_build_array($2::text)
          ) AS r
        )
      )
    `,
    [userId, roleId]
  );
}

// ---------------------------------------------------------------------------
// Main batch sync
// ---------------------------------------------------------------------------

/**
 * Syncs all users with Content Creator, Staff, and Premium Discord roles into
 * the database.  Runs at most once every 5 minutes (cooldown).
 *
 * Pass `force = true` to bypass the cooldown and the Discord role cache.
 */
export async function batchSyncAllRoles(force = false): Promise<BatchSyncResult> {
  const now = Date.now();

  // Cooldown guard
  if (!force && now - lastRunAt < COOLDOWN_MS) {
    return {
      premiumUpdated: 0,
      staffUpdated: 0,
      contentCreatorUpdated: 0,
      totalUpdated: 0,
      durationMs: 0,
      cachedRun: true,
    };
  }

  // Concurrency guard
  if (running) {
    return {
      premiumUpdated: 0,
      staffUpdated: 0,
      contentCreatorUpdated: 0,
      totalUpdated: 0,
      durationMs: 0,
      cachedRun: true,
    };
  }

  running = true;
  const startMs = Date.now();

  try {
    await ensurePremiumTables();

    if (force) {
      // Bust the Discord role cache so we get fresh data
      invalidateRoleCache();
    }

    // Fetch all role member lists in parallel
    const [premiumMembers, staffMembers, contentCreatorMembers] = await Promise.all([
      fetchAllUsersWithRole(PREMIUM_ROLE_ID, force),
      // Use the first Staff role ID as the primary one; extend as needed
      fetchAllUsersWithRole(STAFF_ROLE_IDS[0], force),
      fetchAllUsersWithRole(CONTENT_CREATOR_ROLE_IDS[0], force),
    ]);

    // Batch-upsert premium subscriptions
    let premiumUpdated = 0;
    if (premiumMembers.length > 0) {
      await Promise.all(
        premiumMembers.map(async (m) => {
          try {
            await grantPremiumRole(m.userId);
            premiumUpdated++;
          } catch (err) {
            console.error(`[batch-sync] grantPremiumRole(${m.userId}) failed:`, err);
          }
        })
      );
    }

    // Batch-upsert staff badge roles
    let staffUpdated = 0;
    if (staffMembers.length > 0) {
      await Promise.all(
        staffMembers.map(async (m) => {
          try {
            await grantBadgeRole(m.userId, STAFF_ROLE_IDS[0]);
            staffUpdated++;
          } catch (err) {
            console.error(`[batch-sync] grantBadgeRole staff(${m.userId}) failed:`, err);
          }
        })
      );
    }

    // Batch-upsert content creator badge roles
    let contentCreatorUpdated = 0;
    if (contentCreatorMembers.length > 0) {
      await Promise.all(
        contentCreatorMembers.map(async (m) => {
          try {
            await grantBadgeRole(m.userId, CONTENT_CREATOR_ROLE_IDS[0]);
            contentCreatorUpdated++;
          } catch (err) {
            console.error(`[batch-sync] grantBadgeRole cc(${m.userId}) failed:`, err);
          }
        })
      );
    }

    lastRunAt = Date.now();

    const result: BatchSyncResult = {
      premiumUpdated,
      staffUpdated,
      contentCreatorUpdated,
      totalUpdated: premiumUpdated + staffUpdated + contentCreatorUpdated,
      durationMs: Date.now() - startMs,
      cachedRun: false,
    };

    console.log(
      `[batch-sync] Done in ${result.durationMs}ms — ` +
        `premium=${premiumUpdated}, staff=${staffUpdated}, cc=${contentCreatorUpdated}`
    );

    return result;
  } catch (err) {
    console.error("[batch-sync] batchSyncAllRoles failed:", err);
    return {
      premiumUpdated: 0,
      staffUpdated: 0,
      contentCreatorUpdated: 0,
      totalUpdated: 0,
      durationMs: Date.now() - startMs,
      cachedRun: false,
    };
  } finally {
    running = false;
  }
}

/**
 * Fire-and-forget wrapper — starts the batch sync in the background without
 * blocking the caller.  Errors are swallowed (already logged inside).
 */
export function triggerBatchSync(force = false): void {
  batchSyncAllRoles(force).catch(() => {
    // Already logged inside batchSyncAllRoles
  });
}
