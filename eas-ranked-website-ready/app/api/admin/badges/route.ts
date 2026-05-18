import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  DEVELOPER_USER_ID,
  PREMIUM_ROLE_ID,
  STAFF_ROLE_IDS,
  CONTENT_CREATOR_ROLE_IDS,
  getUserBadges,
  assignBadgeRole,
  removeBadgeRole,
} from "@/lib/premium";
import { fetchAllUsersWithRole } from "@/lib/discord-roles";
import { pool } from "@/lib/db";

// ---------------------------------------------------------------------------
// Discord API helpers
// ---------------------------------------------------------------------------

interface RawDiscordMember {
  user: { id: string; username: string; global_name?: string | null; avatar?: string | null };
  nick?: string | null;
  roles: string[];
}

/**
 * Search Discord guild members by username prefix using the Discord bot token.
 * Uses GET /guilds/{guild}/members/search?query=xxx&limit=10
 * Returns up to `limit` members whose username or nickname matches the query.
 */
async function searchDiscordMembers(
  query: string,
  limit = 10
): Promise<Array<{ userId: string; name: string }>> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId  = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId) return [];

  try {
    const url = new URL(`https://discord.com/api/v10/guilds/${guildId}/members/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[api/admin/badges] Discord member search failed: HTTP ${res.status}`);
      return [];
    }

    const members: RawDiscordMember[] = await res.json();
    return members.map((m) => ({
      userId: m.user.id,
      name: m.nick ?? m.user.global_name ?? m.user.username,
    }));
  } catch (err) {
    console.error("[api/admin/badges] searchDiscordMembers error:", err);
    return [];
  }
}

/**
 * Fetch a single Discord guild member by their user ID.
 * Returns null if the member is not in the guild or the request fails.
 */
async function fetchDiscordMember(
  userId: string
): Promise<{ userId: string; name: string } | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId  = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId) return null;

  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
      {
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
        cache: "no-store",
      }
    );

    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`[api/admin/badges] Discord fetch member ${userId} failed: HTTP ${res.status}`);
      return null;
    }

    const member: RawDiscordMember = await res.json();
    return {
      userId: member.user.id,
      name: member.nick ?? member.user.global_name ?? member.user.username,
    };
  } catch (err) {
    console.error(`[api/admin/badges] fetchDiscordMember(${userId}) error:`, err);
    return null;
  }
}

/**
 * Ensure a minimal player record exists for the given Discord user ID.
 * If the player is already in the database, this is a no-op.
 * If not, a stub record is inserted so that badge data can be persisted.
 */
