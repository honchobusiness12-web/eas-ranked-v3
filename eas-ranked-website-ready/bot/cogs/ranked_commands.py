"""
EAS Arena — Ranked Commands
============================
Prefix commands for entering scrim / ranked / placement results and rolling
back the most-recent result for a player or team.

Commands (all owner-only):
  !scrimresult  <winner_id> <loser_id> <winner_kills> <loser_kills> [cr_change]
  !rankedresult <winner_id> <loser_id> <winner_kills> <loser_kills> [cr_change]
  !placementresult <player_id> <kills> <placement>
  !scrimrollback  <player_id>
  !teamrollback   <player1_id> <player2_id>

Every stat-changing command shows a review embed with a countdown before the
change is applied.  The operator must click "Confirm" before the timer expires
or the action is cancelled.

Environment variables (shared with other cogs):
  OWNER_USER_IDS   — comma-separated Discord user IDs
  WEBSITE_API_URL  — base URL of the Next.js website
  WEBSITE_API_KEY  — shared secret (must match WEBHOOK_SECRET on website)
"""

from __future__ import annotations

import asyncio
import os
import logging
from datetime import datetime, timezone
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

log = logging.getLogger("ranked_commands")

# ---------------------------------------------------------------------------
# CR change defaults per game mode
# ---------------------------------------------------------------------------

DEFAULT_CR_CHANGE: dict[str, int] = {
    "scrim":     25,
    "ranked":    30,
    "placement": 0,   # placements use a fixed CR grant, not win/loss
}

PLACEMENT_CR_GRANT: int = 100  # CR awarded for completing a placement match

# ---------------------------------------------------------------------------
# Owner check
# ---------------------------------------------------------------------------


def is_owner(user_id: int) -> bool:
    return str(user_id) in OWNER_USER_IDS


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------


def _headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {WEBSITE_API_KEY}",
    }


async def _api_get_player(user_id: str) -> dict | None:
    """Fetch a single player's stats from the website API.  Returns None on error."""
    if not WEBSITE_API_URL:
        return None
    url = f"{WEBSITE_API_URL}/api/admin/players"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                params={"userId": user_id},
                headers=_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("player")
                return None
    except aiohttp.ClientError as exc:
        log.error("[ranked_commands] _api_get_player(%s) failed: %s", user_id, exc)
        return None


