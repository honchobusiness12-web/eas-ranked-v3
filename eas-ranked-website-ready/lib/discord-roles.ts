/**
 * Discord role membership utilities.
 *
 * Fetches all guild members that hold a specific role using the Discord bot
 * token and the guild members list endpoint (paginated).  Results are cached
 * in-process for 5 minutes so that repeated calls within the same server
 * instance don't hammer the Discord API.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscordMember {
  userId: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  members: DiscordMember[];
  expiresAt: number;
}

// Keyed by roleId
const roleCache = new Map<string, CacheEntry>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCached(roleId: string): DiscordMember[] | null {
  const entry = roleCache.get(roleId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    roleCache.delete(roleId);
    return null;
  }
  return entry.members;
}

function setCached(roleId: string, members: DiscordMember[]): void {
  roleCache.set(roleId, { members, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Invalidate the cache for a specific role (or all roles if omitted). */
export function invalidateRoleCache(roleId?: string): void {
  if (roleId) {
    roleCache.delete(roleId);
  } else {
    roleCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Core fetch — paginated guild member list filtered by role
// ---------------------------------------------------------------------------

/**
 * Returns all guild members that currently hold `roleId`.
 *
 * Uses the Discord bot token to call `GET /guilds/{guild}/members` with
 * pagination (limit=1000, after=lastUserId) until all pages are exhausted,
 * then filters to members that include `roleId` in their roles array.
 *
 * Results are cached for 5 minutes.  Pass `force = true` to bypass the cache.
 */
export async function fetchAllUsersWithRole(
  roleId: string,
  force = false
): Promise<DiscordMember[]> {
  if (!force) {
    const cached = getCached(roleId);
    if (cached) return cached;
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    console.warn("[discord-roles] DISCORD_BOT_TOKEN or DISCORD_GUILD_ID not set — skipping");
    return [];
  }

  const members: DiscordMember[] = [];
  let after: string | null = null;
  const PAGE_SIZE = 1000;

  try {
    // Paginate through all guild members
    while (true) {
      const url = new URL(
        `https://discord.com/api/v10/guilds/${guildId}/members`
      );
      url.searchParams.set("limit", String(PAGE_SIZE));
      if (after) url.searchParams.set("after", after);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        console.warn(
          `[discord-roles] fetchAllUsersWithRole(${roleId}) page failed: HTTP ${res.status}`
        );
        break;
      }

      const page: Array<{
        user: { id: string; username: string; global_name?: string | null; avatar?: string | null };
        roles: string[];
        nick?: string | null;
      }> = await res.json();

      if (!Array.isArray(page) || page.length === 0) break;

      for (const member of page) {
        if (member.roles.includes(roleId)) {
          members.push({
            userId: member.user.id,
            username: member.user.username,
            displayName: member.nick ?? member.user.global_name ?? null,
            avatar: member.user.avatar
              ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png?size=64`
              : null,
          });
        }
      }

      // If we got fewer than PAGE_SIZE results, we've reached the last page
      if (page.length < PAGE_SIZE) break;

      // Advance the cursor to the last member's ID
      after = page[page.length - 1].user.id;
    }
  } catch (err) {
    console.error(`[discord-roles] fetchAllUsersWithRole(${roleId}) error:`, err);
    return [];
  }

  setCached(roleId, members);
  console.log(
    `[discord-roles] Fetched ${members.length} members with role ${roleId}`
  );
  return members;
}

/**
 * Fetch members for multiple roles in parallel.
 * Returns a map of roleId → DiscordMember[].
 */
export async function fetchAllUsersWithRoles(
  roleIds: string[],
  force = false
): Promise<Map<string, DiscordMember[]>> {
  const results = await Promise.all(
    roleIds.map(async (roleId) => ({
      roleId,
      members: await fetchAllUsersWithRole(roleId, force),
    }))
  );

  const map = new Map<string, DiscordMember[]>();
  for (const { roleId, members } of results) {
    map.set(roleId, members);
  }
  return map;
}
