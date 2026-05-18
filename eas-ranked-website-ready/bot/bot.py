"""
EAS Arena — Discord Bot
========================
Consolidated bot file containing all ranked management commands, premium sync,
giveaway code management, and public command discovery.

Commands
--------
  Prefix commands (owner only):
    !addkills @user <kills>                    — Add kills retroactively
    !scrimrollback @user1 @user2 ... <kills>   — Remove kills (20-second countdown)
    !premiumsync @user                         — Manually sync premium role to website
    !premiumstatus @user                       — Show premium role status (no sync)

  Prefix commands (public):
    !commands                                  — List all available bot commands

  Slash commands (owner only):
    /giveawaycode create <code> <duration> <max_uses> [expires_at]
    /giveawaycode list
    /giveawaycode disable <code>
    /giveawaycode info <code>

Setup
-----
  1. Install dependencies:
       pip install discord.py aiohttp

  2. Set environment variables:
       DISCORD_BOT_TOKEN  — your bot token
       OWNER_USER_IDS     — comma-separated Discord user IDs
       WEBSITE_API_URL    — base URL of the Next.js website
       WEBSITE_API_KEY    — shared secret (must match WEBHOOK_SECRET on website)
       DISCORD_GUILD_ID   — your Discord server ID
       PREMIUM_ROLE_ID    — premium role ID (default: 1502426990995836928)
       LOG_CHANNEL_ID     — optional: channel ID for premium sync log messages

  3. Run:
       python bot.py
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional

import aiohttp
import discord
from discord import app_commands
from discord.ext import commands

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("eas_bot")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DISCORD_BOT_TOKEN: str = os.getenv("DISCORD_BOT_TOKEN", "")

OWNER_USER_IDS: list[str] = [
    uid.strip()
    for uid in os.getenv("OWNER_USER_IDS", "733871667788644445").split(",")
    if uid.strip()
]

WEBSITE_API_URL: str = os.getenv("WEBSITE_API_URL", "").rstrip("/")
WEBSITE_API_KEY: str = os.getenv("WEBSITE_API_KEY", os.getenv("WEBHOOK_SECRET", ""))

PREMIUM_ROLE_ID: str = os.getenv("PREMIUM_ROLE_ID", "1502426990995836928")
LOG_CHANNEL_ID: Optional[int] = int(os.getenv("LOG_CHANNEL_ID", "0")) or None

DURATION_ALIASES: dict[str, int] = {
    "7d":   7,
    "1w":   7,
    "14d":  14,
    "2w":   14,
    "30d":  30,
    "1m":   30,
    "90d":  90,
    "3m":   90,
    "180d": 180,
    "6m":   180,
    "365d": 365,
    "1y":   365,
}

# Countdown durations (seconds)
RESULT_ENTRY_COUNTDOWN: int = 10   # countdown before result entry is finalised
SCRIM_ROLLBACK_COUNTDOWN: int = 20  # countdown before scrim rollback is applied

# ---------------------------------------------------------------------------
# Permission helpers
# ---------------------------------------------------------------------------


def is_owner(user_id: int) -> bool:
    """Return True if the given Discord user ID is in OWNER_USER_IDS."""
    return str(user_id) in OWNER_USER_IDS


def owner_only_check():
    """App-command check: only OWNER_USER_IDS may run this command."""
    async def predicate(interaction: discord.Interaction) -> bool:
        if not is_owner(interaction.user.id):
            await interaction.response.send_message(
                "❌ This command is restricted to EAS Arena owners.",
                ephemeral=True,
            )
            return False
        return True
    return app_commands.check(predicate)


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------


def _headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {WEBSITE_API_KEY}",
    }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _api_post(path: str, payload: dict) -> tuple[int, dict]:
    """POST to the website API and return (status_code, response_dict)."""
    url = f"{WEBSITE_API_URL}{path}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                headers=_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                try:
                    data = await resp.json()
                except Exception:
                    data = {"error": await resp.text()}
                return resp.status, data
    except aiohttp.ClientError as exc:
        log.error("[api] Network error posting to %s: %s", path, exc)
        return 0, {"error": f"Network error: {exc}"}


async def _api_get(path: str, params: dict | None = None) -> tuple[int, dict]:
    """GET from the website API and return (status_code, response_dict)."""
    url = f"{WEBSITE_API_URL}{path}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                params=params,
                headers=_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                try:
                    data = await resp.json()
                except Exception:
                    data = {"error": await resp.text()}
                return resp.status, data
    except aiohttp.ClientError as exc:
        log.error("[api] Network error getting %s: %s", path, exc)
        return 0, {"error": f"Network error: {exc}"}


# ---------------------------------------------------------------------------
# Countdown helpers
# ---------------------------------------------------------------------------


async def _send_countdown_embed(
    ctx: commands.Context,
    title: str,
    description: str,
    color: discord.Color,
    seconds: int,
    fields: list[tuple[str, str, bool]] | None = None,
) -> discord.Message:
    """
    Send a review embed with a live countdown, updating every second.
    Returns the final message object.
    """
    async def _build_embed(remaining: int) -> discord.Embed:
        embed = discord.Embed(
            title=title,
            description=f"{description}\n\n⏳ **Applying in {remaining}s…**",
            color=color,
        )
        if fields:
            for name, value, inline in fields:
                embed.add_field(name=name, value=value, inline=inline)
        embed.set_footer(text="This action will be applied automatically when the countdown ends.")
        return embed

    msg = await ctx.reply(embed=await _build_embed(seconds), mention_author=False)

    for remaining in range(seconds - 1, 0, -1):
        await asyncio.sleep(1)
        try:
            await msg.edit(embed=await _build_embed(remaining))
        except discord.HTTPException:
            pass  # message may have been deleted; continue anyway

    await asyncio.sleep(1)
    return msg


# ---------------------------------------------------------------------------
# Ranked Tools Cog
# ---------------------------------------------------------------------------


class RankedTools(commands.Cog):
    """Ranked kill management and command discovery tools."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    # -----------------------------------------------------------------------
    # !addkills @user <kills>
    # -----------------------------------------------------------------------

    @commands.command(name="addkills")
    async def addkills(
        self,
        ctx: commands.Context,
        member: Optional[discord.Member] = None,
        kills: Optional[int] = None,
    ) -> None:
        """
        !addkills @user <kills>
        Add kills to a player's total kill count retroactively.
        Use this when a league host forgot to log kills for a ranked/placement game.
        Owner-only command.
        """
        # --- Permission check ---
        if not is_owner(ctx.author.id):
            await ctx.reply(
                "❌ This command is restricted to EAS Arena owners.",
                mention_author=False,
            )
            return

        # --- Argument validation ---
        if member is None:
            await ctx.reply(
                "❌ Please mention a player: `!addkills @username <kills>`",
                mention_author=False,
            )
            return

        if kills is None:
            await ctx.reply(
                "❌ Please provide a kill count: `!addkills @username <kills>`",
                mention_author=False,
            )
            return

        if kills <= 0:
            await ctx.reply(
                "❌ Kill count must be a positive number.",
                mention_author=False,
            )
            return

        if kills > 1000:
            await ctx.reply(
                "❌ Kill count seems unreasonably high (max 1000 per command). "
                "Double-check the value and try again.",
                mention_author=False,
            )
            return

        # --- Config check ---
        if not WEBSITE_API_URL:
            await ctx.reply(
                "❌ `WEBSITE_API_URL` is not configured on this bot.",
                mention_author=False,
            )
            return

        user_id = str(member.id)

        # --- Fetch current player data ---
        get_status, get_data = await _api_get(
            "/api/admin/players", {"userId": user_id}
        )

        if get_status == 404:
            await ctx.reply(
                f"❌ Player **{member.display_name}** (`{user_id}`) is not registered "
                f"in the EAS Arena database.",
                mention_author=False,
            )
            return

        if get_status != 200 or "player" not in get_data:
            await ctx.reply(
                f"❌ Failed to fetch player data: "
                f"`{get_data.get('error', f'HTTP {get_status}')}`",
                mention_author=False,
            )
            return

        player = get_data["player"]
        current_kills: int = int(player.get("kills", 0))
        new_kills: int = current_kills + kills

        # --- Review embed with 10-second countdown ---
        review_fields = [
            ("Player",      f"{member.mention} (`{user_id}`)",  False),
            ("Kills to Add", str(kills),                         True),
            ("Current Total", str(current_kills),                True),
            ("New Total",    str(new_kills),                     True),
            ("Requested By", str(ctx.author),                    True),
        ]

        countdown_msg = await _send_countdown_embed(
            ctx=ctx,
            title="⏳ Add Kills — Review",
            description=(
                f"Adding **{kills} kill(s)** to **{member.display_name}**.\n"
                "React with ❌ within the countdown to cancel."
            ),
            color=discord.Color.yellow(),
            seconds=RESULT_ENTRY_COUNTDOWN,
            fields=review_fields,
        )

        # --- Apply the update ---
        timestamp = _now_iso()
        history_entry = (
            f"[{timestamp[:10]}] +{kills} kills added by {ctx.author} "
            f"(retroactive — missed kill log)"
        )

        log.info(
            "[addkills] %s adding %d kills to %s (%s)",
            ctx.author, kills, member.display_name, user_id,
        )

        status, data = await _api_post(
            "/api/webhook/player-update",
            {
                "user_id": user_id,
                "data": {"kills": new_kills},
                "history_append": history_entry,
            },
        )

        if status == 200 and data.get("ok"):
            embed = discord.Embed(
                title="✅ Kills Added",
                color=discord.Color.green(),
            )
            embed.add_field(name="Player",      value=f"{member.mention} (`{user_id}`)", inline=False)
            embed.add_field(name="Kills Added", value=str(kills),                        inline=True)
            embed.add_field(name="Old Total",   value=str(current_kills),                inline=True)
            embed.add_field(name="New Total",   value=str(new_kills),                    inline=True)
            embed.add_field(name="Added By",    value=str(ctx.author),                   inline=True)
            embed.add_field(name="Timestamp",   value=f"`{timestamp[:19].replace('T', ' ')} UTC`", inline=True)
            embed.set_footer(text="History entry written to player record.")
            embed.set_thumbnail(url=member.display_avatar.url)

            try:
                await countdown_msg.edit(embed=embed)
            except discord.HTTPException:
                await ctx.reply(embed=embed, mention_author=False)

            log.info(
                "[addkills] ✅ Added %d kills to %s (%s): %d → %d",
                kills, member.display_name, user_id, current_kills, new_kills,
            )
        else:
            err = data.get("error", f"HTTP {status}")
            error_embed = discord.Embed(
                title="❌ Failed to Add Kills",
                description=(
                    f"Could not update kills for **{member.display_name}**.\n"
                    f"Error: `{err}`\n\n"
                    "Check that `WEBSITE_API_URL` and `WEBSITE_API_KEY` are set correctly."
                ),
                color=discord.Color.red(),
            )
            try:
                await countdown_msg.edit(embed=error_embed)
            except discord.HTTPException:
                await ctx.reply(embed=error_embed, mention_author=False)

            log.warning(
                "[addkills] ❌ Failed for %s (%s): %s",
                member.display_name, user_id, err,
            )

    # -----------------------------------------------------------------------
    # !scrimrollback @user1 @user2 ... <kills_to_remove>
    # -----------------------------------------------------------------------

    @commands.command(name="scrimrollback")
    async def scrimrollback(
        self,
        ctx: commands.Context,
        *args: str,
    ) -> None:
        """
        !scrimrollback @user1 @user2 ... <kills_to_remove>
        Remove kills from multiple players at once to undo a scrim result
        that was entered backwards (winners/losers swapped).

        The last argument must be the number of kills to remove.
        All preceding arguments must be @mentions of the affected players.
        Owner-only command. Includes a 20-second countdown before applying.
        """
        # --- Permission check ---
        if not is_owner(ctx.author.id):
            await ctx.reply(
                "❌ This command is restricted to EAS Arena owners.",
                mention_author=False,
            )
            return

        # --- Parse arguments: last arg = kills, rest = members ---
        if len(args) < 2:
            await ctx.reply(
                "❌ Usage: `!scrimrollback @user1 @user2 ... <kills_to_remove>`\n"
                "Mention at least one player and provide the kill count to remove.",
                mention_author=False,
            )
            return

        # Last argument should be the kill count
        try:
            kills_to_remove = int(args[-1])
        except ValueError:
            await ctx.reply(
                "❌ The last argument must be the number of kills to remove.\n"
                "Usage: `!scrimrollback @user1 @user2 ... <kills_to_remove>`",
                mention_author=False,
            )
            return

        if kills_to_remove <= 0:
            await ctx.reply(
                "❌ Kill count to remove must be a positive number.",
                mention_author=False,
            )
            return

        if kills_to_remove > 1000:
            await ctx.reply(
                "❌ Kill count seems unreasonably high (max 1000 per command). "
                "Double-check the value and try again.",
                mention_author=False,
            )
            return

        # Resolve member mentions from the remaining args
        member_args = args[:-1]
        members: list[discord.Member] = []
        failed_mentions: list[str] = []

        for arg in member_args:
            raw_id = arg.strip("<@!>")
            if not raw_id.isdigit():
                failed_mentions.append(arg)
                continue
            member = ctx.guild.get_member(int(raw_id)) if ctx.guild else None
            if member is None:
                failed_mentions.append(arg)
            else:
                members.append(member)

        if failed_mentions:
            await ctx.reply(
                f"❌ Could not resolve the following mentions: "
                f"{', '.join(f'`{m}`' for m in failed_mentions)}\n"
                f"Make sure you @mention valid server members.",
                mention_author=False,
            )
            return

        if not members:
            await ctx.reply(
                "❌ No valid players found. Mention at least one server member.\n"
                "Usage: `!scrimrollback @user1 @user2 ... <kills_to_remove>`",
                mention_author=False,
            )
            return

        # --- Config check ---
        if not WEBSITE_API_URL:
            await ctx.reply(
                "❌ `WEBSITE_API_URL` is not configured on this bot.",
                mention_author=False,
            )
            return

        player_names = ", ".join(m.display_name for m in members)

        log.info(
            "[scrimrollback] %s removing %d kills from %d players: %s",
            ctx.author, kills_to_remove, len(members), player_names,
        )

        # --- Review embed with 20-second countdown ---
        review_fields = [
            ("Players",        "\n".join(m.mention for m in members), False),
            ("Kills to Remove", str(kills_to_remove),                  True),
            ("Player Count",   str(len(members)),                      True),
            ("Requested By",   str(ctx.author),                        True),
        ]

        countdown_msg = await _send_countdown_embed(
            ctx=ctx,
            title="⏳ Scrim Rollback — Review",
            description=(
                f"Removing **{kills_to_remove} kill(s)** from "
                f"**{len(members)}** player(s).\n"
                "React with ❌ within the countdown to cancel."
            ),
            color=discord.Color.orange(),
            seconds=SCRIM_ROLLBACK_COUNTDOWN,
            fields=review_fields,
        )

        # --- Process each player ---
        timestamp = _now_iso()
        results: list[dict] = []

        for member in members:
            user_id = str(member.id)
            history_entry = (
                f"[{timestamp[:10]}] -{kills_to_remove} kills removed by {ctx.author} "
                f"(scrim rollback — result entered backwards)"
            )

            # Fetch current kills
            get_status, get_data = await _api_get(
                "/api/admin/players", {"userId": user_id}
            )

            if get_status == 404 or "player" not in get_data:
                results.append({
                    "member": member,
                    "success": False,
                    "error": "Not found in database",
                    "old_kills": 0,
                    "new_kills": 0,
                })
                continue

            if get_status != 200:
                results.append({
                    "member": member,
                    "success": False,
                    "error": get_data.get("error", f"HTTP {get_status}"),
                    "old_kills": 0,
                    "new_kills": 0,
                })
                continue

            player = get_data["player"]
            current_kills: int = int(player.get("kills", 0))
            new_kills: int = max(0, current_kills - kills_to_remove)

            # Push updated kill count
            post_status, post_data = await _api_post(
                "/api/webhook/player-update",
                {
                    "user_id": user_id,
                    "data": {"kills": new_kills},
                    "history_append": history_entry,
                },
            )

            if post_status == 200 and post_data.get("ok"):
                results.append({
                    "member": member,
                    "success": True,
                    "error": None,
                    "old_kills": current_kills,
                    "new_kills": new_kills,
                })
                log.info(
                    "[scrimrollback] ✅ Removed %d kills from %s (%s): %d → %d",
                    kills_to_remove, member.display_name, user_id,
                    current_kills, new_kills,
                )
            else:
                err = post_data.get("error", f"HTTP {post_status}")
                results.append({
                    "member": member,
                    "success": False,
                    "error": err,
                    "old_kills": current_kills,
                    "new_kills": current_kills,
                })
                log.warning(
                    "[scrimrollback] ❌ Failed for %s (%s): %s",
                    member.display_name, user_id, err,
                )

        # --- Build result embed ---
        successes = [r for r in results if r["success"]]
        failures  = [r for r in results if not r["success"]]

        color = (
            discord.Color.green()  if not failures
            else discord.Color.orange() if successes
            else discord.Color.red()
        )

        embed = discord.Embed(
            title="🔄 Scrim Rollback — Complete",
            description=(
                f"Removed **{kills_to_remove} kills** from "
                f"**{len(members)}** player(s)."
            ),
            color=color,
        )

        if successes:
            lines = [
                f"✅ {r['member'].mention} — `{r['old_kills']}` → `{r['new_kills']}` kills"
                for r in successes
            ]
            embed.add_field(
                name=f"Updated ({len(successes)})",
                value="\n".join(lines),
                inline=False,
            )

        if failures:
            lines = [
                f"❌ {r['member'].mention} — `{r['error']}`"
                for r in failures
            ]
            embed.add_field(
                name=f"Failed ({len(failures)})",
                value="\n".join(lines),
                inline=False,
            )

        embed.add_field(name="Rolled Back By", value=str(ctx.author),                              inline=True)
        embed.add_field(name="Timestamp",      value=f"`{timestamp[:19].replace('T', ' ')} UTC`", inline=True)
        embed.set_footer(text="History entries written to each updated player record.")

        try:
            await countdown_msg.edit(embed=embed)
        except discord.HTTPException:
            await ctx.reply(embed=embed, mention_author=False)

    # -----------------------------------------------------------------------
    # !commands — public command listing
    # -----------------------------------------------------------------------

    @commands.command(name="commands")
    async def list_commands(self, ctx: commands.Context) -> None:
        """
        !commands
        List all available bot commands with descriptions, organised by
        permission level. Available to everyone.
        """
        embed = discord.Embed(
            title="📋 EAS Arena Bot — Commands",
            description=(
                "All available commands for the EAS Arena Discord bot.\n"
                "Commands marked **Owner only** require your Discord ID to be "
                "in the `OWNER_USER_IDS` list."
            ),
            color=discord.Color.blurple(),
        )

        # ── Public commands ──────────────────────────────────────────────
        public_commands = (
            "`!commands`\n"
            "→ Show this list of all available bot commands.\n"
        )
        embed.add_field(
            name="🌐 Public",
            value=public_commands,
            inline=False,
        )

        # ── Owner-only prefix commands ───────────────────────────────────
        owner_commands = (
            "`!addkills @user <kills>`\n"
            "→ Add kills to a player's total retroactively. "
            "Use when a league host forgot to log kills for a ranked/placement game. "
            "Includes a 10-second review countdown before applying.\n\n"

            "`!scrimrollback @user1 @user2 ... <kills>`\n"
            "→ Remove kills from multiple players at once. "
            "Use to undo a scrim result that was entered backwards "
            "(winners/losers swapped). "
            "Includes a 20-second review countdown before applying.\n\n"

            "`!premiumsync @user`\n"
            "→ Manually check if a member has the premium role and sync their "
            "status to the website database.\n\n"

            "`!premiumstatus @user`\n"
            "→ Show the current premium role status for a member (no sync)."
        )
        embed.add_field(
            name="🔒 Owner Only (prefix commands)",
            value=owner_commands,
            inline=False,
        )

        # ── Owner-only slash commands ────────────────────────────────────
        slash_commands = (
            "`/giveawaycode create <code> <duration> <max_uses> [expires_at]`\n"
            "→ Create a new Premium giveaway code.\n\n"

            "`/giveawaycode list`\n"
            "→ List all giveaway codes with their status, uses, and expiry.\n\n"

            "`/giveawaycode disable <code>`\n"
            "→ Disable a code so it can no longer be redeemed.\n\n"

            "`/giveawaycode info <code>`\n"
            "→ View redemption details for a specific giveaway code."
        )
        embed.add_field(
            name="🔒 Owner Only (slash commands)",
            value=slash_commands,
            inline=False,
        )

        embed.set_footer(
            text="EAS Arena Bot  •  Use !commands to see this list at any time"
        )

        await ctx.reply(embed=embed, mention_author=False)

    # -----------------------------------------------------------------------
    # Error handler for ranked tools commands
    # -----------------------------------------------------------------------

    @addkills.error
    async def addkills_error(
        self, ctx: commands.Context, error: commands.CommandError
    ) -> None:
        if isinstance(error, commands.MemberNotFound):
            await ctx.reply(
                f"❌ Could not find member `{error.argument}`. "
                "Make sure you @mention a valid server member.",
                mention_author=False,
            )
        elif isinstance(error, commands.BadArgument):
            await ctx.reply(
                "❌ Invalid argument. Usage: `!addkills @username <kills>`\n"
                "The kill count must be a whole number.",
                mention_author=False,
            )
        elif isinstance(error, commands.MissingRequiredArgument):
            await ctx.reply(
                "❌ Missing argument. Usage: `!addkills @username <kills>`",
                mention_author=False,
            )
        else:
            log.error("[addkills] Unhandled error: %s", error, exc_info=error)
            await ctx.reply(
                f"❌ An unexpected error occurred: `{error}`",
                mention_author=False,
            )

    @scrimrollback.error
    async def scrimrollback_error(
        self, ctx: commands.Context, error: commands.CommandError
    ) -> None:
        if isinstance(error, commands.MissingRequiredArgument):
            await ctx.reply(
                "❌ Missing argument. Usage: `!scrimrollback @user1 @user2 ... <kills>`",
                mention_author=False,
            )
        else:
            log.error("[scrimrollback] Unhandled error: %s", error, exc_info=error)
            await ctx.reply(
                f"❌ An unexpected error occurred: `{error}`",
                mention_author=False,
            )