async function ensurePlayerExists(userId: string, name: string): Promise<void> {
  await pool.query(
    `
    INSERT INTO players (user_id, name, data)
    VALUES ($1, $2, '{}'::jsonb)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId, name]
  );
}

// ---------------------------------------------------------------------------
// Developer-only check
// ---------------------------------------------------------------------------

function isDeveloper(userId: string): boolean {
  return userId === DEVELOPER_USER_ID;
}

// Valid badge IDs — assignBadgeRole/removeBadgeRole now store these directly
// in data->'badges', independent of Discord role IDs.
const VALID_BADGE_IDS = new Set(["staff", "contentCreator", "tournamentWinner"]);

// ---------------------------------------------------------------------------
// GET /api/admin/badges
//   ?userId=xxx        — get badges for a single user
//   ?search=xxx        — search by name or Discord ID (17-19 digit snowflake)
//   ?batchIds=id1,id2  — get badges for multiple users in one request
//   ?role=xxx          — list Discord guild members with a given role
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  const userId   = req.nextUrl.searchParams.get("userId");
  const search   = req.nextUrl.searchParams.get("search");
  const role     = req.nextUrl.searchParams.get("role");
  const force    = req.nextUrl.searchParams.get("force") === "true";
  const batchIds = req.nextUrl.searchParams.get("batchIds");

  // ------------------------------------------------------------------
  // Batch badge lookup — returns badges for multiple users in one shot
  // ------------------------------------------------------------------
  if (batchIds) {
    try {
      const ids = batchIds
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 50);
      const badgeResults = await Promise.all(
        ids.map(async (id) => {
          const badges = await getUserBadges(id);
          return { userId: id, badges };
        })
      );
      return NextResponse.json({ results: badgeResults });
    } catch (err) {
      console.error("[api/admin/badges] GET batchIds failed:", err);
      return NextResponse.json({ error: "Failed to fetch batch badges" }, { status: 500 });
    }
  }

  // ------------------------------------------------------------------
  // Single user badge lookup
  // ------------------------------------------------------------------
  if (userId) {
    try {
      const [badges, dbResult] = await Promise.all([
        getUserBadges(userId),
        pool.query(
          `SELECT user_id, name, data->'roles' AS roles FROM players WHERE user_id = $1 LIMIT 1`,
          [userId]
        ),
      ]);
      const player = dbResult.rows[0] ?? null;
      return NextResponse.json({
        userId,
        name: player?.name ?? null,
        badges,
        roles: player?.roles ?? [],
      });
    } catch (err) {
      console.error("[api/admin/badges] GET single user failed:", err);
      return NextResponse.json({ error: "Failed to fetch badges" }, { status: 500 });
    }
  }

  // ------------------------------------------------------------------
  // Search players by name or Discord ID
  // Searches the DB first; if fewer than 10 results are found, also
  // queries Discord guild members and merges in any that aren't already
  // in the database.
  // ------------------------------------------------------------------
  if (search) {
    try {
      const trimmed = search.trim();
      // Detect if the query looks like a Discord snowflake ID (17-19 digit number)
      const isIdSearch = /^\d{17,19}$/.test(trimmed);

      // --- Step 1: query the database ---
      const dbResult = isIdSearch
        ? await pool.query(
            `SELECT user_id, name, data->'roles' AS roles
             FROM players
             WHERE user_id = $1
             LIMIT 10`,
            [trimmed]
          )
        : await pool.query(
            `SELECT user_id, name, data->'roles' AS roles
             FROM players
             WHERE name ILIKE $1
                OR COALESCE(data->>'display_name', '') ILIKE $1
                OR COALESCE(data->>'username', '') ILIKE $1
             ORDER BY name ASC
             LIMIT 10`,
            [`%${trimmed}%`]
          );

      const dbPlayers: Array<{ user_id: string; name: string; roles: string[] }> =
        dbResult.rows;
      const dbIds = new Set(dbPlayers.map((p) => p.user_id));

      // --- Step 2: supplement with Discord members if we have room ---
      const combined = [...dbPlayers];

      if (combined.length < 10) {
        const remaining = 10 - combined.length;

        if (isIdSearch) {
          // For an ID search, try to fetch the specific member from Discord
          // if they weren't found in the database.
          if (!dbIds.has(trimmed)) {
            const discordMember = await fetchDiscordMember(trimmed);
            if (discordMember) {
              combined.push({
                user_id: discordMember.userId,
                name: discordMember.name,
                roles: [],
              });
            }
          }
        } else {
          // For a text search, use Discord's member search endpoint.
          const discordMembers = await searchDiscordMembers(trimmed, remaining + dbPlayers.length);
          for (const dm of discordMembers) {
            if (combined.length >= 10) break;
            if (!dbIds.has(dm.userId)) {
              combined.push({ user_id: dm.userId, name: dm.name, roles: [] });
            }
          }
        }
      }

      return NextResponse.json({ players: combined });
    } catch (err) {
      console.error("[api/admin/badges] GET search failed:", err);
      return NextResponse.json({ error: "Failed to search players" }, { status: 500 });
    }
  }

  // ------------------------------------------------------------------
  // Discord role member lookup — returns all guild members with the given role
  // ------------------------------------------------------------------
  if (role) {
    const ROLE_MAP: Record<string, string> = {
      contentCreator: CONTENT_CREATOR_ROLE_IDS[0],
      staff:          STAFF_ROLE_IDS[0],
      premium:        PREMIUM_ROLE_ID,
    };
    const roleId = ROLE_MAP[role];
    if (!roleId) {
      return NextResponse.json(
        { error: `role must be one of: ${Object.keys(ROLE_MAP).join(", ")}` },
        { status: 400 }
      );
    }
    try {
      const members = await fetchAllUsersWithRole(roleId, force);
      return NextResponse.json({ members });
    } catch (err) {
      console.error("[api/admin/badges] GET role members failed:", err);
      return NextResponse.json({ error: "Failed to fetch role members" }, { status: 500 });
    }
  }

  // ------------------------------------------------------------------
  // List all players with badge roles
  // ------------------------------------------------------------------
  try {
    const allRoleIds = [
      ...STAFF_ROLE_IDS,
      ...CONTENT_CREATOR_ROLE_IDS,
    ];
    const result = await pool.query(
      `SELECT user_id, name, data->'roles' AS roles, data->'badges' AS badges
       FROM players
       WHERE (
         (data->'badges' IS NOT NULL AND data->'badges' != '[]'::jsonb)
         OR (data->'roles' IS NOT NULL AND data->'roles' != '[]'::jsonb)
       )
       ORDER BY name ASC
       LIMIT 200`
    );
    // Include players who have at least one admin-assigned badge OR a Discord badge role
    const players = result.rows.filter((row) => {
      const badges: string[] = row.badges ?? [];
      const roles: string[] = row.roles ?? [];
      return (
        badges.some((b) => VALID_BADGE_IDS.has(b)) ||
        allRoleIds.some((id) => roles.includes(id))
      );
    });
    return NextResponse.json({ players });
  } catch (err) {
    console.error("[api/admin/badges] GET list failed:", err);
    return NextResponse.json({ error: "Failed to list badge holders" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/badges — assign badge to user (owner only)
// Body: { userId: string; badge: "staff" | "contentCreator" | "tournamentWinner" }
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  let body: { userId?: string; badge?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userId, badge } = body;

  if (!userId?.trim()) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (!badge || !VALID_BADGE_IDS.has(badge)) {
    return NextResponse.json(
      { error: `badge must be one of: ${Array.from(VALID_BADGE_IDS).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const uid = userId.trim();

    // If the player doesn't exist in the database yet (e.g. a Discord member
    // who hasn't registered on the website), create a minimal stub record so
    // that the badge can be persisted.  We try to resolve their display name
    // from Discord; if that fails we fall back to the raw user ID as the name.
    const existsResult = await pool.query(
      `SELECT 1 FROM players WHERE user_id = $1 LIMIT 1`,
      [uid]
    );
    if (existsResult.rowCount === 0) {
      const discordMember = await fetchDiscordMember(uid);
      const displayName = discordMember?.name ?? uid;
      await ensurePlayerExists(uid, displayName);
      console.log(`[api/admin/badges] Created stub player record for ${uid} (${displayName})`);
    }

    await assignBadgeRole(uid, badge);
    const badges = await getUserBadges(uid);
    return NextResponse.json({ success: true, userId: uid, badge, badges });
  } catch (err) {
    console.error("[api/admin/badges] POST failed:", err);
    return NextResponse.json({ error: "Failed to assign badge" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/badges — remove badge from user (owner only)
// Body: { userId: string; badge: "staff" | "contentCreator" | "tournamentWinner" }
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  let body: { userId?: string; badge?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userId, badge } = body;

  if (!userId?.trim()) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (!badge || !VALID_BADGE_IDS.has(badge)) {
    return NextResponse.json(
      { error: `badge must be one of: ${Array.from(VALID_BADGE_IDS).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    await removeBadgeRole(userId.trim(), badge);
    const badges = await getUserBadges(userId.trim());
    return NextResponse.json({ success: true, userId, badge, badges });
  } catch (err) {
    console.error("[api/admin/badges] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to remove badge" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/badges — batch assign or remove a badge from multiple users
// Body: { userIds: string[]; badge: string; action: "assign" | "remove" }
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  let body: { userIds?: string[]; badge?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userIds, badge, action } = body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: "userIds must be a non-empty array" }, { status: 400 });
  }
  if (userIds.length > 50) {
    return NextResponse.json({ error: "Maximum 50 users per batch operation" }, { status: 400 });
  }
  if (!badge || !VALID_BADGE_IDS.has(badge)) {
    return NextResponse.json(
      { error: `badge must be one of: ${Array.from(VALID_BADGE_IDS).join(", ")}` },
      { status: 400 }
    );
  }
  if (action !== "assign" && action !== "remove") {
    return NextResponse.json({ error: "action must be 'assign' or 'remove'" }, { status: 400 });
  }

  const fn = action === "assign" ? assignBadgeRole : removeBadgeRole;

  // For assign operations, ensure every user has a player record in the DB.
  // Users who haven't registered on the website yet will get a stub record
  // so the badge can be persisted.
  if (action === "assign") {
    await Promise.allSettled(
      userIds.map(async (id) => {
        const uid = id.trim();
        const existsResult = await pool.query(
          `SELECT 1 FROM players WHERE user_id = $1 LIMIT 1`,
          [uid]
        );
        if (existsResult.rowCount === 0) {
          const discordMember = await fetchDiscordMember(uid);
          const displayName = discordMember?.name ?? uid;
          await ensurePlayerExists(uid, displayName);
          console.log(`[api/admin/badges] PATCH: Created stub player record for ${uid} (${displayName})`);
        }
      })
    );
  }

  const results = await Promise.allSettled(
    userIds.map((id) => fn(id.trim(), badge))
  );

  const succeeded: string[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") succeeded.push(userIds[i]);
    else failed.push(userIds[i]);
  });

  return NextResponse.json({ success: true, badge, action, succeeded, failed });
}
