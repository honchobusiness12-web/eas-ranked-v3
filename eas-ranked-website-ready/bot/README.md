# EAS Arena Discord Bot — Cogs

This directory contains Discord bot cogs for EAS Arena.

## Cogs

| Cog | File | Purpose |
|-----|------|---------|
| Giveaway Codes  | `cogs/giveaway_codes.py`  | Owner-only slash commands for managing Premium giveaway codes |
| Premium Sync    | `cogs/premium_sync.py`    | Auto-syncs Buy Me a Coffee premium role to the website database |
| Ranked Commands | `cogs/ranked_commands.py` | Scrim/ranked/placement result entry and rollback with review countdowns |

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
    await bot.load_extension("cogs.ranked_commands")
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

## Owner Check

Only users whose Discord ID is in `OWNER_USER_IDS` (or the hardcoded developer ID `733871667788644445`) can run owner commands. All other users receive an "Access Denied" message.

---

## Ranked Commands

All commands are owner-only and use the `!` prefix.  Every stat-changing command shows a **review embed with a countdown** before applying changes, preventing accidental entries.

### Result Entry Commands

#### `!scrimresult <winner_id> <loser_id> <winner_kills> <loser_kills> [cr_change=25]`

Enter a scrim result.  Shows a **10-second countdown** review embed before applying.

| Parameter      | Description                                      | Example              |
|----------------|--------------------------------------------------|----------------------|
| `winner_id`    | Discord user ID of the winner                    | `123456789012345678` |
| `loser_id`     | Discord user ID of the loser                     | `987654321098765432` |
| `winner_kills` | Number of kills the winner got                   | `8`                  |
| `loser_kills`  | Number of kills the loser got                    | `3`                  |
| `cr_change`    | CR to add/remove (default: 25)                   | `30`                 |

**What it changes:**
- Winner: +CR, +1 win, +kills, +1 match
- Loser: -CR (floor 0), +1 loss, +kills, +1 match

**Example:**
```
!scrimresult 123456789012345678 987654321098765432 8 3
!scrimresult 123456789012345678 987654321098765432 8 3 30
```

---

#### `!rankedresult <winner_id> <loser_id> <winner_kills> <loser_kills> [cr_change=30]`

Enter a ranked match result.  Shows a **10-second countdown** review embed before applying.

Same parameters as `!scrimresult` but defaults to 30 CR change.

**Example:**
```
!rankedresult 123456789012345678 987654321098765432 10 4
```

---

#### `!placementresult <player_id> <kills> <placement> [cr_grant=100]`

Enter a placement match result for a single player.  Shows a **10-second countdown** review embed before applying.

| Parameter    | Description                                      | Example              |
|--------------|--------------------------------------------------|----------------------|
| `player_id`  | Discord user ID of the player                    | `123456789012345678` |
| `kills`      | Number of kills the player got                   | `5`                  |
| `placement`  | Final placement position (e.g. 1 = 1st place)   | `3`                  |
| `cr_grant`   | CR to award (default: 100)                       | `150`                |

**What it changes:**
- Player: +CR, +kills, +1 placement_match, +1 match

**Example:**
```
!placementresult 123456789012345678 5 3
!placementresult 123456789012345678 5 3 150
```

---

### Rollback Commands

#### `!scrimrollback <player_id>`

Roll back the most-recent scrim result for a **single player**.  Shows a **20-second countdown** review embed before applying.

1. Bot asks whether the player was the **Winner** or **Loser** (button select).
2. Bot shows a review embed with the exact stat changes that will be reversed.
3. Confirm button unlocks after 20 seconds.
4. Removes **all** stats added by that result: CR, win/loss, match count.

> **Note:** Kill counts are not rolled back in single-player rollback because
> per-match kill history is not stored.  Use `!teamrollback` to roll back kills
> for both players simultaneously.

**Example:**
```
!scrimrollback 123456789012345678
```

---

#### `!teamrollback <winner_id> <loser_id> [cr_change=25]`

Roll back the most-recent scrim result for **both players** simultaneously.  Shows a **20-second countdown** review embed before applying.

1. Bot prompts for kill counts to remove (reply with `<winner_kills> <loser_kills>`).
2. Bot shows a review embed with all stat changes for both players.
3. Confirm button unlocks after 20 seconds.
4. Removes **all** stats: CR, kills, win/loss, match count.

**Example:**
```
!teamrollback 123456789012345678 987654321098765432
!teamrollback 123456789012345678 987654321098765432 30
```

---

### Review Embed Flow

Every result/rollback command follows this flow:

```
Operator runs command
        |
        v
Bot fetches current player stats from database
        |
        v
Review embed sent — shows BEFORE and AFTER stats
Confirm button DISABLED for N seconds (10 for results, 20 for rollbacks)
Countdown updates every second in the embed footer
        |
        v
Countdown expires → Confirm button ENABLED
        |
        v
Operator clicks Confirm → stats applied to database
Operator clicks Cancel  → action cancelled, no changes made
No click within 5s      → timeout, action cancelled
```