# ---------------------------------------------------------------------------
# Premium Sync Cog
# ---------------------------------------------------------------------------


async def _send_premium_sync(
    user_id: str,
    premium: bool,
    granted_at: Optional[str] = None,
) -> tuple[bool, str]:
    """
    POST to /api/webhook/player-update with premium sync payload.
    Returns (success: bool, message: str).
    """
    if not WEBSITE_API_URL:
        return False, "WEBSITE_API_URL is not configured"
    if not WEBSITE_API_KEY:
        return False, "WEBSITE_API_KEY is not configured"

    payload = {
        "user_id": user_id,
        "premium": premium,
        "premium_role_synced": True,
        "premium_granted_at": granted_at or _now_iso(),
    }

    log.info(
        "[premium_sync] Sending sync for user %s: premium=%s",
        user_id, premium,
    )

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{WEBSITE_API_URL}/api/webhook/player-update",
                json=payload,
                headers=_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                try:
                    data = await resp.json()
                except Exception:
                    data = {"error": await resp.text()}

                if resp.status == 200 and data.get("ok"):
                    log.info(
                        "[premium_sync] ✅ Sync success for user %s (premium=%s)",
                        user_id, premium,
                    )
                    return True, f"Database updated (premium={premium})"
                else:
                    err = data.get("error", f"HTTP {resp.status}")
                    log.warning(
                        "[premium_sync] ❌ Sync failed for user %s: %s",
                        user_id, err,
                    )
                    return False, f"Website sync failed: {err}"
    except aiohttp.ClientError as exc:
        log.error("[premium_sync] Network error syncing user %s: %s", user_id, exc)
        return False, f"Network error: {exc}"


