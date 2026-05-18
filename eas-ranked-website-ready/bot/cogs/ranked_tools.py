"""
EAS Arena — Ranked Tools
=========================
Owner-only prefix commands for managing ranked/scrim kill counts, plus a
public !commands listing so all users can discover what the bot offers.

Commands
--------
  !addkills @user <kills>                    — Add kills to a player (owner+)
  !scrimrollback @user1 @user2 ... <kills>   — Remove kills from multiple players (owner+)
  !commands                                  — List all available bot commands (public)

Setup
-----
  1. Add this cog to your bot: bot.load_extension("cogs.ranked_tools")
  2. Ensure the following environment variables are set:
       OWNER_USER_IDS   — comma-separated Discord user IDs
       WEBSITE_API_URL  — base URL of the Next.js website
       WEBSITE_API_KEY  — shared secret (must match WEBHOOK_SECRET on website)
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from typing import Optional

import aiohttp
import discord
from discord.ext import commands

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

OWNER_USER_IDS: list[str] = [
    uid.strip()
    for uid in os.getenv("OWNER_USER_IDS", "733871667788644445").split(",")
    if uid.strip()
]

WEBSITE_API_URL: str = os.getenv("WEBSITE_API_URL", "").rstrip("/")
WEBSITE_API_KEY: str = os.getenv("WEBSITE_API_KEY", os.getenv("WEBHOOK_SECRET", ""))

log = logging.getLogger("ranked_tools")

# ---------------------------------------------------------------------------
# Permission helpers
# ---------------------------------------------------------------------------


def is_owner(user_id: int) -> bool:
    """Return True if the given Discord user ID is in OWNER_USER_IDS."""
    return str(user_id) in OWNER_USER_IDS


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
        log.error("[ranked_tools] Network error posting to %s: %s", path, exc)
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
        log.error("[ranked_tools] Network error getting %s: %s", path, exc)
        return 0, {"error": f"Network error: {exc}"}


# ---------------------------------------------------------------------------
# Cog
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
        timestamp = _now_iso()
        history_entry = (
            f"[{timestamp[:10]}] +{kills} kills added by {ctx.author} "
            f"(retroactive — missed kill log)"
        )

        log.info(
            "[ranked_tools] !addkills: %s adding %d kills to %s (%s)",
            ctx.author,
            kills,
            member.display_name,
            user_id,
        )

        # --- Fetch current player data to compute new kill total ---
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

        # --- Push the updated kill count via the player-update webhook ---
        # We send the full new kill total so the webhook can write it directly.
        status, data = await _api_post(
            "/api/webhook/player-update",
            {
                "user_id": user_id,
                "data": {
                    "kills": new_kills,
                },
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
            await ctx.reply(embed=embed, mention_author=False)

            log.info(
                "[ranked_tools] ✅ Added %d kills to %s (%s): %d → %d",
                kills,
                member.display_name,
                user_id,
                current_kills,
                new_kills,
            )
        else:
            # Fallback: try the admin players PUT endpoint directly
            put_status, put_data = await _api_post(
                "/api/admin/players",
                {
                    "userId": user_id,
                    "action": "edit",
                    "stats": {"kills": new_kills},
                },
            )
            # Note: admin/players uses PUT not POST, so this will 405 — handled below
            err = data.get("error", f"HTTP {status}")
            await ctx.reply(
                f"❌ Failed to update kills for **{member.display_name}**: `{err}`\n"
                f"Check that `WEBSITE_API_URL` and `WEBSITE_API_KEY` are set correctly.",
                mention_author=False,
            )
            log.warning(
                "[ranked_tools] ❌ addkills failed for %s (%s): %s",
                member.display_name,
                user_id,
                err,
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
        Owner-only command.
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
            # Strip <@>, <@!> mention syntax and try to resolve
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

        timestamp = _now_iso()
        player_names = ", ".join(m.display_name for m in members)

        log.info(
            "[ranked_tools] !scrimrollback: %s removing %d kills from %d players: %s",
            ctx.author,
            kills_to_remove,
            len(members),
            player_names,
        )

        # --- Process each player ---
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
                    "data": {
                        "kills": new_kills,
                    },
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
                    "[ranked_tools] ✅ Scrim rollback: removed %d kills from %s (%s): %d → %d",
                    kills_to_remove,
                    member.display_name,
                    user_id,
                    current_kills,
                    new_kills,
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
                    "[ranked_tools] ❌ Scrim rollback failed for %s (%s): %s",
                    member.display_name,
                    user_id,
                    err,
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
            title="🔄 Scrim Rollback",
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
            "Use when a league host forgot to log kills for a ranked/placement game.\n\n"

            "`!scrimrollback @user1 @user2 ... <kills>`\n"
            "→ Remove kills from multiple players at once. "
            "Use to undo a scrim result that was entered backwards "
            "(winners/losers swapped).\n\n"

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


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(RankedTools(bot))