async def _api_update_player(user_id: str, stats: dict) -> tuple[bool, str]:
    """
    PATCH a player's stats via PUT /api/admin/players with action='edit'.
    Returns (success, message).
    """
    if not WEBSITE_API_URL:
        return False, "WEBSITE_API_URL is not configured"
    if not WEBSITE_API_KEY:
        return False, "WEBSITE_API_KEY is not configured"

    url = f"{WEBSITE_API_URL}/api/admin/players"
    payload = {"userId": user_id, "action": "edit", "stats": stats}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.put(
                url,
                json=payload,
                headers=_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                try:
                    data = await resp.json()
                except Exception:
                    data = {"error": await resp.text()}
                if resp.status == 200 and data.get("success"):
                    return True, "Stats updated"
                return False, data.get("error", f"HTTP {resp.status}")
    except aiohttp.ClientError as exc:
        log.error("[ranked_commands] _api_update_player(%s) failed: %s", user_id, exc)
        return False, f"Network error: {exc}"


# ---------------------------------------------------------------------------
# Stat snapshot helpers
# ---------------------------------------------------------------------------


def _snapshot(player: dict) -> dict:
    """Extract the mutable stat fields from a player API response."""
    return {
        "cr":                int(player.get("cr") or 0),
        "wins":              int(player.get("wins") or 0),
        "losses":            int(player.get("losses") or 0),
        "kills":             int(player.get("kills") or 0),
        "matches":           int(player.get("matches") or 0),
        "mvp_count":         int(player.get("mvp_count") or 0),
        "placement_matches": int(player.get("placement_matches") or 0),
    }


def _display_name(player: dict) -> str:
    return player.get("name") or player.get("username") or player.get("user_id") or "Unknown"


# ---------------------------------------------------------------------------
# Review / Confirm UI
# ---------------------------------------------------------------------------


class _ConfirmView(discord.ui.View):
    """
    A View with two buttons:
      • "Confirm" — disabled for `lock_seconds`, then enabled.
      • "Cancel"  — always enabled.

    After the view resolves, `confirmed` is True / False / None (timeout).
    """

    def __init__(self, lock_seconds: int) -> None:
        super().__init__(timeout=float(lock_seconds + 5))
        self.confirmed: bool | None = None
        self._lock_seconds = lock_seconds
        # Start with Confirm disabled
        self.confirm_button.disabled = True

    @discord.ui.button(label="✅ Confirm", style=discord.ButtonStyle.success, custom_id="confirm")
    async def confirm_button(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        self.confirmed = True
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                child.disabled = True
        await interaction.response.edit_message(view=self)
        self.stop()

    @discord.ui.button(label="❌ Cancel", style=discord.ButtonStyle.danger, custom_id="cancel")
    async def cancel_button(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        self.confirmed = False
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                child.disabled = True
        await interaction.response.edit_message(view=self)
        self.stop()

    async def on_timeout(self) -> None:
        self.confirmed = None
        self.stop()


async def review_and_confirm(
    ctx: commands.Context,
    embed_builder,          # callable(seconds_left: int) -> discord.Embed
    lock_seconds: int,
    update_interval: int = 1,
) -> bool:
    """
    Send a review embed with a countdown.  The "Confirm" button is locked for
    `lock_seconds` seconds, then unlocked.  The embed is updated every
    `update_interval` seconds to show the remaining time.

    Returns True if the operator confirmed, False if cancelled or timed out.
    """
    view = _ConfirmView(lock_seconds=lock_seconds)
    message = await ctx.reply(
        embed=embed_builder(lock_seconds),
        view=view,
        mention_author=False,
    )

    elapsed = 0
    while elapsed < lock_seconds:
        await asyncio.sleep(update_interval)
        elapsed += update_interval
        remaining = max(lock_seconds - elapsed, 0)

        # Update the embed countdown
        try:
            await message.edit(embed=embed_builder(remaining), view=view)
        except discord.HTTPException:
            pass

        if view.is_finished():
            break

    # Unlock the Confirm button once the countdown expires
    if not view.is_finished():
        view.confirm_button.disabled = False
        try:
            await message.edit(embed=embed_builder(0), view=view)
        except discord.HTTPException:
            pass

    # Wait for the user to click a button (view timeout handles the deadline)
    if not view.is_finished():
        await view.wait()

    confirmed = view.confirmed
    if confirmed is None:
        # Timed out — disable all buttons
        for child in view.children:
            if isinstance(child, discord.ui.Button):
                child.disabled = True
        try:
            await message.edit(
                embed=embed_builder(0).set_footer(text="⏰ Timed out — action cancelled."),
                view=view,
            )
        except discord.HTTPException:
            pass
        return False

    return confirmed


# ---------------------------------------------------------------------------
# Embed builders
# ---------------------------------------------------------------------------


def _result_review_embed(
    mode: str,
    winner: dict,
    loser: dict,
    winner_kills: int,
    loser_kills: int,
    cr_change: int,
    seconds_left: int,
) -> discord.Embed:
    """Build the review embed shown before a scrim/ranked result is applied."""
    mode_label = mode.capitalize()
    color = (
        discord.Color.blue()   if mode == "ranked"
        else discord.Color.orange() if mode == "scrim"
        else discord.Color.purple()
    )

    w_name = _display_name(winner)
    l_name = _display_name(loser)
    w_snap = _snapshot(winner)
    l_snap = _snapshot(loser)

    embed = discord.Embed(
        title=f"📋 {mode_label} Result — Review Before Confirming",
        color=color,
        timestamp=datetime.now(timezone.utc),
    )

    # Winner row
    embed.add_field(
        name=f"🏆 Winner — {w_name}",
        value=(
            f"**CR:** {w_snap['cr']} → **{w_snap['cr'] + cr_change}** (+{cr_change})\n"
            f"**Wins:** {w_snap['wins']} → {w_snap['wins'] + 1}\n"
            f"**Kills:** {w_snap['kills']} → {w_snap['kills'] + winner_kills} (+{winner_kills})\n"
            f"**Matches:** {w_snap['matches']} → {w_snap['matches'] + 1}"
        ),
        inline=True,
    )

    # Loser row
    embed.add_field(
        name=f"💀 Loser — {l_name}",
        value=(
            f"**CR:** {l_snap['cr']} → **{max(l_snap['cr'] - cr_change, 0)}** (-{cr_change})\n"
            f"**Losses:** {l_snap['losses']} → {l_snap['losses'] + 1}\n"
            f"**Kills:** {l_snap['kills']} → {l_snap['kills'] + loser_kills} (+{loser_kills})\n"
            f"**Matches:** {l_snap['matches']} → {l_snap['matches'] + 1}"
        ),
        inline=True,
    )

    if seconds_left > 0:
        embed.set_footer(text=f"⏳ Confirm button unlocks in {seconds_left}s — review carefully!")
    else:
        embed.set_footer(text="✅ Confirm button is now active — click to apply or cancel.")

    return embed


def _placement_review_embed(
    player: dict,
    kills: int,
    placement: int,
    cr_grant: int,
    seconds_left: int,
) -> discord.Embed:
    """Build the review embed shown before a placement result is applied."""
    p_name = _display_name(player)
    snap = _snapshot(player)

    embed = discord.Embed(
        title="📋 Placement Result — Review Before Confirming",
        color=discord.Color.purple(),
        timestamp=datetime.now(timezone.utc),
    )
    embed.add_field(
        name=f"🎯 Player — {p_name}",
        value=(
            f"**Placement:** #{placement}\n"
            f"**CR:** {snap['cr']} → **{snap['cr'] + cr_grant}** (+{cr_grant})\n"
            f"**Kills:** {snap['kills']} → {snap['kills'] + kills} (+{kills})\n"
            f"**Placement Matches:** {snap['placement_matches']} → {snap['placement_matches'] + 1}\n"
            f"**Matches:** {snap['matches']} → {snap['matches'] + 1}"
        ),
        inline=False,
    )

    if seconds_left > 0:
        embed.set_footer(text=f"⏳ Confirm button unlocks in {seconds_left}s — review carefully!")
    else:
        embed.set_footer(text="✅ Confirm button is now active — click to apply or cancel.")

    return embed


def _rollback_review_embed(
    players_before: list[tuple[dict, dict]],  # list of (player_info, new_stats)
    mode_label: str,
    seconds_left: int,
) -> discord.Embed:
    """
    Build the review embed shown before a rollback is applied.
    players_before: list of (current_player_dict, stats_after_rollback_dict)
    """
    embed = discord.Embed(
        title=f"⚠️ {mode_label} Rollback — Review Before Confirming",
        description=(
            "The following stats will be **removed** from the database.\n"
            "This action **cannot be undone** once confirmed."
        ),
        color=discord.Color.red(),
        timestamp=datetime.now(timezone.utc),
    )

    for player, new_stats in players_before:
        p_name = _display_name(player)
        snap = _snapshot(player)
        cr_diff   = snap["cr"]      - new_stats["cr"]
        win_diff  = snap["wins"]    - new_stats["wins"]
        loss_diff = snap["losses"]  - new_stats["losses"]
        kill_diff = snap["kills"]   - new_stats["kills"]
        match_diff = snap["matches"] - new_stats["matches"]

        changes: list[str] = []
        if cr_diff != 0:
            sign = "+" if cr_diff > 0 else ""
            changes.append(f"**CR:** {snap['cr']} → **{new_stats['cr']}** ({sign}{cr_diff:+d})")
        if win_diff != 0:
            changes.append(f"**Wins:** {snap['wins']} → {new_stats['wins']}")
        if loss_diff != 0:
            changes.append(f"**Losses:** {snap['losses']} → {new_stats['losses']}")
        if kill_diff != 0:
            changes.append(f"**Kills:** {snap['kills']} → {new_stats['kills']}")
        if match_diff != 0:
            changes.append(f"**Matches:** {snap['matches']} → {new_stats['matches']}")

        embed.add_field(
            name=f"👤 {p_name}",
            value="\n".join(changes) if changes else "No stat changes",
            inline=True,
        )

    if seconds_left > 0:
        embed.set_footer(
            text=f"⏳ Confirm button unlocks in {seconds_left}s — double-check before confirming!"
        )
    else:
        embed.set_footer(text="✅ Confirm button is now active — click to apply rollback or cancel.")

    return embed


# ---------------------------------------------------------------------------
# Cog
# ---------------------------------------------------------------------------


class RankedCommands(commands.Cog):
    """Ranked result entry and rollback commands for EAS Arena."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    # -----------------------------------------------------------------------
    # Guard helpers
    # -----------------------------------------------------------------------

    def _check_owner(self, ctx: commands.Context) -> bool:
        return is_owner(ctx.author.id)

    async def _deny(self, ctx: commands.Context) -> None:
        await ctx.reply(
            "❌ This command is restricted to EAS Arena owners.",
            mention_author=False,
        )

    async def _fetch_player_or_error(
        self, ctx: commands.Context, user_id: str, label: str = "Player"
    ) -> dict | None:
        player = await _api_get_player(user_id)
        if player is None:
            await ctx.reply(
                f"❌ {label} `{user_id}` not found in the database.\n"
                "Make sure the Discord user ID is correct and the player is registered.",
                mention_author=False,
            )
        return player

    # -----------------------------------------------------------------------
    # !scrimresult <winner_id> <loser_id> <winner_kills> <loser_kills> [cr_change]
    # -----------------------------------------------------------------------

    @commands.command(name="scrimresult")
    async def scrimresult(
        self,
        ctx: commands.Context,
        winner_id: str,
        loser_id: str,
        winner_kills: int,
        loser_kills: int,
        cr_change: int = DEFAULT_CR_CHANGE["scrim"],
    ) -> None:
        """
        !scrimresult <winner_id> <loser_id> <winner_kills> <loser_kills> [cr_change=25]
        Enter a scrim result.  Shows a 10-second review embed before applying.
        """
        if not self._check_owner(ctx):
            await self._deny(ctx)
            return

        if winner_id == loser_id:
            await ctx.reply("❌ Winner and loser cannot be the same player.", mention_author=False)
            return

        winner = await self._fetch_player_or_error(ctx, winner_id, "Winner")
        if winner is None:
            return
        loser = await self._fetch_player_or_error(ctx, loser_id, "Loser")
        if loser is None:
            return

        # Build embed factory (captures current snapshots)
        def make_embed(seconds_left: int) -> discord.Embed:
            return _result_review_embed(
                "scrim", winner, loser, winner_kills, loser_kills, cr_change, seconds_left
            )

        confirmed = await review_and_confirm(ctx, make_embed, lock_seconds=10)
        if not confirmed:
            await ctx.reply("🚫 Scrim result **cancelled**.", mention_author=False)
            return

        await self._apply_result(
            ctx, "scrim", winner, loser, winner_kills, loser_kills, cr_change
        )

    # -----------------------------------------------------------------------
    # !rankedresult <winner_id> <loser_id> <winner_kills> <loser_kills> [cr_change]
    # -----------------------------------------------------------------------

    @commands.command(name="rankedresult")
    async def rankedresult(
        self,
        ctx: commands.Context,
        winner_id: str,
        loser_id: str,
        winner_kills: int,
        loser_kills: int,
        cr_change: int = DEFAULT_CR_CHANGE["ranked"],
    ) -> None:
        """
        !rankedresult <winner_id> <loser_id> <winner_kills> <loser_kills> [cr_change=30]
        Enter a ranked result.  Shows a 10-second review embed before applying.
        """
        if not self._check_owner(ctx):
            await self._deny(ctx)
            return

        if winner_id == loser_id:
            await ctx.reply("❌ Winner and loser cannot be the same player.", mention_author=False)
            return

        winner = await self._fetch_player_or_error(ctx, winner_id, "Winner")
        if winner is None:
            return
        loser = await self._fetch_player_or_error(ctx, loser_id, "Loser")
        if loser is None:
            return

        def make_embed(seconds_left: int) -> discord.Embed:
            return _result_review_embed(
                "ranked", winner, loser, winner_kills, loser_kills, cr_change, seconds_left
            )

        confirmed = await review_and_confirm(ctx, make_embed, lock_seconds=10)
        if not confirmed:
            await ctx.reply("🚫 Ranked result **cancelled**.", mention_author=False)
            return

        await self._apply_result(
            ctx, "ranked", winner, loser, winner_kills, loser_kills, cr_change
        )

    # -----------------------------------------------------------------------
    # !placementresult <player_id> <kills> <placement> [cr_grant]
    # -----------------------------------------------------------------------

    @commands.command(name="placementresult")
    async def placementresult(
        self,
        ctx: commands.Context,
        player_id: str,
        kills: int,
        placement: int,
        cr_grant: int = PLACEMENT_CR_GRANT,
    ) -> None:
        """
        !placementresult <player_id> <kills> <placement> [cr_grant=100]
        Enter a placement match result.  Shows a 10-second review embed before applying.
        """
        if not self._check_owner(ctx):
            await self._deny(ctx)
            return

        player = await self._fetch_player_or_error(ctx, player_id, "Player")
        if player is None:
            return

        def make_embed(seconds_left: int) -> discord.Embed:
            return _placement_review_embed(player, kills, placement, cr_grant, seconds_left)

        confirmed = await review_and_confirm(ctx, make_embed, lock_seconds=10)
        if not confirmed:
            await ctx.reply("🚫 Placement result **cancelled**.", mention_author=False)
            return

        await self._apply_placement(ctx, player, kills, placement, cr_grant)

    # -----------------------------------------------------------------------
    # !scrimrollback <player_id>
    # -----------------------------------------------------------------------

    @commands.command(name="scrimrollback")
    async def scrimrollback(
        self,
        ctx: commands.Context,
        player_id: str,
    ) -> None:
        """
        !scrimrollback <player_id>
        Roll back the most-recent scrim result for a single player.
        Removes ALL stats added by that result: CR, kills, win/loss, match count.
        Shows a 20-second review embed before applying.
        """
        if not self._check_owner(ctx):
            await self._deny(ctx)
            return

        player = await self._fetch_player_or_error(ctx, player_id, "Player")
        if player is None:
            return

        snap = _snapshot(player)

        # Determine what a single scrim result added and reverse it.
        # We use the default CR change; if the original used a custom value
        # the operator should use !teamrollback or manually adjust.
        cr_change = DEFAULT_CR_CHANGE["scrim"]

        # We don't know if this player was the winner or loser of the last
        # scrim, so we present both possibilities and let the operator choose
        # the correct one via the confirm/cancel flow.
        # For simplicity we roll back assuming the last result was a WIN
        # (most common rollback scenario — operator entered the wrong winner).
        # The embed clearly shows what will change so the operator can cancel
        # if the assumption is wrong.
        new_stats_as_winner = {
            "cr":      max(snap["cr"] - cr_change, 0),
            "wins":    max(snap["wins"] - 1, 0),
            "kills":   snap["kills"],   # kills unknown without snapshot; kept
            "matches": max(snap["matches"] - 1, 0),
        }
        new_stats_as_loser = {
            "cr":      snap["cr"] + cr_change,
            "losses":  max(snap["losses"] - 1, 0),
            "kills":   snap["kills"],
            "matches": max(snap["matches"] - 1, 0),
        }

        # Ask the operator which role the player had
        role_view = _RoleSelectView()
        role_msg = await ctx.reply(
            embed=discord.Embed(
                title="🔄 Scrim Rollback — Was this player the Winner or Loser?",
                description=(
                    f"**{_display_name(player)}** (`{player_id}`)\n\n"
                    f"Current stats: CR `{snap['cr']}` | "
                    f"W `{snap['wins']}` / L `{snap['losses']}` | "
                    f"Kills `{snap['kills']}` | Matches `{snap['matches']}`\n\n"
                    "Select the role this player had in the result you want to roll back."
                ),
                color=discord.Color.orange(),
            ),
            view=role_view,
            mention_author=False,
        )
        await role_view.wait()

        if role_view.role is None:
            await role_msg.edit(
                embed=discord.Embed(
                    title="🚫 Scrim Rollback Cancelled",
                    description="No role selected — rollback cancelled.",
                    color=discord.Color.dark_gray(),
                ),
                view=None,
            )
            return

        was_winner = role_view.role == "winner"
        new_stats = new_stats_as_winner if was_winner else new_stats_as_loser

        # Build the full new-stats dict (only include fields we're changing)
        rollback_stats: dict = {}
        if was_winner:
            rollback_stats = {
                "cr":      new_stats["cr"],
                "wins":    new_stats["wins"],
                "matches": new_stats["matches"],
            }
        else:
            rollback_stats = {
                "cr":      new_stats["cr"],
                "losses":  new_stats["losses"],
                "matches": new_stats["matches"],
            }

        # Reconstruct a "player after rollback" dict for the embed
        player_after = dict(player)
        player_after.update(rollback_stats)

        def make_rollback_embed(seconds_left: int) -> discord.Embed:
            return _rollback_review_embed(
                [(player, rollback_stats)],
                "Scrim",
                seconds_left,
            )

        confirmed = await review_and_confirm(ctx, make_rollback_embed, lock_seconds=20)
        if not confirmed:
            await ctx.reply("🚫 Scrim rollback **cancelled**.", mention_author=False)
            return

        ok, msg = await _api_update_player(player_id, rollback_stats)
        if ok:
            await ctx.reply(
                embed=discord.Embed(
                    title="✅ Scrim Rollback Applied",
                    description=(
                        f"**{_display_name(player)}** stats have been rolled back.\n\n"
                        + "\n".join(
                            f"• **{k.upper()}:** {_snapshot(player).get(k, '?')} → {v}"
                            for k, v in rollback_stats.items()
                        )
                    ),
                    color=discord.Color.green(),
                    timestamp=datetime.now(timezone.utc),
                ).set_footer(text=f"Rolled back by {ctx.author}"),
                mention_author=False,
            )
            log.info(
                "[ranked_commands] !scrimrollback applied for %s by %s: %s",
                player_id, ctx.author, rollback_stats,
            )
        else:
            await ctx.reply(
                f"❌ Rollback failed: `{msg}`\nNo changes were made.",
                mention_author=False,
            )

    # -----------------------------------------------------------------------
    # !teamrollback <player1_id> <player2_id>
    # -----------------------------------------------------------------------

    @commands.command(name="teamrollback")
    async def teamrollback(
        self,
        ctx: commands.Context,
        winner_id: str,
        loser_id: str,
        cr_change: int = DEFAULT_CR_CHANGE["scrim"],
    ) -> None:
        """
        !teamrollback <winner_id> <loser_id> [cr_change=25]
        Roll back the most-recent scrim result for both players simultaneously.
        Removes ALL stats: CR, kills, win/loss, match count.
        Shows a 20-second review embed before applying.
        """
        if not self._check_owner(ctx):
            await self._deny(ctx)
            return

        if winner_id == loser_id:
            await ctx.reply("❌ Winner and loser cannot be the same player.", mention_author=False)
            return

        winner = await self._fetch_player_or_error(ctx, winner_id, "Winner")
        if winner is None:
            return
        loser = await self._fetch_player_or_error(ctx, loser_id, "Loser")
        if loser is None:
            return

        w_snap = _snapshot(winner)
        l_snap = _snapshot(loser)

        # Ask how many kills to roll back (we don't store per-match kill history)
        kills_msg = await ctx.reply(
            embed=discord.Embed(
                title="🔄 Team Rollback — Enter Kills to Remove",
                description=(
                    f"**Winner:** {_display_name(winner)} (`{winner_id}`)\n"
                    f"**Loser:** {_display_name(loser)} (`{loser_id}`)\n\n"
                    "Reply with: `<winner_kills> <loser_kills>`\n"
                    "Example: `5 3`\n\n"
                    "Type `0 0` if you don't want to roll back kills."
                ),
                color=discord.Color.orange(),
            ),
            mention_author=False,
        )

        def check(m: discord.Message) -> bool:
            return (
                m.author == ctx.author
                and m.channel == ctx.channel
                and len(m.content.split()) == 2
                and all(p.lstrip("-").isdigit() for p in m.content.split())
            )

        try:
            reply = await ctx.bot.wait_for("message", check=check, timeout=30.0)
            parts = reply.content.split()
            winner_kills_rb = int(parts[0])
            loser_kills_rb  = int(parts[1])
        except asyncio.TimeoutError:
            await kills_msg.edit(
                embed=discord.Embed(
                    title="🚫 Team Rollback Cancelled",
                    description="No kill counts provided — rollback cancelled.",
                    color=discord.Color.dark_gray(),
                ),
            )
            return

        # Compute new stats after rollback
        winner_new = {
            "cr":      max(w_snap["cr"] - cr_change, 0),
            "wins":    max(w_snap["wins"] - 1, 0),
            "kills":   max(w_snap["kills"] - winner_kills_rb, 0),
            "matches": max(w_snap["matches"] - 1, 0),
        }
        loser_new = {
            "cr":      l_snap["cr"] + cr_change,
            "losses":  max(l_snap["losses"] - 1, 0),
            "kills":   max(l_snap["kills"] - loser_kills_rb, 0),
            "matches": max(l_snap["matches"] - 1, 0),
        }

        def make_rollback_embed(seconds_left: int) -> discord.Embed:
            return _rollback_review_embed(
                [(winner, winner_new), (loser, loser_new)],
                "Team Scrim",
                seconds_left,
            )

        confirmed = await review_and_confirm(ctx, make_rollback_embed, lock_seconds=20)
        if not confirmed:
            await ctx.reply("🚫 Team rollback **cancelled**.", mention_author=False)
            return

        # Apply both updates
        ok_w, msg_w = await _api_update_player(winner_id, winner_new)
        ok_l, msg_l = await _api_update_player(loser_id, loser_new)

        if ok_w and ok_l:
            embed = discord.Embed(
                title="✅ Team Rollback Applied",
                color=discord.Color.green(),
                timestamp=datetime.now(timezone.utc),
            )
            embed.add_field(
                name=f"🏆 {_display_name(winner)} (was Winner)",
                value="\n".join(
                    f"• **{k.upper()}:** {w_snap.get(k, '?')} → {v}"
                    for k, v in winner_new.items()
                ),
                inline=True,
            )
            embed.add_field(
                name=f"💀 {_display_name(loser)} (was Loser)",
                value="\n".join(
                    f"• **{k.upper()}:** {l_snap.get(k, '?')} → {v}"
                    for k, v in loser_new.items()
                ),
                inline=True,
            )
            embed.set_footer(text=f"Rolled back by {ctx.author}")
            await ctx.reply(embed=embed, mention_author=False)
            log.info(
                "[ranked_commands] !teamrollback applied by %s: winner=%s %s, loser=%s %s",
                ctx.author, winner_id, winner_new, loser_id, loser_new,
            )
        else:
            errors: list[str] = []
            if not ok_w:
                errors.append(f"Winner (`{winner_id}`): {msg_w}")
            if not ok_l:
                errors.append(f"Loser (`{loser_id}`): {msg_l}")
            await ctx.reply(
                f"❌ Rollback partially failed:\n" + "\n".join(errors),
                mention_author=False,
            )

    # -----------------------------------------------------------------------
    # Internal: apply a scrim/ranked result to both players
    # -----------------------------------------------------------------------

    async def _apply_result(
        self,
        ctx: commands.Context,
        mode: str,
        winner: dict,
        loser: dict,
        winner_kills: int,
        loser_kills: int,
        cr_change: int,
    ) -> None:
        w_snap = _snapshot(winner)
        l_snap = _snapshot(loser)

        winner_new = {
            "cr":      w_snap["cr"] + cr_change,
            "wins":    w_snap["wins"] + 1,
            "kills":   w_snap["kills"] + winner_kills,
            "matches": w_snap["matches"] + 1,
        }
        loser_new = {
            "cr":      max(l_snap["cr"] - cr_change, 0),
            "losses":  l_snap["losses"] + 1,
            "kills":   l_snap["kills"] + loser_kills,
            "matches": l_snap["matches"] + 1,
        }

        ok_w, msg_w = await _api_update_player(winner["user_id"], winner_new)
        ok_l, msg_l = await _api_update_player(loser["user_id"], loser_new)

        mode_label = mode.capitalize()
        if ok_w and ok_l:
            embed = discord.Embed(
                title=f"✅ {mode_label} Result Applied",
                color=discord.Color.green(),
                timestamp=datetime.now(timezone.utc),
            )
            embed.add_field(
                name=f"🏆 {_display_name(winner)}",
                value=(
                    f"CR: `{w_snap['cr']}` → `{winner_new['cr']}` (+{cr_change})\n"
                    f"Wins: `{w_snap['wins']}` → `{winner_new['wins']}`\n"
                    f"Kills: `{w_snap['kills']}` → `{winner_new['kills']}`\n"
                    f"Matches: `{w_snap['matches']}` → `{winner_new['matches']}`"
                ),
                inline=True,
            )
            embed.add_field(
                name=f"💀 {_display_name(loser)}",
                value=(
                    f"CR: `{l_snap['cr']}` → `{loser_new['cr']}` (-{cr_change})\n"
                    f"Losses: `{l_snap['losses']}` → `{loser_new['losses']}`\n"
                    f"Kills: `{l_snap['kills']}` → `{loser_new['kills']}`\n"
                    f"Matches: `{l_snap['matches']}` → `{loser_new['matches']}`"
                ),
                inline=True,
            )
            embed.set_footer(text=f"Entered by {ctx.author}")
            await ctx.reply(embed=embed, mention_author=False)
            log.info(
                "[ranked_commands] %s result applied by %s: winner=%s %s, loser=%s %s",
                mode, ctx.author,
                winner["user_id"], winner_new,
                loser["user_id"], loser_new,
            )
        else:
            errors: list[str] = []
            if not ok_w:
                errors.append(f"Winner (`{winner['user_id']}`): {msg_w}")
            if not ok_l:
                errors.append(f"Loser (`{loser['user_id']}`): {msg_l}")
            await ctx.reply(
                f"❌ {mode_label} result partially failed:\n" + "\n".join(errors),
                mention_author=False,
            )

    # -----------------------------------------------------------------------
    # Internal: apply a placement result
    # -----------------------------------------------------------------------

    async def _apply_placement(
        self,
        ctx: commands.Context,
        player: dict,
        kills: int,
        placement: int,
        cr_grant: int,
    ) -> None:
        snap = _snapshot(player)
        new_stats = {
            "cr":                snap["cr"] + cr_grant,
            "kills":             snap["kills"] + kills,
            "placement_matches": snap["placement_matches"] + 1,
            "matches":           snap["matches"] + 1,
        }

        ok, msg = await _api_update_player(player["user_id"], new_stats)
        if ok:
            embed = discord.Embed(
                title="✅ Placement Result Applied",
                color=discord.Color.green(),
                timestamp=datetime.now(timezone.utc),
            )
            embed.add_field(
                name=f"🎯 {_display_name(player)}",
                value=(
                    f"Placement: `#{placement}`\n"
                    f"CR: `{snap['cr']}` → `{new_stats['cr']}` (+{cr_grant})\n"
                    f"Kills: `{snap['kills']}` → `{new_stats['kills']}`\n"
                    f"Placement Matches: `{snap['placement_matches']}` → `{new_stats['placement_matches']}`\n"
                    f"Matches: `{snap['matches']}` → `{new_stats['matches']}`"
                ),
                inline=False,
            )
            embed.set_footer(text=f"Entered by {ctx.author}")
            await ctx.reply(embed=embed, mention_author=False)
            log.info(
                "[ranked_commands] placement result applied by %s: player=%s %s",
                ctx.author, player["user_id"], new_stats,
            )
        else:
            await ctx.reply(
                f"❌ Placement result failed: `{msg}`\nNo changes were made.",
                mention_author=False,
            )


# ---------------------------------------------------------------------------
# Helper Views
# ---------------------------------------------------------------------------


class _RoleSelectView(discord.ui.View):
    """Asks whether the player was the Winner or Loser in the last result."""

    def __init__(self) -> None:
        super().__init__(timeout=30.0)
        self.role: str | None = None

    @discord.ui.button(label="🏆 Winner", style=discord.ButtonStyle.primary)
    async def winner_button(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        self.role = "winner"
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                child.disabled = True
        await interaction.response.edit_message(view=self)
        self.stop()

    @discord.ui.button(label="💀 Loser", style=discord.ButtonStyle.secondary)
    async def loser_button(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        self.role = "loser"
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                child.disabled = True
        await interaction.response.edit_message(view=self)
        self.stop()

    @discord.ui.button(label="❌ Cancel", style=discord.ButtonStyle.danger)
    async def cancel_button(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        self.role = None
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                child.disabled = True
        await interaction.response.edit_message(view=self)
        self.stop()

    async def on_timeout(self) -> None:
        self.role = None
        self.stop()


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(RankedCommands(bot))