class PremiumSync(commands.Cog):
    """Syncs the Buy Me a Coffee premium role to the website database."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    # -----------------------------------------------------------------------
    # on_guild_member_update — fires whenever a member's roles change
    # -----------------------------------------------------------------------

    @commands.Cog.listener()
    async def on_guild_member_update(
        self,
        before: discord.Member,
        after: discord.Member,
    ) -> None:
        """Detect premium role add/remove and sync to website immediately."""
        before_role_ids = {str(r.id) for r in before.roles}
        after_role_ids  = {str(r.id) for r in after.roles}

        had_role = PREMIUM_ROLE_ID in before_role_ids
        has_role = PREMIUM_ROLE_ID in after_role_ids

        if had_role == has_role:
            return

        user_id    = str(after.id)
        granted_at = _now_iso()
        action_label = "GRANTED" if has_role else "REVOKED"

        log.info(
            "[premium_sync] User %s (%s) %s premium role %s",
            user_id, after.display_name, action_label, PREMIUM_ROLE_ID,
        )

        success, message = await _send_premium_sync(
            user_id=user_id,
            premium=has_role,
            granted_at=granted_at,
        )

        await self._log_sync(
            user=after,
            action=action_label,
            success=success,
            message=message,
            granted_at=granted_at,
        )

    # -----------------------------------------------------------------------
    # !premiumsync @user — manual sync trigger (owner only)
    # -----------------------------------------------------------------------

    @commands.command(name="premiumsync")
    async def premiumsync(
        self,
        ctx: commands.Context,
        member: Optional[discord.Member] = None,
    ) -> None:
        """
        !premiumsync @user
        Check if the user has the premium role and sync their status to the website.
        Owner-only command.
        """
        if not is_owner(ctx.author.id):
            await ctx.reply(
                "❌ This command is restricted to EAS Arena owners.",
                mention_author=False,
            )
            return

        if member is None:
            await ctx.reply(
                "❌ Please mention a member: `!premiumsync @username`",
                mention_author=False,
            )
            return

        user_id    = str(member.id)
        has_role   = any(str(r.id) == PREMIUM_ROLE_ID for r in member.roles)
        granted_at = _now_iso()

        status_emoji = "✅" if has_role else "❌"
        await ctx.reply(
            f"🔄 Syncing premium status for **{member.display_name}** (`{user_id}`)…\n"
            f"Premium role detected: {status_emoji} `{'YES' if has_role else 'NO'}`",
            mention_author=False,
        )

        log.info(
            "[premium_sync] !premiumsync triggered by %s for user %s (%s): has_role=%s",
            ctx.author, user_id, member.display_name, has_role,
        )

        success, message = await _send_premium_sync(
            user_id=user_id,
            premium=has_role,
            granted_at=granted_at,
        )

        if success:
            await ctx.reply(
                f"✅ **Sync complete** for **{member.display_name}**\n"
                f"• Premium: `{'YES' if has_role else 'NO'}`\n"
                f"• Role ID: `{PREMIUM_ROLE_ID}`\n"
                f"• Timestamp: `{granted_at}`\n"
                f"• Website: `{message}`",
                mention_author=False,
            )
        else:
            await ctx.reply(
                f"❌ **Sync failed** for **{member.display_name}**\n"
                f"• Premium role: `{'YES' if has_role else 'NO'}`\n"
                f"• Error: `{message}`\n"
                "Check that `WEBSITE_API_URL` and `WEBSITE_API_KEY` are set correctly.",
                mention_author=False,
            )

        await self._log_sync(
            user=member,
            action="MANUAL_SYNC",
            success=success,
            message=message,
            granted_at=granted_at,
            triggered_by=ctx.author,
        )

    @premiumsync.error
    async def premiumsync_error(
        self, ctx: commands.Context, error: commands.CommandError
    ) -> None:
        if isinstance(error, commands.MemberNotFound):
            await ctx.reply(
                f"❌ Could not find member `{error.argument}`. "
                "Make sure you @mention a valid server member.",
                mention_author=False,
            )
        else:
            log.error("[premiumsync] Unhandled error: %s", error, exc_info=error)
            await ctx.reply(
                f"❌ An unexpected error occurred: `{error}`",
                mention_author=False,
            )

    # -----------------------------------------------------------------------
    # !premiumstatus @user — check premium status (owner only)
    # -----------------------------------------------------------------------

    @commands.command(name="premiumstatus")
    async def premiumstatus(
        self,
        ctx: commands.Context,
        member: Optional[discord.Member] = None,
    ) -> None:
        """
        !premiumstatus @user
        Show the current premium role status for a member (no sync).
        Owner-only command.
        """
        if not is_owner(ctx.author.id):
            await ctx.reply(
                "❌ This command is restricted to EAS Arena owners.",
                mention_author=False,
            )
            return

        if member is None:
            await ctx.reply(
                "❌ Please mention a member: `!premiumstatus @username`",
                mention_author=False,
            )
            return

        has_role     = any(str(r.id) == PREMIUM_ROLE_ID for r in member.roles)
        status_emoji = "✅" if has_role else "❌"

        embed = discord.Embed(
            title=f"💎 Premium Status — {member.display_name}",
            color=discord.Color.gold() if has_role else discord.Color.dark_gray(),
        )
        embed.add_field(name="Discord ID",   value=f"`{member.id}`",                                    inline=True)
        embed.add_field(name="Premium Role", value=f"{status_emoji} `{'YES' if has_role else 'NO'}`",   inline=True)
        embed.add_field(name="Role ID",      value=f"`{PREMIUM_ROLE_ID}`",                              inline=False)
        embed.add_field(
            name="All Roles",
            value=", ".join(f"`{r.name}`" for r in member.roles if r.name != "@everyone") or "None",
            inline=False,
        )
        embed.set_footer(text=f"Use !premiumsync @{member.display_name} to sync to website")
        embed.set_thumbnail(url=member.display_avatar.url)

        await ctx.reply(embed=embed, mention_author=False)

    @premiumstatus.error
    async def premiumstatus_error(
        self, ctx: commands.Context, error: commands.CommandError
    ) -> None:
        if isinstance(error, commands.MemberNotFound):
            await ctx.reply(
                f"❌ Could not find member `{error.argument}`. "
                "Make sure you @mention a valid server member.",
                mention_author=False,
            )
        else:
            log.error("[premiumstatus] Unhandled error: %s", error, exc_info=error)
            await ctx.reply(
                f"❌ An unexpected error occurred: `{error}`",
                mention_author=False,
            )

    # -----------------------------------------------------------------------
    # Internal: log sync result to a Discord channel
    # -----------------------------------------------------------------------

    async def _log_sync(
        self,
        user: discord.Member,
        action: str,
        success: bool,
        message: str,
        granted_at: str,
        triggered_by: Optional[discord.Member] = None,
    ) -> None:
        """Send a log message to LOG_CHANNEL_ID if configured."""
        if not LOG_CHANNEL_ID:
            return

        channel = self.bot.get_channel(LOG_CHANNEL_ID)
        if not channel or not isinstance(channel, discord.TextChannel):
            return

        color = discord.Color.green() if success else discord.Color.red()
        action_icons = {
            "GRANTED":     "🎉",
            "REVOKED":     "⚠️",
            "MANUAL_SYNC": "🔄",
        }
        icon = action_icons.get(action, "ℹ️")

        embed = discord.Embed(
            title=f"{icon} Premium Sync — {action}",
            color=color,
            timestamp=datetime.fromisoformat(granted_at),
        )
        embed.add_field(name="User",      value=f"{user.mention} (`{user.id}`)", inline=False)
        embed.add_field(name="Action",    value=action,                          inline=True)
        embed.add_field(name="Success",   value="✅ Yes" if success else "❌ No", inline=True)
        embed.add_field(name="Message",   value=message,                         inline=False)
        embed.add_field(name="Timestamp", value=f"`{granted_at}`",               inline=False)
        if triggered_by:
            embed.add_field(name="Triggered By", value=f"{triggered_by.mention}", inline=True)
        embed.set_thumbnail(url=user.display_avatar.url)

        try:
            await channel.send(embed=embed)
        except discord.HTTPException as exc:
            log.warning("[premium_sync] Failed to send log message: %s", exc)


# ---------------------------------------------------------------------------
# Giveaway Codes Cog
# ---------------------------------------------------------------------------


class GiveawayCodes(commands.Cog):
    """Owner-only giveaway code management commands."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    # -----------------------------------------------------------------------
    # /giveawaycode group
    # -----------------------------------------------------------------------

    giveawaycode = app_commands.Group(
        name="giveawaycode",
        description="Manage EAS Arena Premium giveaway codes (owner only).",
    )

    # -----------------------------------------------------------------------
    # /giveawaycode create
    # -----------------------------------------------------------------------

    @giveawaycode.command(name="create", description="Create a new Premium giveaway code.")
    @app_commands.describe(
        code="Code name, e.g. EAS-1WEEK (letters, numbers, hyphens only)",
        duration="Duration: 7d, 14d, 30d, 90d, 180d, 365d — or a plain number of days",
        max_uses="Maximum number of times this code can be redeemed",
        expires_at="Optional: date the code itself expires (YYYY-MM-DD), e.g. 2026-12-31",
    )
    @owner_only_check()
    async def create(
        self,
        interaction: discord.Interaction,
        code: str,
        duration: str,
        max_uses: int,
        expires_at: Optional[str] = None,
    ) -> None:
        await interaction.response.defer(ephemeral=True)

        # Parse duration
        duration_days: int | None = DURATION_ALIASES.get(duration.lower())
        if duration_days is None:
            try:
                duration_days = int(re.sub(r"[^0-9]", "", duration))
            except ValueError:
                duration_days = None

        if not duration_days or duration_days < 1:
            await interaction.followup.send(
                f"❌ Invalid duration `{duration}`. Use e.g. `7d`, `30d`, `90d`, or a plain number.",
                ephemeral=True,
            )
            return

        # Parse optional expiry date
        expires_at_iso: str | None = None
        if expires_at:
            try:
                dt = datetime.strptime(expires_at, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                expires_at_iso = dt.isoformat()
            except ValueError:
                await interaction.followup.send(
                    f"❌ Invalid expires_at `{expires_at}`. Use YYYY-MM-DD format.",
                    ephemeral=True,
                )
                return

        if not WEBSITE_API_URL:
            await interaction.followup.send(
                "❌ `WEBSITE_API_URL` is not configured on this bot.", ephemeral=True
            )
            return

        status, data = await _api_post(
            "/api/giveaway/create",
            {
                "code": code.upper().strip(),
                "duration_days": duration_days,
                "max_uses": max_uses,
                "expires_at": expires_at_iso,
            },
        )

        if status == 201 and data.get("success"):
            c = data["code"]
            embed = discord.Embed(
                title="✅ Giveaway Code Created",
                color=discord.Color.gold(),
            )
            embed.add_field(name="Code",       value=f"`{c['code']}`",              inline=True)
            embed.add_field(name="Duration",   value=f"{c['duration_days']} days",  inline=True)
            embed.add_field(name="Max Uses",   value=str(c["max_uses"]),             inline=True)
            embed.add_field(
                name="Code Expires",
                value=c["expires_at"][:10] if c.get("expires_at") else "Never",
                inline=True,
            )
            embed.set_footer(text=f"Created by {interaction.user}")
            await interaction.followup.send(embed=embed, ephemeral=True)
        else:
            await interaction.followup.send(
                f"❌ Failed to create code: {data.get('error', 'Unknown error')}",
                ephemeral=True,
            )

    # -----------------------------------------------------------------------
    # /giveawaycode list
    # -----------------------------------------------------------------------

    @giveawaycode.command(name="list", description="List all Premium giveaway codes.")
    @owner_only_check()
    async def list_codes(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)

        if not WEBSITE_API_URL:
            await interaction.followup.send(
                "❌ `WEBSITE_API_URL` is not configured on this bot.", ephemeral=True
            )
            return

        status, data = await _api_get("/api/giveaway/list")

        if status != 200:
            await interaction.followup.send(
                f"❌ Failed to fetch codes: {data.get('error', 'Unknown error')}",
                ephemeral=True,
            )
            return

        codes: list[dict] = data.get("codes", [])
        if not codes:
            await interaction.followup.send("📋 No giveaway codes found.", ephemeral=True)
            return

        embed = discord.Embed(title="📋 Giveaway Codes", color=discord.Color.gold())

        for c in codes[:20]:  # Discord embed field limit
            now = datetime.now(timezone.utc)
            expired = c.get("expires_at") and datetime.fromisoformat(
                c["expires_at"].replace("Z", "+00:00")
            ) < now
            full = c["uses"] >= c["max_uses"]
            status_icon = "🔴" if not c["active"] or expired or full else "🟢"
            status_text = (
                "Disabled" if not c["active"]
                else "Expired" if expired
                else "Full" if full
                else "Active"
            )
            embed.add_field(
                name=f"{status_icon} `{c['code']}`",
                value=(
                    f"**{c['duration_days']}d** · {c['uses']}/{c['max_uses']} uses · {status_text}\n"
                    f"Expires: {c['expires_at'][:10] if c.get('expires_at') else 'Never'}"
                ),
                inline=False,
            )

        if len(codes) > 20:
            embed.set_footer(
                text=f"Showing 20 of {len(codes)} codes. See the admin dashboard for all."
            )

        await interaction.followup.send(embed=embed, ephemeral=True)

    # -----------------------------------------------------------------------
    # /giveawaycode disable
    # -----------------------------------------------------------------------

    @giveawaycode.command(name="disable", description="Disable a giveaway code.")
    @app_commands.describe(code="The code to disable, e.g. EAS-1WEEK")
    @owner_only_check()
    async def disable(self, interaction: discord.Interaction, code: str) -> None:
        await interaction.response.defer(ephemeral=True)

        if not WEBSITE_API_URL:
            await interaction.followup.send(
                "❌ `WEBSITE_API_URL` is not configured on this bot.", ephemeral=True
            )
            return

        status, data = await _api_post(
            "/api/giveaway/disable", {"code": code.upper().strip()}
        )

        if status == 200 and data.get("success"):
            await interaction.followup.send(
                f"✅ Code `{code.upper()}` has been disabled.", ephemeral=True
            )
        else:
            await interaction.followup.send(
                f"❌ Failed to disable code: {data.get('error', 'Unknown error')}",
                ephemeral=True,
            )

    # -----------------------------------------------------------------------
    # /giveawaycode info
    # -----------------------------------------------------------------------

    @giveawaycode.command(name="info", description="Get details about a specific giveaway code.")
    @app_commands.describe(code="The code to look up, e.g. EAS-1WEEK")
    @owner_only_check()
    async def info(self, interaction: discord.Interaction, code: str) -> None:
        await interaction.response.defer(ephemeral=True)

        if not WEBSITE_API_URL:
            await interaction.followup.send(
                "❌ `WEBSITE_API_URL` is not configured on this bot.", ephemeral=True
            )
            return

        status, data = await _api_get(
            "/api/giveaway/redemptions", {"code": code.upper().strip()}
        )

        if status == 403:
            await interaction.followup.send("❌ Forbidden.", ephemeral=True)
            return

        if status != 200:
            await interaction.followup.send(
                f"❌ Failed to fetch code info: {data.get('error', 'Unknown error')}",
                ephemeral=True,
            )
            return

        redemptions: list[dict] = data.get("redemptions", [])

        embed = discord.Embed(
            title=f"🎁 Code: `{code.upper()}`",
            color=discord.Color.gold(),
        )
        embed.add_field(name="Redemptions", value=str(len(redemptions)), inline=True)

        if redemptions:
            recent = redemptions[:5]
            lines = [
                f"`{r['user_id']}` — redeemed {r['redeemed_at'][:10]}, "
                f"premium until {r['premium_expires_at'][:10]}"
                for r in recent
            ]
            embed.add_field(
                name="Recent Redemptions",
                value="\n".join(lines) or "None",
                inline=False,
            )

        await interaction.followup.send(embed=embed, ephemeral=True)


# ---------------------------------------------------------------------------
# Bot setup and entry point
# ---------------------------------------------------------------------------


async def main() -> None:
    intents = discord.Intents.default()
    intents.message_content = True
    intents.members = True  # Required for on_guild_member_update (premium sync)

    bot = commands.Bot(command_prefix="!", intents=intents)

    # Remove the default help command so !commands works cleanly
    bot.remove_command("help")

    @bot.event
    async def on_ready() -> None:
        log.info("Logged in as %s (ID: %s)", bot.user, bot.user.id)
        try:
            synced = await bot.tree.sync()
            log.info("Synced %d slash command(s).", len(synced))
        except Exception as exc:
            log.error("Failed to sync slash commands: %s", exc)

    @bot.event
    async def on_command_error(
        ctx: commands.Context, error: commands.CommandError
    ) -> None:
        """Global fallback error handler — catches anything not handled by a cog."""
        if isinstance(error, commands.CommandNotFound):
            return  # Silently ignore unknown commands
        if hasattr(ctx.command, "on_error"):
            return  # Already handled by a local error handler
        log.error(
            "[bot] Unhandled command error in %s: %s",
            ctx.command, error, exc_info=error,
        )

    await bot.add_cog(RankedTools(bot))
    await bot.add_cog(PremiumSync(bot))
    await bot.add_cog(GiveawayCodes(bot))

    if not DISCORD_BOT_TOKEN:
        raise RuntimeError(
            "DISCORD_BOT_TOKEN environment variable is not set. "
            "Set it before running the bot."
        )

    await bot.start(DISCORD_BOT_TOKEN)


if __name__ == "__main__":
    asyncio.run(main())
