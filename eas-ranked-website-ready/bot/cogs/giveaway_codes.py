"""
EAS Arena — Giveaway Code Commands
===================================
Owner-only Discord slash commands for managing Premium giveaway codes.

Commands:
  /giveawaycode create <code> <duration> <max_uses> [expires_at]
  /giveawaycode list
  /giveawaycode disable <code>
  /giveawaycode info <code>

Setup:
  1. Add this cog to your bot: bot.load_extension("cogs.giveaway_codes")
  2. Set environment variables:
       OWNER_USER_IDS   — comma-separated Discord user IDs (e.g. "733871667788644445,123456789")
       WEBSITE_API_URL  — base URL of the Next.js website (e.g. "https://eas-arena.up.railway.app")
       WEBSITE_API_KEY  — shared secret for bot→website API calls (set as WEBHOOK_SECRET on website)
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Optional

import aiohttp
import discord
from discord import app_commands
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


# ---------------------------------------------------------------------------
# Owner check
# ---------------------------------------------------------------------------

def is_owner(user_id: int) -> bool:
    return str(user_id) in OWNER_USER_IDS


def owner_only():
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


async def _api_post(path: str, payload: dict) -> tuple[int, dict]:
    url = f"{WEBSITE_API_URL}{path}"
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=_headers()) as resp:
            try:
                data = await resp.json()
            except Exception:
                data = {"error": await resp.text()}
            return resp.status, data


async def _api_get(path: str, params: dict | None = None) -> tuple[int, dict]:
    url = f"{WEBSITE_API_URL}{path}"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params, headers=_headers()) as resp:
            try:
                data = await resp.json()
            except Exception:
                data = {"error": await resp.text()}
            return resp.status, data


# ---------------------------------------------------------------------------
# Cog
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
    @owner_only()
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
            embed.add_field(name="Code",       value=f"`{c['code']}`",          inline=True)
            embed.add_field(name="Duration",   value=f"{c['duration_days']} days", inline=True)
            embed.add_field(name="Max Uses",   value=str(c["max_uses"]),         inline=True)
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
    @owner_only()
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
            status_icon = (
                "🔴" if not c["active"] or expired or full else "🟢"
            )
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
            embed.set_footer(text=f"Showing 20 of {len(codes)} codes. See the admin dashboard for all.")

        await interaction.followup.send(embed=embed, ephemeral=True)

    # -----------------------------------------------------------------------
    # /giveawaycode disable
    # -----------------------------------------------------------------------

    @giveawaycode.command(name="disable", description="Disable a giveaway code.")
    @app_commands.describe(code="The code to disable, e.g. EAS-1WEEK")
    @owner_only()
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
    @owner_only()
    async def info(self, interaction: discord.Interaction, code: str) -> None:
        await interaction.response.defer(ephemeral=True)

        if not WEBSITE_API_URL:
            await interaction.followup.send(
                "❌ `WEBSITE_API_URL` is not configured on this bot.", ephemeral=True
            )
            return

        # Fetch redemptions (includes code details via join)
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
# Setup
# ---------------------------------------------------------------------------

async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(GiveawayCodes(bot))
