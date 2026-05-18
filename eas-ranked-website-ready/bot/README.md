# EAS Arena Discord Bot — Cogs

This directory contains Discord bot cogs for EAS Arena.

## Cogs

| Cog | File | Purpose |
|-----|------|---------| 
| Giveaway Codes | `cogs/giveaway_codes.py` | Owner-only slash commands for managing Premium giveaway codes |
| Premium Sync   | `cogs/premium_sync.py`   | Auto-syncs Buy Me a Coffee premium role to the website database |
| Ranked Tools   | `cogs/ranked_tools.py`   | Owner-only kill management commands and public `!commands` listing |

---

## Setup

### 1. Install dependencies

```bash
pip install discord.py aiohttp
```

### 2. Load all cogs in your bot

```python
# In your main bot file (e.g. bot.py)
async def main():
    bot = commands.Bot(command_prefix="!", intents=discord.Intents.all())
    await bot.load_extension("cogs.giveaway_codes")
    await bot.load_extension("cogs.premium_sync")
    await bot.load_extension("cogs.ranked_tools")
    await bot.start(os.getenv("DISCORD_BOT_TOKEN"))
```

> **Important:** `premium_sync` requires `Intents.members` to be enabled so the bot
> receives `on_guild_member_update` events. Enable the **Server Members Intent** in
> the Discord Developer Portal under your bot's settings.

### 3. Environment variables

| Variable          | Description                                                              |
|-------------------|--------------------------------------------------------------------------|
| `OWNER_USER_IDS`  | Comma-separated Discord user IDs allowed to use owner commands           |
| `WEBSITE_API_URL` | Base URL of the Next.js website (e.g. `https://eas-arena.railway.app`)   |
| `WEBSITE_API_KEY` | Shared secret — must match `WEBHOOK_SECRET` on the website               |
| `PREMIUM_ROLE_ID` | Discord role ID for premium (default: `1502426990995836928`)             |
| `LOG_CHANNEL_ID`  | Optional: Discord channel ID for premium sync log messages               |

---

## Giveaway Code Commands

All commands are ephemeral (only visible to the user who ran them).

### `/giveawaycode create <code> <duration> <max_uses> [expires_at]`

Create a new giveaway code.

| Parameter   | Description                                              | Example          |
|-------------|----------------------------------------------------------|------------------|
| `code`      | Code name (letters, numbers, hyphens)                    | `EAS-1WEEK`      |
| `duration`  | Duration: `7d`, `14d`, `30d`, `90d`, `180d`, `365d`     | `30d`            |
| `max_uses`  | Max number of redemptions                                | `5`              |
| `expires_at`| Optional: date the code expires (YYYY-MM-DD)             | `2026-12-31`     |

**Examples:**
```
/giveawaycode create EAS-1WEEK 7d 1 2026-12-31
/giveawaycode create EAS-30DAY 30d 5 2026-12-31
/giveawaycode create EAS-UNLIMITED 90d 1000
```

### `/giveawaycode list`

List all giveaway codes with their status, uses, and expiry.

### `/giveawaycode disable <code>`

Disable a code so it can no longer be redeemed.

### `/giveawaycode info <code>`

View redemption details for a specific code.

---

## Premium Sync Commands

### `!premiumsync @user`

Manually check if a member has the premium role and sync their status to the website.

**What it does:**
1. Checks if the mentioned member has role `1502426990995836928`
2. POSTs to `/api/webhook/player-update` with `premium=true/false`
3. Website updates `players.data->>'premium'` immediately
4. Website revalidates profile, leaderboard, and home pages
5. Reports result in Discord

**Example:**
```
!premiumsync @JohnDoe
```

### `!premiumstatus @user`

Show the current premium role status for a member without syncing.

**Example:**
```
!premiumstatus @JohnDoe
```

---

## How Premium Sync Works

```
Discord role assigned (Buy Me a Coffee bot)
         |
         v
on_guild_member_update fires in premium_sync.py
         |
         v
POST /api/webhook/player-update
  { user_id, premium: true, premium_role_synced: true, premium_granted_at: ISO }
         |
         v
Website writes to players.data:
  { "premium": true, "premium_role_synced": true, "premium_granted_at": "..." }
         |
         v
isPremiumUser() checks data->>'premium' = 'true' (no login required)
         |
         v
revalidatePath() refreshes /profile/:id, /leaderboard, /
         |
         v
Premium badge visible to everyone within ~30 seconds
```

---

## Ranked Tools Commands

### `!addkills @user <kills>`

Add kills to a player's total kill count retroactively. Use this when a league host forgot to log kills for a ranked or placement game.

| Parameter | Description                                  | Example       |
|-----------|----------------------------------------------|---------------|
| `@user`   | The player to credit kills to                | `@JohnDoe`    |
| `kills`   | Number of kills to add (1–1000)              | `5`           |

**What it does:**
1. Fetches the player's current kill total from the database
2. Adds the specified kills to their total
3. Writes a history entry: `[YYYY-MM-DD] +N kills added by <admin> (retroactive — missed kill log)`
4. Updates the database via the player-update webhook

**Example:**
```
!addkills @JohnDoe 5
```

---

### `!scrimrollback @user1 @user2 ... <kills>`

Remove kills from multiple players at once to undo a scrim result that was entered backwards (winners/losers swapped). Simpler than the snapshot-based rollback — just decrements kills and writes a history entry.

| Parameter  | Description                                         | Example              |
|------------|-----------------------------------------------------|----------------------|
| `@user...` | One or more players to remove kills from            | `@Alice @Bob @Carol` |
| `kills`    | Number of kills to remove from each player (1–1000) | `3`                  |

**What it does:**
1. Fetches each player's current kill total
2. Subtracts the specified kills (floors at 0 — kills cannot go negative)
3. Writes a history entry per player: `[YYYY-MM-DD] -N kills removed by <admin> (scrim rollback — result entered backwards)`
4. Reports a per-player success/failure summary

**Example:**
```
!scrimrollback @Alice @Bob @Carol 3
```

---

### `!commands`

List all available bot commands with descriptions, organised by permission level. Available to everyone.

**Example:**
```
!commands
```

---

## Owner Check

Only users whose Discord ID is in `OWNER_USER_IDS` (or the hardcoded developer ID `733871667788644445`) can run owner commands. All other users receive an "Access Denied" message.
