"""
EAS Arena — Premium Role Sync
==============================
Detects when a member gains or loses the Buy Me a Coffee premium role
(ID: 1502426990995836928) and immediately syncs their premium status
to the website database via the player-update webhook.

Also provides:
  !premiumsync @user  — manually trigger a sync check for a member
  !premiumstatus @user — show current premium status for a member

Setup:
  1. Add this cog to your bot: bot.load_extension("cogs.premium_sync")
  2. Set environment variables:
       OWNER_USER_IDS   — comma-separated Discord user IDs (e.g. "733871667788644445")
       WEBSITE_API_URL  — base URL of the Next.js website
       WEBSITE_API_KEY  — shared secret (must match WEBHOOK_SECRET on website)
       DISCORD_GUILD_ID — your Discord server ID
       PREMIUM_ROLE_ID  — premium role ID (default: 1502426990995836928)
       LOG_CHANNEL_ID   — optional: channel ID for sync log messages
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
PREMIUM_ROLE_ID: str = os.getenv("PREMIUM_ROLE_ID", "1502426990995836928")
LOG_CHANNEL_ID: Optional[int] = (
    int(os.getenv("LOG_CHANNEL_ID", "0")) or None
)

log = logging.getLogger("premium_sync")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {WEBSITE_API_KEY}",
    }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_owner(user_id: int) -> bool:
    return str(user_id) in OWNER_USER_IDS


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
        "[premium_sync] Sending sync for user %s: premium=%s, granted_at=%s",
        user_id,
        premium,
        payload["premium_granted_at"],
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
                        user_id,
                        premium,
                    )
                    return True, f"Database updated (premium={premium})"
                else:
                    err = data.get("error", f"HTTP {resp.status}")
                    log.warning(
                        "[premium_sync] ❌ Sync failed for user %s: %s",
                        user_id,
                        err,
                    )
                    return False, f"Website sync failed: {err}"
    except aiohttp.ClientError as exc:
        log.error("[premium_sync] Network error syncing user %s: %s", user_id, exc)
        return False, f"Network error: {exc}"


# ---------------------------------------------------------------------------
# Cog
# ---------------------------------------------------------------------------


class PremiumSync(commands.Cog):
    """Syncs the Buy Me a Coffee premium role to the website database."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    # -----------------------------------------------------------------------
    # guildMemberUpdate — fires whenever a member's roles change
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

        had_role  = PREMIUM_ROLE_ID in before_role_ids
        has_role  = PREMIUM_ROLE_ID in after_role_ids

        # No change in premium role — nothing to do
        if had_role == has_role:
            return

        user_id    = str(after.id)
        user_name  = after.display_name
        granted_at = _now_iso()

        if has_role:
            log.info(
                "[premium_sync] 🎉 User %s (%s) GAINED premium role %s",
                user_id,
                user_name,
                PREMIUM_ROLE_ID,
            )
            action_label = "GRANTED"
        else:
            log.info(
                "[premium_sync] ⚠️  User %s (%s) LOST premium role %s",
                user_id,
                user_name,
                PREMIUM_ROLE_ID,
            )
            action_label = "REVOKED"

        success, message = await _send_premium_sync(
            user_id=user_id,
            premium=has_role,
            granted_at=granted_at,
        )

        # Log to a Discord channel if configured
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
            await ctx.reply("❌ This command is restricted to EAS Arena owners.", mention_author=False)
            return

        if member is None:
            await ctx.reply(
                "❌ Please mention a member: `!premiumsync @username`",
                mention_author=False,
            )
            return

        user_id   = str(member.id)
        has_role  = any(str(r.id) == PREMIUM_ROLE_ID for r in member.roles)
        granted_at = _now_iso()

        status_emoji = "✅" if has_role else "❌"
        await ctx.reply(
            f"🔄 Syncing premium status for **{member.display_name}** (`{user_id}`)…\n"
            f"Premium role detected: {status_emoji} `{'YES' if has_role else 'NO'}`",
            mention_author=False,
        )

        log.info(
            "[premium_sync] !premiumsync triggered by %s for user %s (%s): has_role=%s",
            ctx.author,
            user_id,
            member.display_name,
            has_role,
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
                f"Check that `WEBSITE_API_URL` and `WEBSITE_API_KEY` are set correctly.",
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
            await ctx.reply("❌ This command is restricted to EAS Arena owners.", mention_author=False)
            return

        if member is None:
            await ctx.reply(
                "❌ Please mention a member: `!premiumstatus @username`",
                mention_author=False,
            )
            return

        has_role = any(str(r.id) == PREMIUM_ROLE_ID for r in member.roles)
        status_emoji = "✅" if has_role else "❌"

        embed = discord.Embed(
            title=f"💎 Premium Status — {member.display_name}",
            color=discord.Color.gold() if has_role else discord.Color.dark_gray(),
        )
        embed.add_field(name="Discord ID",    value=f"`{member.id}`",                    inline=True)
        embed.add_field(name="Premium Role",  value=f"{status_emoji} `{'YES' if has_role else 'NO'}`", inline=True)
        embed.add_field(name="Role ID",       value=f"`{PREMIUM_ROLE_ID}`",              inline=False)
        embed.add_field(
            name="All Roles",
            value=", ".join(f"`{r.name}`" for r in member.roles if r.name != "@everyone") or "None",
            inline=False,
        )
        embed.set_footer(text=f"Use !premiumsync @{member.display_name} to sync to website")
        embed.set_thumbnail(url=member.display_avatar.url)

        await ctx.reply(embed=embed, mention_author=False)

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
# Setup
# ---------------------------------------------------------------------------


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(PremiumSync(bot))
