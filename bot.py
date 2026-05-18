print("Bot is starting...")

import discord
from discord import app_commands
from discord.ext import commands, tasks
import json
import os
import traceback
import asyncio
import csv
import io
from datetime import datetime, timedelta

try:
    import psycopg2
    from psycopg2.extras import Json
except ModuleNotFoundError:
    psycopg2 = None
    Json = None

try:
    import aiohttp
except ModuleNotFoundError:
    aiohttp = None

TOKEN = os.getenv("TOKEN")
DATABASE_URL = os.getenv("DATABASE_URL")
DATA_FILE = os.getenv("DATA_FILE", "players.json")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")
WEBSITE_WEBHOOK_URL = os.getenv("WEBSITE_WEBHOOK_URL", "https://easarena.pro/api/webhook/player-update")


OWNER_IDS = [
    733871667788644445,
]

DEVELOPER_IDS = [
    733871667788644445,
]

STAFF_ROLE_IDS = [
    1473033154478497832,
    1473033135003533352,
    1473033115818786909,
]

LEAGUE_HOST_ROLE_IDS = [
    1473033154478497832,
    1473033135003533352,
    1473033115818786909,
]

ALLOWED_CHANNEL_IDS = [
    1499251854796652616,
]

ALLOWED_SCRIM_ROLE_IDS = [
    1487480702256545892,
    1473033154478497832,
    1473033135003533352,
    1473033115818786909,
]

SCRIM_COMMAND_CHANNEL_ID = 1499251854796652616
RANKED_ROLE_ID = 1475122896656404550

PLACEMENTS_ROLE_ID = 1473033096001056818

RANK_ROLES = {
    "R1 Bronze":        1473033096001056818,
    "R2 Silver":        1473033096001056819,
    "R3 Gold":          1473033096001056820,
    "R4 Platinum":      1473033096001056821,
    "R5 All-Star Low":  1473033096001056822,
    "R5 All-Star Mid":  1473033096001056823,
    "R5 All-Star High": 1473033096001056824,
    "R6 Elite":         1473033096001056825,
    "R7 Champion":      1473033096001056826,
}

PREMIUM_USER_ROLE_ID = 1502426990995836928
PREMIUM_ACCESS_ROLES = [
    1502426990995836928,
    1473033154478497832,
    1473033135003533352,
    1473033115818786909,
]

AVAILABLE_BADGES = [
    "MVP", "Top Fragger", "Win Streak", "Veteran", "Season 1 Champion",
    "Tournament Winner", "Season Champion", "Undefeated", "Hall of Fame",
    "Comeback King", "Clutch Player", "Premium",
]

START_TIME = datetime.now()

# ============================
# PREMIUM CACHE
# ============================

_premium_cache: dict = {}
PREMIUM_CACHE_TTL = 60  # seconds

# ============================
# DATA / DATABASE
# ============================

def using_database():
    return psycopg2 is not None and DATABASE_URL is not None and DATABASE_URL.strip() != ""


def ensure_backup_folder():
    os.makedirs("backups", exist_ok=True)


def get_db_connection():
    return psycopg2.connect(DATABASE_URL)


def init_database():
    if not using_database():
        print("⚠️ PostgreSQL not connected. Using players.json only.")
        if psycopg2 is None:
            print("⚠️ psycopg2 is not installed. Run: pip install psycopg2-binary")
        return

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS players (
            guild_id BIGINT NOT NULL,
            user_id BIGINT NOT NULL,
            data JSONB NOT NULL,
            PRIMARY KEY (guild_id, user_id)
        );
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("📦 PostgreSQL connected and ready.")


def load_json_backup():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_json_backup(data):
    ensure_backup_folder()
    try:
        with open(DATA_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"⚠️ Failed to save JSON backup: {e}")


def load_data():
    if not using_database():
        return load_json_backup()

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT guild_id, user_id, data FROM players")
        rows = cur.fetchall()
        cur.close()
        conn.close()

        data = {}
        for guild_id, user_id, player_data in rows:
            gid = str(guild_id)
            uid = str(user_id)
            if gid not in data:
                data[gid] = {}
            data[gid][uid] = normalize_player(player_data)
        return data
    except Exception as e:
        print(f"⚠️ load_data DB error: {e}")
        return load_json_backup()


def save_player_to_db_only(guild_id, user_id, player_data):
    if not using_database():
        return
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO players (guild_id, user_id, data)
            VALUES (%s, %s, %s)
            ON CONFLICT (guild_id, user_id)
            DO UPDATE SET data = EXCLUDED.data
        """, (int(guild_id), int(user_id), Json(player_data)))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"⚠️ save_player_to_db_only failed for guild={guild_id} user={user_id}: {e}")


async def send_webhook_to_website(user_id, player_data):
    """POST player data to the website webhook so its cache updates instantly."""
    if aiohttp is None:
        print("⚠️ aiohttp not installed — skipping webhook notification.")
        return
    if not WEBHOOK_SECRET:
        print("⚠️ WEBHOOK_SECRET not set — skipping webhook notification.")
        return
    payload = {
        "user_id": str(user_id),
        "data": player_data
    }
    headers = {
        "Authorization": f"Bearer {WEBHOOK_SECRET}",
        "Content-Type": "application/json"
    }
    print(f"🔔 Webhook → POST {WEBSITE_WEBHOOK_URL} | user_id={user_id}")
    print(f"🔔 Webhook payload keys: {list(payload['data'].keys()) if isinstance(payload.get('data'), dict) else 'N/A'}")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                WEBSITE_WEBHOOK_URL,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status not in (200, 201, 204):
                    text = await resp.text()
                    print(f"⚠️ Webhook returned {resp.status}: {text[:500]} | URL={WEBSITE_WEBHOOK_URL}")
                else:
                    print(f"✅ Webhook OK ({resp.status}) for user_id={user_id}")
    except Exception as e:
        print(f"⚠️ Webhook to website failed: {e}")


def get_guild_data(ctx, data):
    guild_id = str(ctx.guild.id)
    if guild_id not in data:
        data[guild_id] = {}
    return data[guild_id]


def make_player():
    return {
        "cr": 0,
        "ranked": False,
        "placement_matches": 0,
        "wins": 0,
        "losses": 0,
        "kills": 0,
        "matches": 0,
        "mvp_count": 0,
        "win_streak": 0,
        "kill_farming_reports": 0,
        "last_killfarm_time": None,
        "notes": [],
        "history": [],
        "result_snapshots": [],
        "blacklisted": False,
        "suspended_until": None,
        "suspension_reason": None,
        "registered": False,
        "username": None,
        "display_name": None,
        "avatar_url": None,
        "mention": None,
        "badges": [],
        "premium": False,
        "premium_granted_at": None,
    }


def normalize_player(player):
    base = make_player()
    if isinstance(player, dict):
        for key, value in player.items():
            base[key] = value
    return base


def ensure_profile_fields(member, player):
    if member:
        player["username"] = str(member)
        player["display_name"] = member.display_name
        player["avatar_url"] = str(member.display_avatar.url) if member.display_avatar else None
        player["mention"] = member.mention


# ============================
# PREMIUM HELPERS
# ============================

def is_premium_user(member):
    return has_any_role(member, PREMIUM_ACCESS_ROLES)


async def sync_premium_for_member(guild, member):
    if member is None or member.bot:
        return False, False

    uid = str(member.id)
    guild_id = guild.id

    has_premium = is_premium_user(member)

    if not using_database():
        return has_premium, has_premium

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT data FROM players WHERE guild_id = %s AND user_id = %s",
            (int(guild_id), int(uid))
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"⚠️ sync_premium_for_member DB read failed for {uid}: {e}")
        return has_premium, has_premium

    if row is None:
        return False, has_premium

    player = normalize_player(row[0])
    had_premium = player.get("premium", False)

    if had_premium == has_premium:
        return had_premium, has_premium

    player["premium"] = has_premium
    if has_premium:
        player["premium_granted_at"] = datetime.now().isoformat()
    else:
        player["premium_granted_at"] = None

    try:
        save_player_to_db_only(guild_id, uid, player)
    except Exception as e:
        print(f"⚠️ sync_premium_for_member DB write failed for {uid}: {e}")
        return had_premium, has_premium
    action = "granted" if has_premium else "revoked"
    print(f"💎 Premium {action} for {member} ({uid}) in guild {guild_id}")
    return had_premium, has_premium


@tasks.loop(minutes=1)
async def sync_premium_roles_task():
    """Background task: sync premium status for every member in every guild every minute."""
    try:
        for guild in bot.guilds:
            try:
                premium_role = guild.get_role(PREMIUM_USER_ROLE_ID)
                if premium_role is None:
                    continue

                premium_member_ids = set()
                for role_id in PREMIUM_ACCESS_ROLES:
                    role = guild.get_role(role_id)
                    if role:
                        for m in role.members:
                            premium_member_ids.add(m.id)

                for uid in OWNER_IDS + DEVELOPER_IDS:
                    premium_member_ids.add(uid)

                granted = 0
                revoked = 0

                for member in guild.members:
                    if member.bot:
                        continue
                    try:
                        had, now = await sync_premium_for_member(guild, member)
                        if not had and now:
                            granted += 1
                        elif had and not now:
                            revoked += 1
                    except Exception as e:
                        print(f"⚠️ sync_premium_roles_task member error for {member}: {e}")
                    await asyncio.sleep(0)

                if granted or revoked:
                    print(f"💎 Premium sync in {guild.name}: +{granted} granted, -{revoked} revoked")
            except Exception as e:
                print(f"⚠️ sync_premium_roles_task guild error for {guild}: {e}")
    except Exception as e:
        print(f"⚠️ sync_premium_roles_task outer error: {e}")


# ============================
# SNAPSHOT HELPERS
# ============================

def add_result_snapshot(player, snap_type, result, kills, cr_change, notes=""):
    """Save a pre-result snapshot of all relevant stats."""
    snapshots = player.setdefault("result_snapshots", [])
    snapshot = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "type": snap_type,
        "result": result,
        "kills": kills,
        "cr_change": cr_change,
        "notes": notes,
        # Full stat snapshot
        "cr": player.get("cr", 0),
        "wins": player.get("wins", 0),
        "losses": player.get("losses", 0),
        "kills_total": player.get("kills", 0),
        "matches": player.get("matches", 0),
        "placement_matches": player.get("placement_matches", 0),
        "win_streak": player.get("win_streak", 0),
        "mvp_count": player.get("mvp_count", 0),
        "ranked": player.get("ranked", False),
    }
    snapshots.append(snapshot)
    if len(snapshots) > 20:
        player["result_snapshots"] = snapshots[-20:]


# ============================
# BOT SETUP
# ============================

intents = discord.Intents.default()
intents.members = True
intents.message_content = True

bot = commands.Bot(
    command_prefix="!",
    intents=intents,
    help_command=None,
    case_insensitive=True
)


# ============================
# RANK SYSTEM
# ============================

CR_THRESHOLDS = [
    (0,    "R1 Bronze"),
    (300,  "R2 Silver"),
    (700,  "R3 Gold"),
    (1200, "R4 Platinum"),
    (2000, "R5 All-Star Low"),
    (2800, "R5 All-Star Mid"),
    (3600, "R5 All-Star High"),
    (4500, "R6 Elite"),
    (5500, "R7 Champion"),
]

CR_CAP = 9999


def get_rank(cr):
    rank = "R1 Bronze"
    for threshold, name in CR_THRESHOLDS:
        if cr >= threshold:
            rank = name
    return rank


def get_capped_rank(guild_data, uid):
    player = guild_data.get(uid, {})
    cr = player.get("cr", 0)
    return get_rank(cr)


def clamp(value, min_val, max_val):
    return max(min_val, min(max_val, value))


def get_win_rate(player):
    wins = player.get("wins", 0)
    losses = player.get("losses", 0)
    total = wins + losses
    if total == 0:
        return 0.5
    return wins / total


def get_consistency_bonus(player):
    win_rate = get_win_rate(player)
    streak = player.get("win_streak", 0)
    bonus = 0
    if win_rate >= 0.70:
        bonus += 12
    elif win_rate >= 0.60:
        bonus += 8
    elif win_rate >= 0.55:
        bonus += 3
    if streak >= 5:
        bonus += 8
    elif streak >= 3:
        bonus += 4
    return bonus


def get_cr_modifier(cr):
    if cr < 300:
        return 1.20
    elif cr < 700:
        return 1.10
    elif cr < 1200:
        return 1.00
    elif cr < 2000:
        return 0.90
    elif cr < 2800:
        return 0.80
    elif cr < 3600:
        return 0.70
    elif cr < 4500:
        return 0.60
    else:
        return 0.55


def get_loss_modifier(cr):
    if cr < 300:
        return 0.60
    elif cr < 700:
        return 0.75
    elif cr < 1200:
        return 0.92
    elif cr < 2000:
        return 1.05
    elif cr < 2800:
        return 1.15
    elif cr < 3600:
        return 1.25
    elif cr < 4500:
        return 1.35
    else:
        return 1.40


def calculate_placement_cr(player, result, kills, team_avg=None, enemy_avg=None):
    base_win = 90
    base_loss = 0

    kill_bonus = kills * 3

    if result == "win":
        cr = base_win + kill_bonus
        if team_avg and enemy_avg and enemy_avg > team_avg:
            upset_bonus = int((enemy_avg - team_avg) * 0.05)
            cr += upset_bonus
        cr = clamp(cr, 65, 140)
    else:
        cr = base_loss + kill_bonus
        cr = clamp(cr, 3, 18)

    return cr


def calculate_ranked_cr(player, result, kills, team_avg, enemy_avg):
    player_cr = player.get("cr", 0)
    win_mod = get_cr_modifier(player_cr)
    loss_mod = get_loss_modifier(player_cr)

    diff = enemy_avg - team_avg

    if result == "win":
        base = 30 + (diff * 0.03)
        base *= win_mod
        base += get_consistency_bonus(player)
        base += kills * 1.5
        change = clamp(int(base), 10, 60)
    else:
        base = 25 + (diff * -0.03)
        base *= loss_mod
        base -= kills * 0.5
        change = clamp(int(base), 6, 55)
        change = -change

    return change


# ============================
# ROLE HELPERS
# ============================

def has_any_role(member, role_ids):
    return any(role.id in role_ids for role in member.roles)


def is_owner(member):
    return member.id in OWNER_IDS


def is_developer(member):
    return member.id in DEVELOPER_IDS


def is_staff(member):
    return is_owner(member) or is_developer(member) or has_any_role(member, STAFF_ROLE_IDS)


def is_league_host(member):
    return is_staff(member) or has_any_role(member, LEAGUE_HOST_ROLE_IDS)


async def remove_all_rank_roles(member):
    for role_name, role_id in RANK_ROLES.items():
        role = member.guild.get_role(role_id)
        if role and role in member.roles:
            try:
                await member.remove_roles(role)
            except Exception:
                pass


async def apply_rank_role(member, rank_name):
    await remove_all_rank_roles(member)
    role_id = RANK_ROLES.get(rank_name)
    if role_id:
        role = member.guild.get_role(role_id)
        if role:
            try:
                await member.add_roles(role)
            except Exception:
                pass


async def apply_placement_role(member):
    role = member.guild.get_role(PLACEMENTS_ROLE_ID)
    if role:
        try:
            await member.add_roles(role)
        except Exception:
            pass


# ============================
# UTILITY HELPERS
# ============================

def is_suspended(player):
    if not player.get("suspended_until"):
        return False
    return datetime.now() < datetime.fromisoformat(player["suspended_until"])


def cleanup_history_month(player):
    cutoff = datetime.now() - timedelta(days=30)
    history = player.get("history", [])
    new_history = []
    for entry in history:
        try:
            ts_str = entry.split(" - ")[0]
            ts = datetime.strptime(ts_str, "%Y-%m-%d %H:%M")
            if ts >= cutoff:
                new_history.append(entry)
        except Exception:
            new_history.append(entry)
    player["history"] = new_history


def add_history(player, text):
    cleanup_history_month(player)

    player["history"].append(
        f"{datetime.now().strftime('%Y-%m-%d %H:%M')} - {text}"
    )

    if len(player["history"]) > 75:
        player["history"] = player["history"][-75:]


def make_panel(title, description, color=discord.Color.blurple()):
    return discord.Embed(title=title, description=description, color=color)


# ============================
# HELP / COMMANDS MENU
# ============================

def command_category_embed(category):
    embed = discord.Embed(
        title="📖 EAS Ranked Commands",
        description=f"Showing: **{category.capitalize()}** commands",
        color=discord.Color.blurple()
    )

    if category == "player":
        embed.add_field(
            name="👤 Player Commands",
            value=(
                "```"
                "!joinrank       Join ranked placements\n"
                "!register       Register for ranked (alias for !joinrank)\n"
                "!rank           Interactive personal profile\n"
                "!progress       See next-rank progress\n"
                "!nexttier       Same as progress\n"
                "!ranks          Interactive rank ladder\n"
                "!rankinfo R5    View info for a rank tier\n"
                "!performance    View your performance grade\n"
                "!compare @user  Compare yourself to someone\n"
                "!recentmatches  View your recent history"
                "```"
            ),
            inline=False
        )

    elif category == "boards":
        embed.add_field(
            name="🏆 Competitive Boards",
            value=(
                "```"
                "!leaderboard    Top ranked players\n"
                "!placements     Players in placements"
                "```"
            ),
            inline=False
        )

    elif category == "host":
        embed.add_field(
            name="🎮 League Host Commands",
            value=(
                "```"
                "!placement @user win/loss kills notes\n"
                "!teamplacement @w1 k @w2 k vs @l1 k @l2 k notes\n"
                "!rankgame @w1 @w2 vs @l1 @l2\n"
                "!addmvp @user reason\n"
                "!note @user note\n"
                "!resetplacements @user"
                "```"
            ),
            inline=False
        )

    elif category == "staff":
        embed.add_field(
            name="🛡️ Staff Commands",
            value=(
                "```"
                "!setrank @user rank\n"
                "!addcr @user +/-amount\n"
                "!suspend @user days reason\n"
                "!unsuspend @user\n"
                "!blacklist @user reason\n"
                "!unblacklist @user\n"
                "!killfarming @user\n"
                "!resetplayer @user\n"
                "!flag @user reason\n"
                "!fullhistory @user\n"
                "!clearhistory @user\n"
                "!rollback @user\n"
                "!teamrollback @u1 @u2 ...\n"
                "!scrimrollback @u1 @u2 ..."
                "```"
            ),
            inline=False
        )

        embed.add_field(
            name="🔍 Data Tools",
            value=(
                "```"
                "!datacheck          Show guild DB stats\n"
                "!playercheck @user  Show all fields for a player"
                "```"
            ),
            inline=False
        )
        embed.add_field(
            name="🏅 Badge Lookup",
            value=(
                "```"
                "!badgelist <user>   List all badges for a player"
                "```"
            ),
            inline=False
        )

    elif category == "owner":
        embed.add_field(
            name="👑 Owner Commands",
            value=(
                "```"
                "!addcr @user +/-amount\n"
                "!resetall confirm\n"
                "!extendplacements\n"
                "!validatedata\n"
                "!datacheck\n"
                "!playercheck @user"
                "```"
            ),
            inline=False
        )

    elif category == "developer":
        embed.add_field(
            name="🧑‍💻 Developer Commands",
            value=(
                "```"
                "!devhelp\n"
                "!dbstatus\n"
                "!syncbackup\n"
                "!exportdata\n"
                "!botstats\n"
                "!update\n"
                "!maintenance <message>"
                "```"
            ),
            inline=False
        )
        embed.add_field(
            name="🏅 Badge & Premium Commands",
            value=(
                "```"
                "!badgeassign <user> <badge>   Assign a badge to a player\n"
                "!badgeremove <user> <badge>   Remove a badge from a player\n"
                "!badgelist <user>             List all badges for a player\n"
                "!premiumcheck <user>          Check premium status and sync\n"
                "!addbadges \"Badge\" @u1 @u2    Award badge to multiple players\n"
                "!badges                       List all available badges"
                "```"
            ),
            inline=False
        )

    return embed


# ============================
# ON READY
# ============================

@bot.event
async def on_ready():
    print(f"✅ Logged in as {bot.user}")
    init_database()
    try:
        synced = await bot.tree.sync()
        print(f"✅ Synced {len(synced)} slash command(s).")
    except Exception as e:
        print(f"⚠️ Failed to sync slash commands: {e}")

    if not sync_premium_roles_task.is_running():
        sync_premium_roles_task.start()
        print("🔄 Premium role sync task started (every 1 minute).")
    print("✅ BOT CONNECTED SUCCESSFULLY")
    print(f"Logged in as: {bot.user}")


@bot.event
async def on_member_update(before: discord.Member, after: discord.Member):
    before_had_premium_role = has_any_role(before, PREMIUM_ACCESS_ROLES)
    after_has_premium_role = has_any_role(after, PREMIUM_ACCESS_ROLES)

    if before_had_premium_role != after_has_premium_role:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: None)
        had, now = await sync_premium_for_member(after.guild, after)
        if not had and now:
            print(f"💎 [on_member_update] Premium GRANTED to {after} ({after.id}) in guild {after.guild.id}")
        elif had and not now:
            print(f"💎 [on_member_update] Premium REVOKED from {after} ({after.id}) in guild {after.guild.id}")


# ============================
# COMMANDS MENU
# ============================

@bot.command()
async def commands(ctx):
    categories = ["player", "boards", "host", "staff", "owner", "developer"]
    options = [
        discord.SelectOption(label=cat.capitalize(), value=cat)
        for cat in categories
    ]

    class CategorySelect(discord.ui.Select):
        def __init__(self):
            super().__init__(placeholder="Choose a category...", options=options)

        async def callback(self, interaction: discord.Interaction):
            embed = command_category_embed(self.values[0])
            await interaction.response.edit_message(embed=embed)

    class CategoryView(discord.ui.View):
        def __init__(self):
            super().__init__(timeout=60)
            self.add_item(CategorySelect())

    embed = command_category_embed("player")
    await ctx.send(embed=embed, view=CategoryView())


# ============================
# PLAYER COMMANDS
# ============================

@bot.command()
async def joinrank(ctx):
    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(ctx.author.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    if player.get("blacklisted", False):
        await ctx.send("❌ You are blacklisted and cannot join ranked.")
        return

    if player.get("registered", False):
        await ctx.send("⚠️ You are already registered.")
        return

    player["registered"] = True
    player["placement_matches"] = 0
    player["ranked"] = False

    ensure_profile_fields(ctx.author, player)
    await apply_placement_role(ctx.author)

    save_player_to_db_only(ctx.guild.id, ctx.author.id, player)
    await send_webhook_to_website(ctx.author.id, player)

    await ctx.send("✅ You have joined ranked and received the **Placements** role.")


@bot.command()
async def register(ctx):
    """Alias for !joinrank."""
    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(ctx.author.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    if player.get("blacklisted", False):
        await ctx.send("❌ You are blacklisted and cannot register.")
        return

    if player.get("registered", False):
        await ctx.send("⚠️ You are already registered.")
        return

    player["registered"] = True
    player["placement_matches"] = 0
    player["ranked"] = False

    ensure_profile_fields(ctx.author, player)
    await apply_placement_role(ctx.author)

    save_player_to_db_only(ctx.guild.id, ctx.author.id, player)
    await send_webhook_to_website(ctx.author.id, player)

    await ctx.send("✅ You have been registered for ranked and received the **Placements** role.")


@bot.command()
async def rank(ctx, user: discord.Member = None):
    target = user or ctx.author
    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(target.id)

    if uid not in guild_data:
        await ctx.send(f"❌ {target.mention} is not registered.")
        return

    player = normalize_player(guild_data[uid])

    if not player.get("registered", False):
        await ctx.send(f"❌ {target.mention} is not registered.")
        return

    cr = player.get("cr", 0)
    rank_name = get_rank(cr)
    wins = player.get("wins", 0)
    losses = player.get("losses", 0)
    kills = player.get("kills", 0)
    matches = player.get("matches", 0)
    placement_matches = player.get("placement_matches", 0)
    ranked = player.get("ranked", False)
    win_streak = player.get("win_streak", 0)
    mvp_count = player.get("mvp_count", 0)

    embed = discord.Embed(
        title=f"📊 {target.display_name}'s Profile",
        color=discord.Color.gold()
    )
    embed.set_thumbnail(url=target.display_avatar.url)

    if ranked:
        embed.add_field(name="🏆 Rank", value=rank_name, inline=True)
        embed.add_field(name="⭐ CR", value=str(cr), inline=True)
    else:
        embed.add_field(name="📋 Status", value="In Placements", inline=True)
        embed.add_field(name="🎮 Placement Matches", value=f"{placement_matches}/7", inline=True)

    embed.add_field(name="✅ Wins", value=str(wins), inline=True)
    embed.add_field(name="❌ Losses", value=str(losses), inline=True)
    embed.add_field(name="🔫 Kills", value=str(kills), inline=True)
    embed.add_field(name="🎮 Matches", value=str(matches), inline=True)
    embed.add_field(name="🔥 Win Streak", value=str(win_streak), inline=True)
    embed.add_field(name="🏅 MVPs", value=str(mvp_count), inline=True)

    badges = player.get("badges", [])
    if badges:
        embed.add_field(name="🎖️ Badges", value=", ".join(badges), inline=False)

    embed.set_footer(text="EAS Ranked System")
    await ctx.send(embed=embed)


@bot.command()
async def progress(ctx, user: discord.Member = None):
    target = user or ctx.author
    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(target.id)

    if uid not in guild_data:
        await ctx.send(f"❌ {target.mention} is not registered.")
        return

    player = normalize_player(guild_data[uid])
    cr = player.get("cr", 0)
    rank_name = get_rank(cr)

    next_threshold = None
    next_rank = None
    for threshold, name in CR_THRESHOLDS:
        if cr < threshold:
            next_threshold = threshold
            next_rank = name
            break

    if next_threshold is None:
        await ctx.send(f"🏆 {target.mention} is at the **maximum rank**: {rank_name} ({cr} CR)")
        return

    needed = next_threshold - cr
    embed = discord.Embed(
        title=f"📈 {target.display_name}'s Progress",
        color=discord.Color.green()
    )
    embed.add_field(name="Current Rank", value=rank_name, inline=True)
    embed.add_field(name="Current CR", value=str(cr), inline=True)
    embed.add_field(name="Next Rank", value=next_rank, inline=True)
    embed.add_field(name="CR Needed", value=str(needed), inline=True)
    await ctx.send(embed=embed)


@bot.command()
async def nexttier(ctx, user: discord.Member = None):
    await progress(ctx, user)


@bot.command()
async def ranks(ctx):
    embed = discord.Embed(
        title="🏆 EAS Rank Ladder",
        color=discord.Color.gold()
    )
    for threshold, name in CR_THRESHOLDS:
        embed.add_field(name=name, value=f"{threshold}+ CR", inline=True)
    await ctx.send(embed=embed)


@bot.command()
async def rankinfo(ctx, *, rank_name: str = None):
    if not rank_name:
        await ctx.send("❌ Usage: `!rankinfo <rank name>`")
        return

    for threshold, name in CR_THRESHOLDS:
        if rank_name.lower() in name.lower():
            embed = discord.Embed(title=f"ℹ️ {name}", color=discord.Color.blurple())
            embed.add_field(name="CR Required", value=f"{threshold}+", inline=True)
            await ctx.send(embed=embed)
            return

    await ctx.send(f"❌ Rank `{rank_name}` not found.")


@bot.command()
async def performance(ctx, user: discord.Member = None):
    target = user or ctx.author
    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(target.id)

    if uid not in guild_data:
        await ctx.send(f"❌ {target.mention} is not registered.")
        return

    player = normalize_player(guild_data[uid])
    wins = player.get("wins", 0)
    losses = player.get("losses", 0)
    kills = player.get("kills", 0)
    matches = player.get("matches", 0)

    total = wins + losses
    win_rate = (wins / total * 100) if total > 0 else 0
    kpm = (kills / matches) if matches > 0 else 0

    if win_rate >= 70:
        grade = "S"
    elif win_rate >= 60:
        grade = "A"
    elif win_rate >= 50:
        grade = "B"
    elif win_rate >= 40:
        grade = "C"
    else:
        grade = "D"

    embed = discord.Embed(
        title=f"📊 {target.display_name}'s Performance",
        color=discord.Color.blurple()
    )
    embed.add_field(name="Win Rate", value=f"{win_rate:.1f}%", inline=True)
    embed.add_field(name="KPM", value=f"{kpm:.2f}", inline=True)
    embed.add_field(name="Grade", value=grade, inline=True)
    await ctx.send(embed=embed)


@bot.command()
async def compare(ctx, user: discord.Member):
    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid1 = str(ctx.author.id)
    uid2 = str(user.id)

    p1 = normalize_player(guild_data.get(uid1, make_player()))
    p2 = normalize_player(guild_data.get(uid2, make_player()))

    embed = discord.Embed(
        title=f"⚔️ {ctx.author.display_name} vs {user.display_name}",
        color=discord.Color.red()
    )
    embed.add_field(name=f"{ctx.author.display_name} CR", value=str(p1.get("cr", 0)), inline=True)
    embed.add_field(name="vs", value="⚔️", inline=True)
    embed.add_field(name=f"{user.display_name} CR", value=str(p2.get("cr", 0)), inline=True)
    embed.add_field(name=f"{ctx.author.display_name} W/L", value=f"{p1.get('wins',0)}/{p1.get('losses',0)}", inline=True)
    embed.add_field(name="\u200b", value="\u200b", inline=True)
    embed.add_field(name=f"{user.display_name} W/L", value=f"{p2.get('wins',0)}/{p2.get('losses',0)}", inline=True)
    await ctx.send(embed=embed)


@bot.command()
async def recentmatches(ctx, user: discord.Member = None):
    target = user or ctx.author
    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(target.id)

    if uid not in guild_data:
        await ctx.send(f"❌ {target.mention} is not registered.")
        return

    player = normalize_player(guild_data[uid])
    history = player.get("history", [])

    if not history:
        await ctx.send(f"📋 {target.mention} has no match history.")
        return

    recent = history[-10:]
    recent.reverse()

    embed = discord.Embed(
        title=f"📋 Recent Matches — {target.display_name}",
        description="\n".join(recent),
        color=discord.Color.blurple()
    )
    await ctx.send(embed=embed)


# ============================
# LEADERBOARD / PLACEMENTS
# ============================

@bot.command()
async def leaderboard(ctx):
    data = load_data()
    guild_data = get_guild_data(ctx, data)

    ranked_players = []
    for uid, player in guild_data.items():
        if player.get("ranked", False) and not player.get("blacklisted", False):
            ranked_players.append((uid, player.get("cr", 0)))

    if not ranked_players:
        await ctx.send("📋 No ranked players yet.")
        return

    ranked_players.sort(key=lambda x: x[1], reverse=True)

    per_page = 10
    pages = []
    total_pages = (len(ranked_players) + per_page - 1) // per_page

    for i in range(0, len(ranked_players), per_page):
        chunk = ranked_players[i:i + per_page]
        page_number = len(pages) + 1
        embed = discord.Embed(
            title=f"🏆 EAS Ranked Leaderboard — Page {page_number}/{total_pages}",
            color=discord.Color.gold()
        )
        for rank_pos, (uid, cr) in enumerate(chunk, start=i + 1):
            member = ctx.guild.get_member(int(uid))
            name = member.display_name if member else f"User {uid}"
            rank_name = get_rank(cr)
            embed.add_field(
                name=f"#{rank_pos} {name}",
                value=f"{cr} CR | {rank_name}",
                inline=False
            )
        pages.append(embed)

    current_page = 0
    message = await ctx.send(embed=pages[current_page])

    if len(pages) == 1:
        return

    await message.add_reaction("⬅️")
    await message.add_reaction("➡️")

    def check(reaction, user):
        return (
            user == ctx.author
            and reaction.message.id == message.id
            and str(reaction.emoji) in ["⬅️", "➡️"]
        )

    while True:
        try:
            reaction, user = await bot.wait_for("reaction_add", timeout=60, check=check)
            if str(reaction.emoji) == "➡️":
                current_page = min(current_page + 1, len(pages) - 1)
            else:
                current_page = max(current_page - 1, 0)
            await message.edit(embed=pages[current_page])
            await message.remove_reaction(reaction, user)
        except asyncio.TimeoutError:
            break


@bot.command()
async def placements(ctx):
    data = load_data()
    guild_data = get_guild_data(ctx, data)

    players_in_placements = []
    for uid, player in guild_data.items():
        if player.get("registered", False) and not player.get("ranked", False) and not player.get("blacklisted", False):
            players_in_placements.append((uid, player.get("placement_matches", 0)))

    if not players_in_placements:
        await ctx.send("✅ No players are currently in placements.")
        return

    players_in_placements.sort(key=lambda item: item[1], reverse=True)

    per_page = 15
    pages = []
    total_pages = (len(players_in_placements) + per_page - 1) // per_page

    for i in range(0, len(players_in_placements), per_page):
        chunk = players_in_placements[i:i + per_page]
        page_number = len(pages) + 1
        embed = discord.Embed(
            title=f"📋 Players in Placements — Page {page_number}/{total_pages}",
            color=discord.Color.blurple()
        )
        for uid, matches in chunk:
            member = ctx.guild.get_member(int(uid))
            name = member.display_name if member else f"User {uid}"
            embed.add_field(name=name, value=f"{matches}/7 matches", inline=True)
        pages.append(embed)

    current_page = 0
    message = await ctx.send(embed=pages[current_page])

    if len(pages) == 1:
        return

    await message.add_reaction("⬅️")
    await message.add_reaction("➡️")

    def check(reaction, user):
        return (
            user == ctx.author
            and reaction.message.id == message.id
            and str(reaction.emoji) in ["⬅️", "➡️"]
        )

    while True:
        try:
            reaction, user = await bot.wait_for("reaction_add", timeout=60, check=check)
            if str(reaction.emoji) == "➡️":
                current_page = min(current_page + 1, len(pages) - 1)
            else:
                current_page = max(current_page - 1, 0)
            await message.edit(embed=pages[current_page])
            await message.remove_reaction(reaction, user)
        except asyncio.TimeoutError:
            break


# ============================
# CONFIRMATION HELPERS
# ============================

async def send_confirmation_embed(ctx, embed, timeout=10):
    """
    Send an embed with ✅/❌ reactions and wait for the invoker to confirm.
    Returns True if confirmed, False if cancelled or timed out.
    timeout: seconds to wait (default 10 for result entry, 20 for rollback)
    """
    embed.set_footer(text=f"React ✅ to confirm or ❌ to cancel — {timeout} seconds")
    msg = await ctx.send(embed=embed)
    await msg.add_reaction("✅")
    await msg.add_reaction("❌")

    def check(reaction, user):
        return (
            user == ctx.author
            and reaction.message.id == msg.id
            and str(reaction.emoji) in ["✅", "❌"]
        )

    try:
        reaction, user = await bot.wait_for("reaction_add", timeout=timeout, check=check)
        confirmed = str(reaction.emoji) == "✅"
        try:
            await msg.clear_reactions()
        except Exception:
            pass
        if confirmed:
            await msg.edit(embed=discord.Embed(
                title="✅ Confirmed",
                description="Results have been locked in.",
                color=discord.Color.green()
            ))
        else:
            await msg.edit(embed=discord.Embed(
                title="❌ Cancelled",
                description="Action cancelled. No changes were made.",
                color=discord.Color.red()
            ))
        return confirmed
    except asyncio.TimeoutError:
        try:
            await msg.clear_reactions()
        except Exception:
            pass
        await msg.edit(embed=discord.Embed(
            title="⏰ Timed Out",
            description="No response received. Action cancelled.",
            color=discord.Color.orange()
        ))
        return False


# ============================
# HOST COMMANDS
# ============================

@bot.command()
async def placement(ctx, user: discord.Member, result: str, kills: int = 0, *, notes: str = ""):
    if not is_league_host(ctx.author):
        await ctx.send("❌ Only League Hosts can log placement matches.")
        return

    result = result.lower()
    if result not in ("win", "loss", "w", "l"):
        await ctx.send("❌ Result must be `win` or `loss`.")
        return

    result = "win" if result in ("win", "w") else "loss"

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    if not player.get("registered", False):
        await ctx.send(f"❌ {user.mention} must use `!joinrank` first.")
        return

    if player.get("blacklisted", False):
        await ctx.send(f"❌ {user.mention} is blacklisted.")
        return

    if is_suspended(player):
        await ctx.send(f"❌ {user.mention} is suspended.")
        return

    if player.get("ranked", False):
        await ctx.send(f"❌ {user.mention} is already ranked. Use `!rankgame` instead.")
        return

    cr_change = calculate_placement_cr(player, result, kills)
    new_cr = player.get("cr", 0) + cr_change
    new_matches = player.get("placement_matches", 0) + 1
    will_rank = new_matches >= 7

    # ── 10-second review embed ──────────────────────────────────────────────
    review_embed = discord.Embed(
        title="📋 Placement Result — Review Before Confirming",
        description=f"Please verify the stats below for **{user.display_name}** are correct.",
        color=discord.Color.orange()
    )
    review_embed.add_field(name="👤 Player", value=user.mention, inline=True)
    review_embed.add_field(name="🎮 Result", value=result.upper(), inline=True)
    review_embed.add_field(name="🔫 Kills", value=str(kills), inline=True)
    review_embed.add_field(name="⭐ CR Change", value=f"+{cr_change}", inline=True)
    review_embed.add_field(name="📊 CR", value=f"{player.get('cr', 0)} → {new_cr}", inline=True)
    review_embed.add_field(
        name="🎮 Placement Matches",
        value=f"{player.get('placement_matches', 0)} → {new_matches}/7",
        inline=True
    )
    if result == "win":
        review_embed.add_field(
            name="✅ Wins",
            value=f"{player.get('wins', 0)} → {player.get('wins', 0) + 1}",
            inline=True
        )
    else:
        review_embed.add_field(
            name="❌ Losses",
            value=f"{player.get('losses', 0)} → {player.get('losses', 0) + 1}",
            inline=True
        )
    review_embed.add_field(
        name="🎮 Total Matches",
        value=f"{player.get('matches', 0)} → {player.get('matches', 0) + 1}",
        inline=True
    )
    if will_rank:
        review_embed.add_field(
            name="🏆 Rank Promotion",
            value=f"Player will be promoted to **{get_rank(new_cr)}**!",
            inline=False
        )
    if notes:
        review_embed.add_field(name="📝 Notes", value=notes[:200], inline=False)

    confirmed = await send_confirmation_embed(ctx, review_embed, timeout=10)
    if not confirmed:
        return

    # ── Apply stats ─────────────────────────────────────────────────────────
    add_result_snapshot(player, "placement", result, kills, cr_change, notes)

    player["cr"] = new_cr
    player["kills"] += kills
    player["matches"] += 1
    player["placement_matches"] = new_matches

    if result == "win":
        player["wins"] += 1
        player["win_streak"] = player.get("win_streak", 0) + 1
    else:
        player["losses"] += 1
        player["win_streak"] = 0

    if notes:
        player["notes"].append({"time": datetime.now().isoformat(), "text": notes})

    if will_rank:
        player["ranked"] = True
        rank_name = get_rank(new_cr)
        member = ctx.guild.get_member(int(uid))
        if member:
            await remove_all_rank_roles(member)
            await apply_rank_role(member, rank_name)
        add_history(player, f"Placement {result.upper()} | +{cr_change} CR ({kills} kills) | Promoted to {rank_name}")
    else:
        add_history(player, f"Placement {result.upper()} | +{cr_change} CR ({kills} kills) | {new_matches}/7 matches")

    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    result_embed = discord.Embed(
        title=f"✅ Placement Logged — {user.display_name}",
        color=discord.Color.green()
    )
    result_embed.add_field(name="Result", value=result.upper(), inline=True)
    result_embed.add_field(name="Kills", value=str(kills), inline=True)
    result_embed.add_field(name="CR", value=f"+{cr_change} → {new_cr}", inline=True)
    result_embed.add_field(name="Matches", value=f"{new_matches}/7", inline=True)
    if will_rank:
        result_embed.add_field(name="🏆 Promoted!", value=get_rank(new_cr), inline=False)
    await ctx.send(embed=result_embed)


@bot.command()
async def teamplacement(ctx, *args):
    if not is_league_host(ctx.author):
        await ctx.send("❌ Only League Hosts can log team placement matches.")
        return

    text = " ".join(str(a) for a in args)

    if "vs" not in text.lower():
        await ctx.send("❌ Format: `!teamplacement @w1 kills @w2 kills vs @l1 kills @l2 kills [notes]`")
        return

    parts = text.split("vs", 1)
    winners_text = parts[0].strip()
    losers_text = parts[1].strip()

    notes = ""
    # Extract notes (text after last kill count on losers side)
    # Simple approach: notes are any non-mention, non-number text at the end

    data = load_data()
    guild_data = get_guild_data(ctx, data)

    def parse_team(text_part):
        tokens = text_part.split()
        players = []
        i = 0
        while i < len(tokens):
            token = tokens[i]
            if token.startswith("<@") and token.endswith(">"):
                uid_str = token.replace("<@", "").replace("<@!", "").replace(">", "")
                try:
                    uid = int(uid_str)
                    kills = 0
                    if i + 1 < len(tokens):
                        try:
                            kills = int(tokens[i + 1])
                            i += 1
                        except ValueError:
                            pass
                    players.append((str(uid), kills))
                except ValueError:
                    pass
            i += 1
        return players

    winners = parse_team(winners_text)
    losers = parse_team(losers_text)

    if not winners or not losers:
        await ctx.send("❌ Could not parse players. Format: `!teamplacement @w1 kills @w2 kills vs @l1 kills @l2 kills`")
        return

    # Validate all players
    errors = []
    all_players = winners + losers
    for uid, kills in all_players:
        if uid not in guild_data:
            guild_data[uid] = make_player()
        player = normalize_player(guild_data[uid])
        guild_data[uid] = player
        if not player.get("registered", False):
            member = ctx.guild.get_member(int(uid))
            name = member.display_name if member else uid
            errors.append(f"{name} is not registered")
        if player.get("blacklisted", False):
            member = ctx.guild.get_member(int(uid))
            name = member.display_name if member else uid
            errors.append(f"{name} is blacklisted")

    if errors:
        await ctx.send("❌ " + "\n".join(errors))
        return

    # Calculate CR changes
    winner_crs = [guild_data[uid].get("cr", 0) for uid, _ in winners]
    loser_crs = [guild_data[uid].get("cr", 0) for uid, _ in losers]
    winner_avg = sum(winner_crs) / len(winner_crs) if winner_crs else 0
    loser_avg = sum(loser_crs) / len(loser_crs) if loser_crs else 0

    winner_changes = []
    loser_changes = []

    for uid, kills in winners:
        player = guild_data[uid]
        cr_change = calculate_placement_cr(player, "win", kills, winner_avg, loser_avg)
        winner_changes.append((uid, kills, cr_change))

    for uid, kills in losers:
        player = guild_data[uid]
        cr_change = calculate_placement_cr(player, "loss", kills, loser_avg, winner_avg)
        loser_changes.append((uid, kills, cr_change))

    # ── 10-second review embed ──────────────────────────────────────────────
    review_embed = discord.Embed(
        title="📋 Team Placement — Review Before Confirming",
        description="Please verify the stats below are correct.",
        color=discord.Color.orange()
    )

    winners_preview = ""
    for uid, kills, cr_change in winner_changes:
        member = ctx.guild.get_member(int(uid))
        name = member.display_name if member else uid
        player = guild_data[uid]
        new_cr = player.get("cr", 0) + cr_change
        new_matches = player.get("placement_matches", 0) + 1
        winners_preview += f"**{name}** — {kills} kills | +{cr_change} CR → {new_cr} CR | {new_matches}/7 matches\n"

    losers_preview = ""
    for uid, kills, cr_change in loser_changes:
        member = ctx.guild.get_member(int(uid))
        name = member.display_name if member else uid
        player = guild_data[uid]
        new_cr = player.get("cr", 0) + cr_change
        new_matches = player.get("placement_matches", 0) + 1
        losers_preview += f"**{name}** — {kills} kills | +{cr_change} CR → {new_cr} CR | {new_matches}/7 matches\n"

    review_embed.add_field(name="🏆 Winners", value=winners_preview or "None", inline=False)
    review_embed.add_field(name="❌ Losers", value=losers_preview or "None", inline=False)

    confirmed = await send_confirmation_embed(ctx, review_embed, timeout=10)
    if not confirmed:
        return

    # ── Apply stats ─────────────────────────────────────────────────────────
    result_lines = []

    for uid, kills, cr_change in winner_changes:
        player = guild_data[uid]
        add_result_snapshot(player, "placement", "win", kills, cr_change, notes)
        player["cr"] += cr_change
        player["kills"] += kills
        player["matches"] += 1
        player["wins"] += 1
        player["win_streak"] = player.get("win_streak", 0) + 1
        player["placement_matches"] = player.get("placement_matches", 0) + 1

        new_matches = player["placement_matches"]
        if new_matches >= 7:
            player["ranked"] = True
            rank_name = get_rank(player["cr"])
            member = ctx.guild.get_member(int(uid))
            if member:
                await remove_all_rank_roles(member)
                await apply_rank_role(member, rank_name)
            add_history(player, f"Team Placement WIN | +{cr_change} CR ({kills} kills) | Promoted to {rank_name}")
            result_lines.append(f"✅ {member.display_name if member else uid}: +{cr_change} CR → {player['cr']} CR | 🏆 Promoted to {rank_name}")
        else:
            add_history(player, f"Team Placement WIN | +{cr_change} CR ({kills} kills) | {new_matches}/7 matches")
            member = ctx.guild.get_member(int(uid))
            result_lines.append(f"✅ {member.display_name if member else uid}: +{cr_change} CR → {player['cr']} CR | {new_matches}/7 matches")

        save_player_to_db_only(ctx.guild.id, uid, player)
        await send_webhook_to_website(uid, player)

    for uid, kills, cr_change in loser_changes:
        player = guild_data[uid]
        add_result_snapshot(player, "placement", "loss", kills, cr_change, notes)
        player["cr"] += cr_change
        player["kills"] += kills
        player["matches"] += 1
        player["losses"] += 1
        player["win_streak"] = 0
        player["placement_matches"] = player.get("placement_matches", 0) + 1

        new_matches = player["placement_matches"]
        if new_matches >= 7:
            player["ranked"] = True
            rank_name = get_rank(player["cr"])
            member = ctx.guild.get_member(int(uid))
            if member:
                await remove_all_rank_roles(member)
                await apply_rank_role(member, rank_name)
            add_history(player, f"Team Placement LOSS | +{cr_change} CR ({kills} kills) | Promoted to {rank_name}")
            result_lines.append(f"❌ {member.display_name if member else uid}: +{cr_change} CR → {player['cr']} CR | 🏆 Promoted to {rank_name}")
        else:
            add_history(player, f"Team Placement LOSS | +{cr_change} CR ({kills} kills) | {new_matches}/7 matches")
            member = ctx.guild.get_member(int(uid))
            result_lines.append(f"❌ {member.display_name if member else uid}: +{cr_change} CR → {player['cr']} CR | {new_matches}/7 matches")

        save_player_to_db_only(ctx.guild.id, uid, player)
        await send_webhook_to_website(uid, player)

    embed = discord.Embed(
        title="✅ Team Placement Logged",
        description="\n".join(result_lines),
        color=discord.Color.green()
    )
    await ctx.send(embed=embed)


@bot.command()
async def reportteam(ctx, *args):
    if not is_league_host(ctx.author):
        await ctx.send("❌ Only League Hosts can report ranked team matches.")
        return

    text = " ".join(str(a) for a in args)

    if "vs" not in text.lower():
        await ctx.send("❌ Format: `!reportteam @team1 vs @team2`\nFirst team is winners, second team is losers.")
        return

    parts = text.split("vs", 1)
    winners_text = parts[0].strip()
    losers_text = parts[1].strip()

    data = load_data()
    guild_data = get_guild_data(ctx, data)

    def parse_mentions(text_part):
        tokens = text_part.split()
        players = []
        for token in tokens:
            if token.startswith("<@") and token.endswith(">"):
                uid_str = token.replace("<@", "").replace("<@!", "").replace(">", "")
                try:
                    players.append(str(int(uid_str)))
                except ValueError:
                    pass
        return players

    winning_team = parse_mentions(winners_text)
    losing_team = parse_mentions(losers_text)

    if not winning_team or not losing_team:
        await ctx.send("❌ Could not parse players.")
        return

    errors = []
    for uid in winning_team + losing_team:
        if uid not in guild_data:
            guild_data[uid] = make_player()
        player = normalize_player(guild_data[uid])
        guild_data[uid] = player
        if not player.get("registered", False):
            member = ctx.guild.get_member(int(uid))
            name = member.display_name if member else uid
            errors.append(f"{name} is not registered")
        if player.get("blacklisted", False):
            member = ctx.guild.get_member(int(uid))
            name = member.display_name if member else uid
            errors.append(f"{name} is blacklisted")
        if not player.get("ranked", False):
            member = ctx.guild.get_member(int(uid))
            name = member.display_name if member else uid
            errors.append(f"{name} is not ranked yet")

    if errors:
        await ctx.send("❌ " + "\n".join(errors))
        return

    winning_avg = sum(guild_data[uid].get("cr", 0) for uid in winning_team) / len(winning_team)
    losing_avg = sum(guild_data[uid].get("cr", 0) for uid in losing_team) / len(losing_team)

    winner_changes = []
    loser_changes = []

    for uid in winning_team:
        player = guild_data[uid]
        change = calculate_ranked_cr(player, "win", 0, winning_avg, losing_avg)
        winner_changes.append((uid, change))

    for uid in losing_team:
        player = guild_data[uid]
        change = calculate_ranked_cr(player, "loss", 0, losing_avg, winning_avg)
        loser_changes.append((uid, change))

    # ── 10-second review embed ──────────────────────────────────────────────
    review_embed = discord.Embed(
        title="📋 Ranked Team Match — Review Before Confirming",
        description="Please verify the stats below are correct.",
        color=discord.Color.orange()
    )

    winners_preview = ""
    for uid, change in winner_changes:
        member = ctx.guild.get_member(int(uid))
        name = member.display_name if member else uid
        player = guild_data[uid]
        new_cr = max(0, player.get("cr", 0) + change)
        winners_preview += f"**{name}** — +{change} CR → {new_cr} CR | {get_rank(new_cr)}\n"

    losers_preview = ""
    for uid, change in loser_changes:
        member = ctx.guild.get_member(int(uid))
        name = member.display_name if member else uid
        player = guild_data[uid]
        new_cr = max(0, player.get("cr", 0) + change)
        losers_preview += f"**{name}** — {change} CR → {new_cr} CR | {get_rank(new_cr)}\n"

    review_embed.add_field(name="🏆 Winners", value=winners_preview or "None", inline=False)
    review_embed.add_field(name="❌ Losers", value=losers_preview or "None", inline=False)

    confirmed = await send_confirmation_embed(ctx, review_embed, timeout=10)
    if not confirmed:
        return

    # ── Apply stats ─────────────────────────────────────────────────────────
    result_lines = []

    for uid, change in winner_changes:
        player = guild_data[uid]
        old_rank = get_capped_rank(guild_data, uid)
        add_result_snapshot(player, "ranked", "win", 0, change)
        player["cr"] = max(0, player["cr"] + change)
        player["wins"] += 1
        player["win_streak"] = player.get("win_streak", 0) + 1
        player["matches"] += 1
        new_rank = get_capped_rank(guild_data, uid)
        member = ctx.guild.get_member(int(uid))
        if member:
            await apply_rank_role(member, new_rank)
        add_history(player, f"Ranked Team Win | +{change} CR | {player['cr']} CR ({new_rank})")
        rank_change = f" 🔺 {old_rank} → {new_rank}" if old_rank != new_rank else ""
        result_lines.append(f"✅ {member.display_name if member else uid}: +{change} CR → {player['cr']} CR | {new_rank}{rank_change}")
        save_player_to_db_only(ctx.guild.id, uid, player)
        await send_webhook_to_website(uid, player)

    for uid, change in loser_changes:
        player = guild_data[uid]
        old_rank = get_capped_rank(guild_data, uid)
        add_result_snapshot(player, "ranked", "loss", 0, change)
        player["cr"] = max(0, player["cr"] + change)
        player["losses"] += 1
        player["win_streak"] = 0
        player["matches"] += 1
        new_rank = get_capped_rank(guild_data, uid)
        member = ctx.guild.get_member(int(uid))
        if member:
            await apply_rank_role(member, new_rank)
        add_history(player, f"Ranked Team Loss | {change} CR | {player['cr']} CR ({new_rank})")
        rank_change = f" 🔻 {old_rank} → {new_rank}" if old_rank != new_rank else ""
        result_lines.append(f"❌ {member.display_name if member else uid}: {change} CR → {player['cr']} CR | {new_rank}{rank_change}")
        save_player_to_db_only(ctx.guild.id, uid, player)
        await send_webhook_to_website(uid, player)

    embed = discord.Embed(
        title="✅ Ranked Team Match Logged",
        description="\n".join(result_lines),
        color=discord.Color.green()
    )
    await ctx.send(embed=embed)


@bot.command()
async def rankgame(ctx, *args):
    if not is_league_host(ctx.author):
        await ctx.send("❌ Only League Hosts can log ranked matches.")
        return

    text = " ".join(str(a) for a in args)

    if "vs" not in text.lower():
        await ctx.send("❌ Format: `!rankgame @w1 @w2 vs @l1 @l2`")
        return

    parts = text.split("vs", 1)
    winners_text = parts[0].strip()
    losers_text = parts[1].strip()

    data = load_data()
    guild_data = get_guild_data(ctx, data)

    def parse_mentions(text_part):
        tokens = text_part.split()
        players = []
        for token in tokens:
            if token.startswith("<@") and token.endswith(">"):
                uid_str = token.replace("<@", "").replace("<@!", "").replace(">", "")
                try:
                    players.append(str(int(uid_str)))
                except ValueError:
                    pass
        return players

    winning_team = parse_mentions(winners_text)
    losing_team = parse_mentions(losers_text)

    if not winning_team or not losing_team:
        await ctx.send("❌ Could not parse players.")
        return

    errors = []
    for uid in winning_team + losing_team:
        if uid not in guild_data:
            guild_data[uid] = make_player()
        player = normalize_player(guild_data[uid])
        guild_data[uid] = player
        if not player.get("registered", False):
            member = ctx.guild.get_member(int(uid))
            name = member.display_name if member else uid
            errors.append(f"{name} is not registered")
        if player.get("blacklisted", False):
            member = ctx.guild.get_member(int(uid))
            name = member.display_name if member else uid
            errors.append(f"{name} is blacklisted")
        if not player.get("ranked", False):
            member = ctx.guild.get_member(int(uid))
            name = member.display_name if member else uid
            errors.append(f"{name} is not ranked yet")

    if errors:
        await ctx.send("❌ " + "\n".join(errors))
        return

    winning_avg = sum(guild_data[uid].get("cr", 0) for uid in winning_team) / len(winning_team)
    losing_avg = sum(guild_data[uid].get("cr", 0) for uid in losing_team) / len(losing_team)

    winner_changes = []
    loser_changes = []

    for uid in winning_team:
        player = guild_data[uid]
        change = calculate_ranked_cr(player, "win", 0, winning_avg, losing_avg)
        winner_changes.append((uid, change))

    for uid in losing_team:
        player = guild_data[uid]
        change = calculate_ranked_cr(player, "loss", 0, losing_avg, winning_avg)
        loser_changes.append((uid, change))

    # ── 10-second review embed ──────────────────────────────────────────────
    review_embed = discord.Embed(
        title="📋 Ranked Game — Review Before Confirming",
        description="Please verify the stats below are correct.",
        color=discord.Color.orange()
    )

    winners_preview = ""
    for uid, change in winner_changes:
        member = ctx.guild.get_member(int(uid))
        name = member.display_name if member else uid
        player = guild_data[uid]
        new_cr = max(0, player.get("cr", 0) + change)
        winners_preview += f"**{name}** — +{change} CR → {new_cr} CR | {get_rank(new_cr)}\n"

    losers_preview = ""
    for uid, change in loser_changes:
        member = ctx.guild.get_member(int(uid))
        name = member.display_name if member else uid
        player = guild_data[uid]
        new_cr = max(0, player.get("cr", 0) + change)
        losers_preview += f"**{name}** — {change} CR → {new_cr} CR | {get_rank(new_cr)}\n"

    review_embed.add_field(name="🏆 Winners", value=winners_preview or "None", inline=False)
    review_embed.add_field(name="❌ Losers", value=losers_preview or "None", inline=False)

    confirmed = await send_confirmation_embed(ctx, review_embed, timeout=10)
    if not confirmed:
        return

    # ── Apply stats ─────────────────────────────────────────────────────────
    results = []

    for uid, change in winner_changes:
        player = guild_data[uid]
        old_rank = get_capped_rank(guild_data, uid)
        add_result_snapshot(player, "ranked", "win", 0, change)
        player["cr"] += change
        player["wins"] += 1
        player["win_streak"] = player.get("win_streak", 0) + 1
        player["matches"] += 1
        new_rank = get_capped_rank(guild_data, uid)
        member = ctx.guild.get_member(int(uid))
        if member:
            await apply_rank_role(member, new_rank)
        add_history(player, f"Ranked game: Win | +{change} CR | {player['cr']} CR ({new_rank})")
        results.append((uid, change, player["cr"], new_rank, old_rank, True))
        save_player_to_db_only(ctx.guild.id, uid, player)
        await send_webhook_to_website(uid, player)

    for uid, change in loser_changes:
        player = guild_data[uid]
        old_rank = get_capped_rank(guild_data, uid)
        add_result_snapshot(player, "ranked", "loss", 0, change)
        player["cr"] += change
        if player["cr"] < 0:
            player["cr"] = 0
        player["losses"] += 1
        player["win_streak"] = 0
        player["matches"] += 1
        new_rank = get_capped_rank(guild_data, uid)
        member = ctx.guild.get_member(int(uid))
        if member:
            await apply_rank_role(member, new_rank)
        add_history(player, f"Ranked game: Loss | {change} CR | {player['cr']} CR ({new_rank})")
        results.append((uid, change, player["cr"], new_rank, old_rank, False))
        save_player_to_db_only(ctx.guild.id, uid, player)
        await send_webhook_to_website(uid, player)

    embed = discord.Embed(
        title="✅ Ranked Game Logged",
        color=discord.Color.green()
    )
    for uid, change, new_cr, new_rank, old_rank, won in results:
        member = ctx.guild.get_member(int(uid))
        name = member.display_name if member else uid
        sign = "+" if change >= 0 else ""
        rank_change = f" → {new_rank}" if old_rank != new_rank else ""
        embed.add_field(
            name=f"{'✅' if won else '❌'} {name}",
            value=f"{sign}{change} CR | {new_cr} CR | {new_rank}{rank_change}",
            inline=False
        )
    await ctx.send(embed=embed)


# ============================
# STAFF COMMANDS
# ============================

@bot.command()
async def setrank(ctx, user: discord.Member, *, rank_name: str):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    matched_rank = None
    for threshold, name in CR_THRESHOLDS:
        if rank_name.lower() in name.lower():
            matched_rank = name
            break

    if not matched_rank:
        await ctx.send(f"❌ Rank `{rank_name}` not found.")
        return

    player["ranked"] = True
    player["cr"] = dict(CR_THRESHOLDS).get(matched_rank, 0)

    await apply_rank_role(user, matched_rank)
    add_history(player, f"Rank set to {matched_rank} by {ctx.author.display_name}")

    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"✅ {user.mention}'s rank set to **{matched_rank}**.")


@bot.command()
async def addcr(ctx, user: discord.Member, amount: int):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    old_cr = player.get("cr", 0)
    player["cr"] = max(0, old_cr + amount)
    new_rank = get_rank(player["cr"])

    member = ctx.guild.get_member(int(uid))
    if member and player.get("ranked", False):
        await apply_rank_role(member, new_rank)

    sign = "+" if amount >= 0 else ""
    add_history(player, f"CR adjusted {sign}{amount} by {ctx.author.display_name} | {old_cr} → {player['cr']} CR")

    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"✅ {user.mention}: {sign}{amount} CR | {old_cr} → **{player['cr']} CR** | {new_rank}")


@bot.command()
async def suspend(ctx, user: discord.Member, days: int, *, reason: str = "No reason given"):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    until = datetime.now() + timedelta(days=days)
    player["suspended_until"] = until.isoformat()
    player["suspension_reason"] = reason

    add_history(player, f"Suspended for {days} days: {reason}")
    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"✅ {user.mention} suspended for **{days} days**. Reason: {reason}")


@bot.command()
async def unsuspend(ctx, user: discord.Member):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        await ctx.send(f"❌ {user.mention} is not registered.")
        return

    player = normalize_player(guild_data[uid])
    player["suspended_until"] = None
    player["suspension_reason"] = None

    add_history(player, f"Suspension lifted by {ctx.author.display_name}")
    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"✅ {user.mention}'s suspension has been lifted.")


@bot.command()
async def blacklist(ctx, user: discord.Member, *, reason: str = "No reason given"):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    player["blacklisted"] = True
    add_history(player, f"Blacklisted by {ctx.author.display_name}: {reason}")
    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"✅ {user.mention} has been blacklisted. Reason: {reason}")


@bot.command()
async def unblacklist(ctx, user: discord.Member):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        await ctx.send(f"❌ {user.mention} is not registered.")
        return

    player = normalize_player(guild_data[uid])
    player["blacklisted"] = False

    add_history(player, f"Blacklist removed by {ctx.author.display_name}")
    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"✅ {user.mention} has been removed from the blacklist.")


@bot.command()
async def killfarming(ctx, user: discord.Member):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    player["kill_farming_reports"] = player.get("kill_farming_reports", 0) + 1
    player["last_killfarm_time"] = datetime.now().isoformat()

    add_history(player, f"Kill farming report #{player['kill_farming_reports']} by {ctx.author.display_name}")
    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"⚠️ Kill farming report logged for {user.mention}. Total reports: {player['kill_farming_reports']}")


@bot.command()
async def resetplayer(ctx, user: discord.Member):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    player = make_player()
    player["registered"] = True
    ensure_profile_fields(user, player)
    guild_data[uid] = player

    await remove_all_rank_roles(user)
    await apply_placement_role(user)

    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"✅ {user.mention}'s stats have been reset.")


@bot.command()
async def flag(ctx, user: discord.Member, *, reason: str):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    add_history(player, f"⚑ Flagged by {ctx.author.display_name}: {reason}")
    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"⚑ {user.mention} has been flagged. Reason: {reason}")


@bot.command()
async def fullhistory(ctx, user: discord.Member):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        await ctx.send(f"❌ {user.mention} is not registered.")
        return

    player = normalize_player(guild_data[uid])
    history = player.get("history", [])

    if not history:
        await ctx.send(f"📋 {user.mention} has no history.")
        return

    per_page = 10
    pages = []
    for i in range(0, len(history), per_page):
        chunk = history[i:i + per_page]
        chunk_reversed = list(reversed(chunk))
        embed = discord.Embed(
            title=f"📋 Full History — {user.display_name}",
            description="\n".join(chunk_reversed),
            color=discord.Color.blurple()
        )
        pages.append(embed)

    current_page = 0
    message = await ctx.send(embed=pages[current_page])

    if len(pages) == 1:
        return

    await message.add_reaction("⬅️")
    await message.add_reaction("➡️")

    def check(reaction, user_r):
        return (
            user_r == ctx.author
            and reaction.message.id == message.id
            and str(reaction.emoji) in ["⬅️", "➡️"]
        )

    while True:
        try:
            reaction, user_r = await bot.wait_for("reaction_add", timeout=60, check=check)
            if str(reaction.emoji) == "➡️":
                current_page = min(current_page + 1, len(pages) - 1)
            else:
                current_page = max(current_page - 1, 0)
            await message.edit(embed=pages[current_page])
            await message.remove_reaction(reaction, user_r)
        except asyncio.TimeoutError:
            break


@bot.command()
async def clearhistory(ctx, user: discord.Member):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        await ctx.send(f"❌ {user.mention} is not registered.")
        return

    player = normalize_player(guild_data[uid])
    player["history"] = []

    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"✅ History cleared for {user.mention}.")


@bot.command()
async def addmvp(ctx, user: discord.Member, *, reason: str = ""):
    if not is_league_host(ctx.author):
        await ctx.send("❌ Only League Hosts can award MVPs.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    player["mvp_count"] = player.get("mvp_count", 0) + 1
    add_history(player, f"MVP awarded by {ctx.author.display_name}" + (f": {reason}" if reason else ""))

    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"🏅 MVP awarded to {user.mention}! Total MVPs: {player['mvp_count']}")


@bot.command()
async def note(ctx, user: discord.Member, *, note_text: str):
    if not is_league_host(ctx.author):
        await ctx.send("❌ Only League Hosts can add notes.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    player["notes"].append({
        "time": datetime.now().isoformat(),
        "text": note_text,
        "by": str(ctx.author)
    })

    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"📝 Note added for {user.mention}.")


@bot.command()
async def resetplacements(ctx, user: discord.Member):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    player["placement_matches"] = 0
    player["ranked"] = False
    player["cr"] = 0

    await remove_all_rank_roles(user)
    await apply_placement_role(user)

    add_history(player, f"Placements reset by {ctx.author.display_name}")
    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    await ctx.send(f"✅ Placements reset for {user.mention}. Placements role applied.")


@bot.command()
async def decrplacements(ctx, user: discord.Member):
    """Decrement a player's placement_matches by 1 (minimum 0).
    If placement_matches drops to 0, reverts the player from ranked back to placements.
    Staff/Owner/Developer only.
    """
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    before = player.get("placement_matches", 0)

    if before <= 0:
        await ctx.send(f"⚠️ {user.mention} already has **0** placement matches. Cannot decrement further.")
        return

    player["placement_matches"] = before - 1
    after = player["placement_matches"]

    if after == 0:
        player["ranked"] = False
        await remove_all_rank_roles(user)
        await apply_placement_role(user)
        role_note = "Player reverted to **Placements** (ranked → False, placements role applied)."
    elif player.get("ranked", False):
        role_note = "Player remains ranked."
    else:
        role_note = "Player remains in placements."

    add_history(player, f"Placement matches decremented from {before} to {after} by {ctx.author.display_name}. {role_note}")
    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    embed = discord.Embed(
        title=f"✅ Placement Matches Decremented — {user.display_name}",
        color=discord.Color.orange()
    )
    embed.add_field(name="Before", value=str(before), inline=True)
    embed.add_field(name="After", value=str(after), inline=True)
    embed.add_field(name="Status", value=role_note, inline=False)
    await ctx.send(embed=embed)


# ============================
# ROLLBACK COMMANDS
# ============================

@bot.command()
async def rollback(ctx, user: discord.Member, snapshot_index: int = None):
    """
    List or restore a player's result snapshots.

    Usage:
      !rollback @user               — list all available snapshots with their index
      !rollback @user <index>       — restore stats from snapshot at that index (1-based)

    Only Staff, Owners, and Developers can use this command.
    """
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff, Owners, or Developers can use `!rollback`.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        await ctx.send(f"❌ {user.mention} has no data.")
        return

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player
    snapshots = player.get("result_snapshots", [])

    if not snapshots:
        await ctx.send(f"❌ {user.mention} has no result snapshots to roll back.")
        return

    # ── No index supplied: list all snapshots ──────────────────────────────
    if snapshot_index is None:
        embed = discord.Embed(
            title=f"📋 Result Snapshots — {user.display_name}",
            description=(
                f"{len(snapshots)} snapshot(s) available.\n"
                f"Use `!rollback {user.mention} <index>` to restore one.\n"
                f"Index **1** is the oldest; index **{len(snapshots)}** is the most recent."
            ),
            color=discord.Color.blurple()
        )
        for i, snap in enumerate(snapshots, start=1):
            snap_type = snap.get("type", "unknown").capitalize()
            snap_result = snap.get("result", "unknown").upper()
            snap_kills = snap.get("kills", 0)
            snap_cr_change = snap.get("cr_change", 0)
            snap_timestamp = snap.get("timestamp", "unknown time")
            snap_notes = snap.get("notes", "") or "—"
            if len(snap_notes) > 100:
                snap_notes = snap_notes[:100] + "..."
            embed.add_field(
                name=f"#{i} — {snap_timestamp}",
                value=(
                    f"Type: {snap_type} | Result: {snap_result}\n"
                    f"Kills: {snap_kills} | CR Change: {snap_cr_change:+d}\n"
                    f"Notes: {snap_notes}"
                ),
                inline=False
            )
        await ctx.send(embed=embed)
        return

    # ── Index supplied: restore that snapshot ──────────────────────────────
    if snapshot_index < 1 or snapshot_index > len(snapshots):
        await ctx.send(f"❌ Invalid index. Must be between 1 and {len(snapshots)}.")
        return

    snapshot = snapshots[snapshot_index - 1]

    snap_type = snapshot.get("type", "unknown").capitalize()
    snap_result = snapshot.get("result", "unknown").upper()
    snap_kills = snapshot.get("kills", 0)
    snap_cr_change = snapshot.get("cr_change", 0)
    snap_timestamp = snapshot.get("timestamp", "unknown time")
    snap_notes = snapshot.get("notes", "") or "—"
    if len(snap_notes) > 100:
        snap_notes = snap_notes[:100] + "..."

    # Show what will be restored
    embed = discord.Embed(
        title=f"🔄 Rollback Preview — {user.display_name}",
        description=f"Snapshot #{snapshot_index} from {snap_timestamp}",
        color=discord.Color.orange()
    )
    embed.add_field(name="Type", value=snap_type, inline=True)
    embed.add_field(name="Result", value=snap_result, inline=True)
    embed.add_field(name="Kills in Match", value=str(snap_kills), inline=True)
    embed.add_field(name="CR Change to Undo", value=f"{snap_cr_change:+d}", inline=True)
    embed.add_field(name="CR", value=f"{player.get('cr', 0)} → {snapshot.get('cr', 0)}", inline=True)
    embed.add_field(name="Wins", value=f"{player.get('wins', 0)} → {snapshot.get('wins', 0)}", inline=True)
    embed.add_field(name="Losses", value=f"{player.get('losses', 0)} → {snapshot.get('losses', 0)}", inline=True)
    embed.add_field(name="Kills Total", value=f"{player.get('kills', 0)} → {snapshot.get('kills_total', 0)}", inline=True)
    embed.add_field(name="Matches", value=f"{player.get('matches', 0)} → {snapshot.get('matches', 0)}", inline=True)
    embed.add_field(name="Placement Matches", value=f"{player.get('placement_matches', 0)} → {snapshot.get('placement_matches', 0)}", inline=True)
    embed.add_field(name="Current Status", value=get_rank(player.get("cr", 0)), inline=True)
    truncated_notes = (snap_notes[:100] + "...") if len(snap_notes) > 100 else snap_notes
    embed.add_field(name="Notes (original)", value=truncated_notes, inline=False)
    embed.set_footer(text="EAS Ranked System • Rollback — stats restored to pre-result state")
    await ctx.send(embed=embed)

    # Restore stats
    player["cr"] = snapshot.get("cr", player.get("cr", 0))
    player["wins"] = snapshot.get("wins", player.get("wins", 0))
    player["losses"] = snapshot.get("losses", player.get("losses", 0))
    player["kills"] = snapshot.get("kills_total", player.get("kills", 0))
    player["matches"] = snapshot.get("matches", player.get("matches", 0))
    player["placement_matches"] = snapshot.get("placement_matches", player.get("placement_matches", 0))
    player["win_streak"] = snapshot.get("win_streak", player.get("win_streak", 0))
    player["mvp_count"] = snapshot.get("mvp_count", player.get("mvp_count", 0))
    player["ranked"] = snapshot.get("ranked", player.get("ranked", False))

    # Remove the used snapshot
    player["result_snapshots"].pop(snapshot_index - 1)

    # Update roles
    member = ctx.guild.get_member(int(uid))
    if member:
        if player.get("ranked", False):
            await apply_rank_role(member, get_rank(player["cr"]))
        else:
            await remove_all_rank_roles(member)
            await apply_placement_role(member)

    add_history(player, f"Rollback: {snap_type} {snap_result} ({snap_kills} kills, {snap_cr_change:+d} CR) by {ctx.author.display_name}")

    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)


@bot.command()
async def teamrollback(ctx, *users: discord.Member):
    """
    Roll back the most recent result for multiple players at once.
    Validates all snapshots are from the same match (within 5 minutes).
    Usage: !teamrollback @p1 @p2 ...
    """
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff, Owners, or Developers can use `!teamrollback`.")
        return

    if not users:
        await ctx.send("❌ Please mention at least one player.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)

    players_data = []
    errors = []

    for user in users:
        uid = str(user.id)
        if uid not in guild_data:
            errors.append(f"{user.mention} has no data.")
            continue
        player = normalize_player(guild_data[uid])
        guild_data[uid] = player
        snapshots = player.get("result_snapshots", [])
        if not snapshots:
            errors.append(f"{user.mention} has no snapshots.")
            continue
        players_data.append((user, uid, player, snapshots[-1]))

    if errors:
        await ctx.send("❌ " + "\n".join(errors))
        return

    if not players_data:
        await ctx.send("❌ No valid players found.")
        return

    # Check all snapshots are within 5 minutes of each other
    timestamps = []
    for _, _, _, snap in players_data:
        try:
            ts = datetime.strptime(snap.get("timestamp", ""), "%Y-%m-%d %H:%M")
            timestamps.append(ts)
        except Exception:
            pass

    if len(timestamps) > 1:
        time_diff = max(timestamps) - min(timestamps)
        if time_diff.total_seconds() > 300:
            await ctx.send("⚠️ Snapshots are more than 5 minutes apart. These may not be from the same match. Proceeding anyway...")

    # Build preview embed
    embed = discord.Embed(
        title="🔄 Team Rollback Preview",
        description=f"Rolling back {len(players_data)} player(s).",
        color=discord.Color.orange()
    )

    for user, uid, player, snap in players_data:
        snap_type = snap.get("type", "unknown").capitalize()
        snap_result = snap.get("result", "unknown").upper()
        snap_kills = snap.get("kills", 0)
        snap_cr_change = snap.get("cr_change", 0)
        embed.add_field(
            name=f"{user.display_name}",
            value=(
                f"Type: {snap_type} | Result: {snap_result}\n"
                f"CR: {player.get('cr', 0)} → {snap.get('cr', 0)}\n"
                f"Wins: {player.get('wins', 0)} → {snap.get('wins', 0)} | "
                f"Losses: {player.get('losses', 0)} → {snap.get('losses', 0)}\n"
                f"Kills: {player.get('kills', 0)} → {snap.get('kills_total', 0)} | "
                f"Matches: {player.get('matches', 0)} → {snap.get('matches', 0)}"
            ),
            inline=False
        )

    await ctx.send(embed=embed)

    # Apply rollbacks
    result_lines = []
    for user, uid, player, snap in players_data:
        old_cr = player.get("cr", 0)
        player["cr"] = snap.get("cr", old_cr)
        player["wins"] = snap.get("wins", player.get("wins", 0))
        player["losses"] = snap.get("losses", player.get("losses", 0))
        player["kills"] = snap.get("kills_total", player.get("kills", 0))
        player["matches"] = snap.get("matches", player.get("matches", 0))
        player["placement_matches"] = snap.get("placement_matches", player.get("placement_matches", 0))
        player["win_streak"] = snap.get("win_streak", player.get("win_streak", 0))
        player["mvp_count"] = snap.get("mvp_count", player.get("mvp_count", 0))
        player["ranked"] = snap.get("ranked", player.get("ranked", False))

        player["result_snapshots"].pop()

        member = ctx.guild.get_member(int(uid))
        if member:
            if player.get("ranked", False):
                await apply_rank_role(member, get_rank(player["cr"]))
            else:
                await remove_all_rank_roles(member)
                await apply_placement_role(member)

        snap_type = snap.get("type", "unknown").capitalize()
        snap_result = snap.get("result", "unknown").upper()
        snap_kills = snap.get("kills", 0)
        snap_cr_change = snap.get("cr_change", 0)
        add_history(player, f"Team Rollback: {snap_type} {snap_result} ({snap_kills} kills, {snap_cr_change:+d} CR) by {ctx.author.display_name}")

        save_player_to_db_only(ctx.guild.id, uid, player)
        await send_webhook_to_website(uid, player)

        result_lines.append(f"✅ {user.display_name}: {old_cr} → {player['cr']} CR")

    result_embed = discord.Embed(
        title="✅ Team Rollback Complete",
        description="\n".join(result_lines),
        color=discord.Color.green()
    )
    await ctx.send(embed=result_embed)


# ============================
# SCRIM ROLLBACK COMMAND
# ============================

@bot.command()
async def scrimrollback(ctx, *users: discord.Member):
    """
    Roll back the most recent scrim result for one or more players.
    Shows a 20-second countdown review embed displaying all stats being removed.
    Only applies the rollback if confirmed within 20 seconds.

    Usage: !scrimrollback @p1 @p2 ...
    Staff/Owner/Developer only.
    """
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff, Owners, or Developers can use `!scrimrollback`.")
        return

    if not users:
        await ctx.send("❌ Please mention at least one player. Usage: `!scrimrollback @p1 @p2 ...`")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)

    players_data = []
    errors = []

    for user in users:
        uid = str(user.id)
        if uid not in guild_data:
            errors.append(f"❌ {user.mention} has no data on record.")
            continue
        player = normalize_player(guild_data[uid])
        guild_data[uid] = player
        snapshots = player.get("result_snapshots", [])
        if not snapshots:
            errors.append(f"❌ {user.mention} has no result snapshots to roll back.")
            continue
        players_data.append((user, uid, player, snapshots[-1]))

    if errors:
        await ctx.send("\n".join(errors))
        if not players_data:
            return

    if not players_data:
        await ctx.send("❌ No valid players with snapshots found.")
        return

    # ── Build 20-second review embed ────────────────────────────────────────
    review_embed = discord.Embed(
        title="⚠️ Scrim Rollback — Review Stats Being Removed",
        description=(
            f"The following stats will be **removed** from {len(players_data)} player(s).\n"
            "Please verify this is correct before confirming."
        ),
        color=discord.Color.red()
    )

    for user, uid, player, snap in players_data:
        snap_type = snap.get("type", "unknown").capitalize()
        snap_result = snap.get("result", "unknown").upper()
        snap_kills = snap.get("kills", 0)
        snap_cr_change = snap.get("cr_change", 0)
        snap_timestamp = snap.get("timestamp", "unknown time")

        # Current values
        cur_cr = player.get("cr", 0)
        cur_wins = player.get("wins", 0)
        cur_losses = player.get("losses", 0)
        cur_kills = player.get("kills", 0)
        cur_matches = player.get("matches", 0)
        cur_placement = player.get("placement_matches", 0)

        # Values after rollback (from snapshot)
        new_cr = snap.get("cr", cur_cr)
        new_wins = snap.get("wins", cur_wins)
        new_losses = snap.get("losses", cur_losses)
        new_kills = snap.get("kills_total", cur_kills)
        new_matches = snap.get("matches", cur_matches)
        new_placement = snap.get("placement_matches", cur_placement)

        # Build field value
        field_lines = [
            f"**Match:** {snap_type} {snap_result} | {snap_timestamp}",
            f"**CR:** {cur_cr} → {new_cr} (removing {snap_cr_change:+d})",
        ]

        if snap_result == "WIN":
            field_lines.append(f"**Wins:** {cur_wins} → {new_wins}")
        else:
            field_lines.append(f"**Losses:** {cur_losses} → {new_losses}")

        field_lines.append(f"**Kills:** {cur_kills} → {new_kills} (removing {snap_kills})")
        field_lines.append(f"**Matches:** {cur_matches} → {new_matches}")

        if snap_type.lower() == "placement":
            field_lines.append(f"**Placement Matches:** {cur_placement} → {new_placement}")

        # Check if rollback would undo a rank promotion
        was_ranked = snap.get("ranked", player.get("ranked", False))
        is_ranked = player.get("ranked", False)
        if is_ranked and not was_ranked:
            field_lines.append("⚠️ **This will revert the player from Ranked back to Placements!**")

        review_embed.add_field(
            name=f"👤 {user.display_name}",
            value="\n".join(field_lines),
            inline=False
        )

    review_embed.set_footer(text="React ✅ to confirm rollback or ❌ to cancel — 20 seconds")

    msg = await ctx.send(embed=review_embed)
    await msg.add_reaction("✅")
    await msg.add_reaction("❌")

    def check(reaction, reactor):
        return (
            reactor == ctx.author
            and reaction.message.id == msg.id
            and str(reaction.emoji) in ["✅", "❌"]
        )

    try:
        reaction, reactor = await bot.wait_for("reaction_add", timeout=20, check=check)
        confirmed = str(reaction.emoji) == "✅"
    except asyncio.TimeoutError:
        confirmed = False

    try:
        await msg.clear_reactions()
    except Exception:
        pass

    if not confirmed:
        cancel_embed = discord.Embed(
            title="❌ Scrim Rollback Cancelled",
            description="No changes were made. The rollback was cancelled or timed out.",
            color=discord.Color.red()
        )
        await msg.edit(embed=cancel_embed)
        return

    # ── Apply rollbacks ──────────────────────────────────────────────────────
    result_lines = []

    for user, uid, player, snap in players_data:
        snap_type = snap.get("type", "unknown").capitalize()
        snap_result = snap.get("result", "unknown").upper()
        snap_kills = snap.get("kills", 0)
        snap_cr_change = snap.get("cr_change", 0)

        old_cr = player.get("cr", 0)

        # Restore ALL stats from snapshot
        player["cr"] = snap.get("cr", old_cr)
        player["wins"] = snap.get("wins", player.get("wins", 0))
        player["losses"] = snap.get("losses", player.get("losses", 0))
        player["kills"] = snap.get("kills_total", player.get("kills", 0))
        player["matches"] = snap.get("matches", player.get("matches", 0))
        player["placement_matches"] = snap.get("placement_matches", player.get("placement_matches", 0))
        player["win_streak"] = snap.get("win_streak", player.get("win_streak", 0))
        player["mvp_count"] = snap.get("mvp_count", player.get("mvp_count", 0))
        player["ranked"] = snap.get("ranked", player.get("ranked", False))

        # Remove the used snapshot
        player["result_snapshots"].pop()

        # Update Discord roles
        member = ctx.guild.get_member(int(uid))
        if member:
            if player.get("ranked", False):
                await apply_rank_role(member, get_rank(player["cr"]))
            else:
                await remove_all_rank_roles(member)
                await apply_placement_role(member)

        add_history(
            player,
            f"Scrim Rollback: {snap_type} {snap_result} ({snap_kills} kills, {snap_cr_change:+d} CR) "
            f"by {ctx.author.display_name} | {old_cr} → {player['cr']} CR"
        )

        save_player_to_db_only(ctx.guild.id, uid, player)
        await send_webhook_to_website(uid, player)

        result_lines.append(
            f"✅ **{user.display_name}**: {old_cr} → {player['cr']} CR | "
            f"Wins: {player['wins']} | Losses: {player['losses']} | "
            f"Kills: {player['kills']} | Matches: {player['matches']}"
        )

    success_embed = discord.Embed(
        title="✅ Scrim Rollback Complete",
        description="\n".join(result_lines),
        color=discord.Color.green()
    )
    success_embed.set_footer(text=f"Rolled back by {ctx.author.display_name}")
    await msg.edit(embed=success_embed)


# ============================
# OWNER COMMANDS
# ============================

@bot.command()
async def extendplacements(ctx):
    if not is_owner(ctx.author):
        await ctx.send("❌ Only the bot owner can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)

    extended = 0
    skipped = 0

    for uid, player in guild_data.items():
        if not player.get("registered", False):
            skipped += 1
            continue
        if player.get("blacklisted", False):
            skipped += 1
            continue
        if player.get("ranked", False):
            skipped += 1
            continue

        player["placement_matches"] = 0
        member = ctx.guild.get_member(int(uid))
        if member:
            await remove_all_rank_roles(member)
            await apply_placement_role(member)

        add_history(player, "Placements extended by owner via !extendplacements")
        save_player_to_db_only(ctx.guild.id, uid, player)
        await send_webhook_to_website(uid, player)
        extended += 1

    embed = discord.Embed(
        title="✅ Placements Extended",
        color=discord.Color.green()
    )
    embed.add_field(name="Extended", value=str(extended), inline=True)
    embed.add_field(name="Skipped", value=str(skipped), inline=True)
    await ctx.send(embed=embed)


@bot.command()
async def resetall(ctx, confirm: str = None):
    if not is_owner(ctx.author):
        await ctx.send("❌ Only the bot owner can reset all data.")
        return

    if confirm != "confirm":
        await ctx.send("⚠️ This will reset ALL player data for THIS server only. Use `!resetall confirm` to continue.")
        return

    print(f"🔄 resetall: initiated by {ctx.author} ({ctx.author.id}) in guild {ctx.guild.id}")

    data = load_data()
    guild_id = str(ctx.guild.id)
    if guild_id not in data:
        data[guild_id] = {}

    guild_data = data[guild_id]

    reset_count = 0
    skipped = 0
    webhook_ok = 0
    webhook_fail = 0

    for member in ctx.guild.members:
        if member.bot:
            continue

        uid = str(member.id)
        player = make_player()
        player["registered"] = False
        player["cr"] = 0
        player["wins"] = 0
        player["losses"] = 0
        player["kills"] = 0
        player["matches"] = 0
        player["mvp_count"] = 0
        player["win_streak"] = 0
        player["ranked"] = False
        player["placement_matches"] = 0
        player["badges"] = []
        player["history"] = []
        player["notes"] = []
        player["blacklisted"] = False
        player["suspended_until"] = None
        player["suspension_reason"] = None
        player["kill_farming_reports"] = 0
        player["last_killfarm_time"] = None
        player["result_snapshots"] = []

        ensure_profile_fields(member, player)
        guild_data[uid] = player

        try:
            await remove_all_rank_roles(member)
            await apply_placement_role(member)
        except Exception as e:
            print(f"⚠️ resetall role error for {member}: {e}")

        try:
            save_player_to_db_only(ctx.guild.id, uid, player)
        except Exception as e:
            print(f"⚠️ resetall DB error for {uid}: {e}")

        try:
            await send_webhook_to_website(uid, player)
            webhook_ok += 1
        except Exception as e:
            print(f"⚠️ resetall webhook error for {uid}: {e}")
            webhook_fail += 1

        reset_count += 1

    embed = discord.Embed(
        title="✅ Reset Complete",
        color=discord.Color.green()
    )
    embed.add_field(name="Players Reset", value=str(reset_count), inline=True)
    embed.add_field(name="Skipped", value=str(skipped), inline=True)
    embed.add_field(name="Webhooks OK", value=str(webhook_ok), inline=True)
    embed.add_field(name="Webhooks Failed", value=str(webhook_fail), inline=True)
    await ctx.send(embed=embed)


@bot.command()
async def validatedata(ctx):
    if not is_owner(ctx.author):
        await ctx.send("❌ Only the bot owner can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)

    issues = []
    for uid, player in guild_data.items():
        member = ctx.guild.get_member(int(uid))
        name = member.display_name if member else uid

        cr = player.get("cr", 0)
        wins = player.get("wins", 0)
        losses = player.get("losses", 0)
        matches = player.get("matches", 0)
        placement_matches = player.get("placement_matches", 0)
        ranked = player.get("ranked", False)

        if cr < 0:
            issues.append(f"⚠️ {name}: negative CR ({cr})")
        if wins + losses > matches:
            issues.append(f"⚠️ {name}: wins+losses ({wins+losses}) > matches ({matches})")
        if ranked and placement_matches < 7:
            issues.append(f"⚠️ {name}: ranked but only {placement_matches} placement matches")

    if not issues:
        await ctx.send("✅ No data inconsistencies found.")
        return

    embed = discord.Embed(
        title="⚠️ Data Validation Issues",
        description="\n".join(issues[:20]),
        color=discord.Color.orange()
    )
    await ctx.send(embed=embed)


@bot.command()
async def datacheck(ctx):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)

    total = len(guild_data)
    registered = sum(1 for p in guild_data.values() if p.get("registered", False))
    ranked = sum(1 for p in guild_data.values() if p.get("ranked", False))
    in_placements = sum(1 for p in guild_data.values() if p.get("registered", False) and not p.get("ranked", False))
    blacklisted = sum(1 for p in guild_data.values() if p.get("blacklisted", False))

    embed = discord.Embed(
        title="📊 Guild Data Check",
        color=discord.Color.blurple()
    )
    embed.add_field(name="Total Records", value=str(total), inline=True)
    embed.add_field(name="Registered", value=str(registered), inline=True)
    embed.add_field(name="Ranked", value=str(ranked), inline=True)
    embed.add_field(name="In Placements", value=str(in_placements), inline=True)
    embed.add_field(name="Blacklisted", value=str(blacklisted), inline=True)
    await ctx.send(embed=embed)


@bot.command()
async def playercheck(ctx, user: discord.Member):
    if not is_staff(ctx.author):
        await ctx.send("❌ Only Staff can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        await ctx.send(f"❌ {user.mention} has no data.")
        return

    player = normalize_player(guild_data[uid])

    embed = discord.Embed(
        title=f"🔍 Player Data — {user.display_name}",
        color=discord.Color.blurple()
    )
    embed.add_field(name="CR", value=str(player.get("cr", 0)), inline=True)
    embed.add_field(name="Rank", value=get_rank(player.get("cr", 0)), inline=True)
    embed.add_field(name="Ranked", value=str(player.get("ranked", False)), inline=True)
    embed.add_field(name="Placement Matches", value=str(player.get("placement_matches", 0)), inline=True)
    embed.add_field(name="Wins", value=str(player.get("wins", 0)), inline=True)
    embed.add_field(name="Losses", value=str(player.get("losses", 0)), inline=True)
    embed.add_field(name="Kills", value=str(player.get("kills", 0)), inline=True)
    embed.add_field(name="Matches", value=str(player.get("matches", 0)), inline=True)
    embed.add_field(name="Win Streak", value=str(player.get("win_streak", 0)), inline=True)
    embed.add_field(name="MVP Count", value=str(player.get("mvp_count", 0)), inline=True)
    embed.add_field(name="Blacklisted", value=str(player.get("blacklisted", False)), inline=True)
    embed.add_field(name="Suspended Until", value=str(player.get("suspended_until", "None")), inline=True)
    embed.add_field(name="Registered", value=str(player.get("registered", False)), inline=True)
    embed.add_field(name="Snapshots", value=str(len(player.get("result_snapshots", []))), inline=True)
    badges = player.get("badges", [])
    embed.add_field(name="Badges", value=", ".join(badges) if badges else "None", inline=False)
    await ctx.send(embed=embed)


# ============================
# BADGE COMMANDS
# ============================

@bot.command()
async def badgeassign(ctx, user: discord.Member, *, badge: str):
    if not is_developer(ctx.author):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    if badge in player.get("badges", []):
        await ctx.send(f"⚠️ {user.mention} already has the **{badge}** badge.")
        return

    player.setdefault("badges", []).append(badge)
    add_history(player, f"Badge assigned: {badge} by {ctx.author.display_name}")

    ensure_profile_fields(user, player)
    save_player_to_db_only(ctx.guild.id, uid, player)
    print(f"🏅 Sending webhook for badge assign: {uid}")
    await send_webhook_to_website(uid, player)

    await ctx.send(f"✅ Badge **{badge}** assigned to {user.mention}.")


@bot.command()
async def badgeremove(ctx, user: discord.Member, *, badge: str):
    if not is_developer(ctx.author):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        await ctx.send(f"❌ {user.mention} has no data.")
        return

    player = normalize_player(guild_data[uid])
    guild_data[uid] = player

    if badge not in player.get("badges", []):
        await ctx.send(f"⚠️ {user.mention} does not have the **{badge}** badge.")
        return

    player["badges"].remove(badge)
    add_history(player, f"Badge removed: {badge} by {ctx.author.display_name}")

    ensure_profile_fields(user, player)
    save_player_to_db_only(ctx.guild.id, uid, player)
    print(f"🏅 Sending webhook for badge remove: {uid}")
    await send_webhook_to_website(uid, player)

    await ctx.send(f"✅ Badge **{badge}** removed from {user.mention}.")


@bot.command()
async def badgelist(ctx, user: discord.Member = None):
    target = user or ctx.author
    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(target.id)

    if uid not in guild_data:
        await ctx.send(f"❌ {target.mention} has no data.")
        return

    player = normalize_player(guild_data[uid])
    badges = player.get("badges", [])

    embed = discord.Embed(
        title=f"🏅 Badges — {target.display_name}",
        color=discord.Color.gold()
    )
    if badges:
        embed.description = "\n".join(f"• {b}" for b in badges)
    else:
        embed.description = "No badges yet."
    await ctx.send(embed=embed)


@bot.command()
async def addbadges(ctx, badge: str, *users: discord.Member):
    if not is_developer(ctx.author):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    if not users:
        await ctx.send("❌ Usage: `!addbadges \"Badge Name\" @user1 @user2 ...`")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)

    awarded = []
    already_had = []

    for user in users:
        uid = str(user.id)
        if uid not in guild_data:
            guild_data[uid] = make_player()
        player = normalize_player(guild_data[uid])
        guild_data[uid] = player

        if badge in player.get("badges", []):
            already_had.append(user.display_name)
            continue

        player.setdefault("badges", []).append(badge)
        add_history(player, f"Badge assigned: {badge} by {ctx.author.display_name}")
        ensure_profile_fields(user, player)
        save_player_to_db_only(ctx.guild.id, uid, player)
        await send_webhook_to_website(uid, player)
        awarded.append(user.display_name)

    embed = discord.Embed(
        title=f"🏅 Badge Assignment — {badge}",
        color=discord.Color.gold()
    )
    if awarded:
        embed.add_field(name="✅ Awarded", value="\n".join(awarded), inline=False)
    if already_had:
        embed.add_field(name="⚠️ Already Had", value="\n".join(already_had), inline=False)
    await ctx.send(embed=embed)


@bot.command()
async def badges(ctx):
    if not is_developer(ctx.author):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)

    all_badges = set()
    for player in guild_data.values():
        for b in player.get("badges", []):
            all_badges.add(b)

    embed = discord.Embed(
        title="🏅 Badge Catalogue",
        color=discord.Color.gold()
    )
    embed.add_field(
        name="Available Badges",
        value="\n".join(f"• {b}" for b in AVAILABLE_BADGES),
        inline=False
    )
    if all_badges:
        embed.add_field(
            name="Badges In Use",
            value="\n".join(f"• {b}" for b in sorted(all_badges)),
            inline=False
        )
    await ctx.send(embed=embed)


# ============================
# PREMIUM COMMANDS
# ============================

@bot.command(name="premiumcheck")
async def premiumcheck(ctx, user: discord.Member = None):
    invoker = ctx.author
    if not is_developer(invoker):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    target = user or ctx.author
    uid = str(target.id)

    has_role = is_premium_user(target)

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    player = normalize_player(guild_data.get(uid, make_player()))

    db_premium = player.get("premium", False)
    db_granted_at = player.get("premium_granted_at", "N/A")

    embed = discord.Embed(
        title=f"💎 Premium Check — {target.display_name}",
        color=discord.Color.gold() if has_role else discord.Color.greyple()
    )
    embed.add_field(name="Discord Role", value="✅ Has Premium Role" if has_role else "❌ No Premium Role", inline=True)
    embed.add_field(name="DB Status", value="✅ Premium in DB" if db_premium else "❌ Not Premium in DB", inline=True)
    embed.add_field(name="Granted At", value=str(db_granted_at), inline=False)

    if has_role != db_premium:
        embed.add_field(name="⚠️ Mismatch", value="Syncing now...", inline=False)
        await sync_premium_for_member(ctx.guild, target)

    await ctx.send(embed=embed)


@bot.command(name="revokepremium")
async def revokepremium(ctx, user: discord.Member = None):
    if not is_owner(ctx.author):
        await ctx.send("❌ Only the bot owner can use this command.")
        return

    if not user:
        await ctx.send("❌ Usage: `!revokepremium @user`")
        return

    premium_role = ctx.guild.get_role(PREMIUM_USER_ROLE_ID)
    if premium_role and premium_role in user.roles:
        try:
            await user.remove_roles(premium_role)
        except Exception as e:
            await ctx.send(f"⚠️ Could not remove role: {e}")

    data = load_data()
    guild_data = get_guild_data(ctx, data)
    uid = str(user.id)

    if uid not in guild_data:
        guild_data[uid] = make_player()

    player = normalize_player(guild_data[uid])
    player["premium"] = False
    player["premium_granted_at"] = None

    save_player_to_db_only(ctx.guild.id, uid, player)
    await send_webhook_to_website(uid, player)

    embed = discord.Embed(
        title="💎 Premium Revoked",
        color=discord.Color.red()
    )
    embed.add_field(name="User", value=user.mention, inline=True)
    embed.add_field(name="Revoked By", value=ctx.author.mention, inline=True)
    await ctx.send(embed=embed)


# ============================
# SCRIM COMMANDS
# ============================

class ScrimJoinView(discord.ui.View):
    def __init__(self, max_players: int, thread: discord.Thread, link: str):
        super().__init__(timeout=None)
        self.max_players = max_players
        self.players = []
        self.thread = thread
        self.link = link
        self.waitlist = []

    @staticmethod
    async def _close_thread_after_delay(thread: discord.Thread, delay: int):
        """Wait `delay` seconds then fully delete the scrim thread."""
        await asyncio.sleep(delay)
        try:
            await thread.send("🔒 Closing this thread now.")
            await thread.delete()
        except Exception as e:
            print(f"⚠️ Failed to delete scrim thread: {e}")

    @discord.ui.button(label="Join Scrim", emoji="✅", style=discord.ButtonStyle.success)
    async def join_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        user = interaction.user
        if user in self.players:
            await interaction.response.send_message("⚠️ You are already in this scrim.", ephemeral=True)
            return

        if len(self.players) >= self.max_players:
            # Check waitlist
            if user in self.waitlist:
                await interaction.response.send_message("⚠️ You are already on the waitlist.", ephemeral=True)
                return
            await interaction.response.send_message(
                "❌ This scrim is full. Use the waitlist button to join the queue.",
                ephemeral=True
            )
            return

        self.players.append(user)
        try:
            await self.thread.add_user(user)
        except Exception:
            pass

        await interaction.response.send_message(
            f"✅ You've joined the scrim! Here's your link: **{self.link}**",
            ephemeral=True
        )

    @discord.ui.button(label="Leave Scrim", emoji="❌", style=discord.ButtonStyle.danger)
    async def leave_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        user = interaction.user
        if user not in self.players:
            if user in self.waitlist:
                self.waitlist.remove(user)
                await interaction.response.send_message("✅ You've been removed from the waitlist.", ephemeral=True)
                return
            await interaction.response.send_message("⚠️ You are not in this scrim.", ephemeral=True)
            return

        self.players.remove(user)

        # Promote from waitlist if available
        if self.waitlist:
            next_player = self.waitlist.pop(0)
            self.players.append(next_player)
            try:
                await self.thread.add_user(next_player)
            except Exception:
                pass
            try:
                await next_player.send(f"✅ You've been promoted from the waitlist! Here's your link: **{self.link}**")
            except Exception:
                pass

        await interaction.response.send_message("✅ You've left the scrim.", ephemeral=True)

    @discord.ui.button(label="View Players", emoji="👥", style=discord.ButtonStyle.secondary)
    async def view_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not self.players:
            await interaction.response.send_message("📋 No players have joined yet.", ephemeral=True)
            return
        names = "\n".join(f"• {p.display_name}" for p in self.players)
        waitlist_text = ""
        if self.waitlist:
            waitlist_names = "\n".join(f"• {p.display_name}" for p in self.waitlist)
            waitlist_text = f"\n\n**💎 Waitlist:**\n{waitlist_names}"
        await interaction.response.send_message(
            f"**Players ({len(self.players)}/{self.max_players}):**\n{names}{waitlist_text}",
            ephemeral=True
        )

    @discord.ui.button(label="💎 Join Premium Waitlist", style=discord.ButtonStyle.primary)
    async def waitlist_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        user = interaction.user
        if user in self.players:
            await interaction.response.send_message("⚠️ You are already in the scrim.", ephemeral=True)
            return
        if user in self.waitlist:
            await interaction.response.send_message("⚠️ You are already on the waitlist.", ephemeral=True)
            return

        if not is_premium_user(user) and not is_staff(user):
            await interaction.response.send_message(
                "❌ The premium waitlist is for **Premium Users** only.\n"
                "Get premium at: https://buymeacoffee.com/easarena",
                ephemeral=True
            )
            return

        if len(self.players) < self.max_players:
            await interaction.response.send_message(
                "ℹ️ There are still open spots! Use the Join button instead.",
                ephemeral=True
            )
            return

        self.waitlist.append(user)
        await interaction.response.send_message(
            f"✅ You've been added to the premium waitlist at position #{len(self.waitlist)}.",
            ephemeral=True
        )


@bot.tree.command(name="scrim", description="Host a placement scrim match.")
@app_commands.describe(
    scrim_type="Type of scrim: placement or ranked",
    teams="Example: 4v4, 5v5, 3v3",
    length="Example: FT11 (First to 11), FT15, WB0 (Win by 0)",
    region="Example: NAE, NAW, EU, or Ashburn",
    max_players="How many players can join (2-100)",
    link="Custom matchmaking link or code"
)
@app_commands.choices(scrim_type=[
    app_commands.Choice(name="Placement", value="placement"),
    app_commands.Choice(name="Ranked", value="ranked"),
])
async def scrim(
    interaction: discord.Interaction,
    scrim_type: str,
    teams: int,
    length: str,
    region: str,
    max_players: int,
    link: str
):
    print("✅ /scrim command registered")

    if interaction.channel_id != SCRIM_COMMAND_CHANNEL_ID:
        await interaction.response.send_message(
            f"❌ This command can only be used in <#{SCRIM_COMMAND_CHANNEL_ID}>.",
            ephemeral=True
        )
        return

    member = interaction.user
    if not any(role.id == 1487480702256545892 for role in member.roles):
        await interaction.response.send_message(
            "❌ You do not have permission to host scrims.",
            ephemeral=True
        )
        return

    full_type = f"{'Ranked' if scrim_type == 'ranked' else 'Placement'} Scrim"
    thread_name = f"{'Ranked' if scrim_type == 'ranked' else 'Placement'} Scrim"

    embed = discord.Embed(
        title=f"🎮 {full_type}",
        color=discord.Color.blue() if scrim_type == "placement" else discord.Color.gold()
    )
    embed.add_field(name="🏆 Type", value=full_type, inline=True)
    embed.add_field(name="👥 Teams", value=f"{teams}v{teams}", inline=True)
    embed.add_field(name="⏱️ Length", value=length, inline=True)
    embed.add_field(name="🌍 Region", value=region, inline=True)
    embed.add_field(name="🔢 Max Players", value=str(max_players), inline=True)
    embed.add_field(name="🏠 Host", value=member.mention, inline=True)
    embed.set_footer(text="EAS Ranked System • Scrim Lobby")

    await interaction.response.send_message("✅ Creating scrim thread...", ephemeral=True)

    thread = await interaction.channel.create_thread(
        name=thread_name,
        type=discord.ChannelType.public_thread
    )
    await thread.add_user(member)

    view = ScrimJoinView(max_players=max_players, thread=thread, link=link)
    await thread.send(embed=embed, view=view)

    if scrim_type == "placement":
        placements_role = interaction.guild.get_role(PLACEMENTS_ROLE_ID)
        if placements_role:
            await thread.send(f"{placements_role.mention} Placement Scrim starting!")

    asyncio.create_task(ScrimJoinView._close_thread_after_delay(thread, 120))


@bot.tree.command(name="createscrim", description="Create a placement scrim match.")
@app_commands.describe(
    scrim_type="Type of scrim: placement or ranked",
    teams="Example: 4v4, 5v5, 3v3",
    length="Example: FT11 (First to 11), FT15, WB0 (Win by 0)",
    region="Example: NAE, NAW, EU, or Ashburn",
    max_players="How many players can join (2-100)",
    link="Custom matchmaking link or code"
)
@app_commands.choices(scrim_type=[
    app_commands.Choice(name="Placement", value="placement"),
    app_commands.Choice(name="Ranked", value="ranked"),
])
async def createscrim(
    interaction: discord.Interaction,
    scrim_type: str,
    teams: int,
    length: str,
    region: str,
    max_players: int,
    link: str
):
    if interaction.channel_id != SCRIM_COMMAND_CHANNEL_ID:
        await interaction.response.send_message(
            f"❌ This command can only be used in <#{SCRIM_COMMAND_CHANNEL_ID}>.",
            ephemeral=True
        )
        return

    member = interaction.user
    if not any(role.id == 1487480702256545892 for role in member.roles):
        await interaction.response.send_message(
            "❌ You do not have permission to host scrims.",
            ephemeral=True
        )
        return

    full_type = f"{'Ranked' if scrim_type == 'ranked' else 'Placement'} Scrim"
    thread_name = f"{'Ranked' if scrim_type == 'ranked' else 'Placement'} Scrim"

    embed = discord.Embed(
        title=f"🎮 {full_type}",
        color=discord.Color.blue() if scrim_type == "placement" else discord.Color.gold()
    )
    embed.add_field(name="🏆 Type", value=full_type, inline=True)
    embed.add_field(name="👥 Teams", value=f"{teams}v{teams}", inline=True)
    embed.add_field(name="⏱️ Length", value=length, inline=True)
    embed.add_field(name="🌍 Region", value=region, inline=True)
    embed.add_field(name="🔢 Max Players", value=str(max_players), inline=True)
    embed.add_field(name="🏠 Host", value=member.mention, inline=True)
    embed.set_footer(text="EAS Ranked System • Scrim Lobby")

    await interaction.response.send_message("✅ Creating scrim thread...", ephemeral=True)

    thread = await interaction.channel.create_thread(
        name=thread_name,
        type=discord.ChannelType.public_thread
    )
    await thread.add_user(member)

    view = ScrimJoinView(max_players=max_players, thread=thread, link=link)
    await thread.send(embed=embed, view=view)

    asyncio.create_task(ScrimJoinView._close_thread_after_delay(thread, 120))


@bot.tree.command(name="rankedscrim", description="Host a ranked scrim match.")
@app_commands.describe(
    teams="Example: 4v4, 5v5, 3v3",
    length="Example: FT11 (First to 11), FT15, WB0 (Win by 0)",
    region="Example: NAE, NAW, EU, or Ashburn",
    max_players="How many players can join (2-100)",
    link="Custom matchmaking link or code"
)
async def rankedscrim(
    interaction: discord.Interaction,
    teams: int,
    length: str,
    region: str,
    max_players: int,
    link: str
):
    if interaction.channel_id != SCRIM_COMMAND_CHANNEL_ID:
        await interaction.response.send_message(
            f"❌ This command can only be used in <#{SCRIM_COMMAND_CHANNEL_ID}>.",
            ephemeral=True
        )
        return

    member = interaction.user
    if not has_any_role(member, ALLOWED_SCRIM_ROLE_IDS):
        await interaction.response.send_message(
            "❌ You do not have permission to host scrims.",
            ephemeral=True
        )
        return

    embed = discord.Embed(
        title="🎮 Ranked Scrim",
        color=discord.Color.gold()
    )
    embed.add_field(name="🏆 Type", value="Ranked", inline=True)
    embed.add_field(name="👥 Teams", value=f"{teams}v{teams}", inline=True)
    embed.add_field(name="⏱️ Length", value=length, inline=True)
    embed.add_field(name="🌍 Region", value=region, inline=True)
    embed.add_field(name="🔢 Max Players", value=str(max_players), inline=True)
    embed.add_field(name="🏠 Host", value=member.mention, inline=True)
    embed.set_footer(text="EAS Ranked System • Ranked Scrim Lobby")

    await interaction.response.send_message("✅ Creating ranked scrim thread...", ephemeral=True)

    thread = await interaction.channel.create_thread(
        name="Ranked Scrim",
        type=discord.ChannelType.public_thread
    )
    await thread.add_user(member)

    view = ScrimJoinView(max_players=max_players, thread=thread, link=link)
    await thread.send(embed=embed, view=view)

    asyncio.create_task(ScrimJoinView._close_thread_after_delay(thread, 120))


@bot.tree.command(name="createrankedscrim", description="Host a ranked scrim match and ping the ranked role.")
@app_commands.describe(
    teams="Example: 4v4, 5v5, 3v3",
    length="Example: FT11 (First to 11), FT15, WB0 (Win by 0)",
    region="Example: NAE, NAW, EU, or Ashburn",
    max_players="How many players can join (2-100)",
    link="Custom matchmaking link or code"
)
async def createrankedscrim(
    interaction: discord.Interaction,
    teams: int,
    length: str,
    region: str,
    max_players: int,
    link: str
):
    if interaction.channel_id != SCRIM_COMMAND_CHANNEL_ID:
        await interaction.response.send_message(
            f"❌ This command can only be used in <#{SCRIM_COMMAND_CHANNEL_ID}>.",
            ephemeral=True
        )
        return

    member = interaction.user
    if not has_any_role(member, ALLOWED_SCRIM_ROLE_IDS):
        await interaction.response.send_message(
            "❌ You do not have permission to host scrims.",
            ephemeral=True
        )
        return

    embed = discord.Embed(
        title="🎮 Ranked Scrim",
        color=discord.Color.gold()
    )
    embed.add_field(name="🏆 Type", value="Ranked", inline=True)
    embed.add_field(name="👥 Teams", value=f"{teams}v{teams}", inline=True)
    embed.add_field(name="⏱️ Length", value=length, inline=True)
    embed.add_field(name="🌍 Region", value=region, inline=True)
    embed.add_field(name="🔢 Max Players", value=str(max_players), inline=True)
    embed.add_field(name="🏠 Host", value=member.mention, inline=True)
    embed.set_footer(text="EAS Ranked System • Ranked Scrim Lobby")

    await interaction.response.send_message("✅ Creating ranked scrim thread...", ephemeral=True)

    thread = await interaction.channel.create_thread(
        name="Ranked Scrim",
        type=discord.ChannelType.public_thread
    )
    await thread.add_user(member)

    view = ScrimJoinView(max_players=max_players, thread=thread, link=link)
    await thread.send(embed=embed, view=view)
    await thread.send(f"<@&{RANKED_ROLE_ID}> Ranked Scrim starting!")

    asyncio.create_task(ScrimJoinView._close_thread_after_delay(thread, 120))


@bot.tree.command(name="rankedresult", description="Log the result of a ranked scrim match.")
@app_commands.describe(
    w1="Winner 1",
    w2="Winner 2",
    l1="Loser 1",
    l2="Loser 2",
    k1="Kills for winner 1",
    k2="Kills for winner 2",
    k3="Kills for loser 1",
    k4="Kills for loser 2",
)
async def rankedresult(
    interaction: discord.Interaction,
    w1: discord.Member,
    w2: discord.Member,
    l1: discord.Member,
    l2: discord.Member,
    k1: int = 0,
    k2: int = 0,
    k3: int = 0,
    k4: int = 0,
):
    invoker = interaction.user
    if not is_staff(invoker) and not is_league_host(invoker):
        await interaction.response.send_message(
            "❌ Only Staff or League Hosts can log ranked scrim results.",
            ephemeral=True
        )
        return

    await interaction.response.defer()

    data = load_data()
    guild = interaction.guild
    guild_id = str(guild.id)
    if guild_id not in data:
        data[guild_id] = {}
    guild_data = data[guild_id]

    winners = [(w1, k1), (w2, k2)]
    losers = [(l1, k3), (l2, k4)]

    errors = []
    for member, kills in winners + losers:
        uid = str(member.id)
        if uid not in guild_data:
            guild_data[uid] = make_player()
        player = normalize_player(guild_data[uid])
        guild_data[uid] = player
        if not player.get("registered", False):
            errors.append(f"{member.mention} is not registered")
        if player.get("blacklisted", False):
            errors.append(f"{member.mention} is blacklisted")
        if not player.get("ranked", False):
            errors.append(f"{member.mention} is not ranked yet")

    if errors:
        await interaction.followup.send("❌ " + "\n".join(errors))
        return

    winner_avg = sum(guild_data[str(m.id)].get("cr", 0) for m, _ in winners) / len(winners)
    loser_avg = sum(guild_data[str(m.id)].get("cr", 0) for m, _ in losers) / len(losers)

    result_lines = []

    for member, kills in winners:
        uid = str(member.id)
        player = guild_data[uid]
        old_rank = get_rank(player.get("cr", 0))
        change = calculate_ranked_cr(player, "win", kills, winner_avg, loser_avg)
        add_result_snapshot(player, "ranked", "win", kills, change)
        player["cr"] += change
        player["wins"] += 1
        player["win_streak"] = player.get("win_streak", 0) + 1
        player["kills"] += kills
        player["matches"] += 1
        new_rank = get_rank(player["cr"])
        await apply_rank_role(member, new_rank)
        add_history(player, f"Ranked Scrim Win +{change} CR ({kills} kills) | {player['cr']} CR ({new_rank})")
        rank_change = f" 🔺 {old_rank} → {new_rank}" if old_rank != new_rank else ""
        result_lines.append(f"✅ {member.display_name}: +{change} CR → {player['cr']} CR | {new_rank}{rank_change}")
        save_player_to_db_only(guild.id, uid, player)
        await send_webhook_to_website(uid, player)

    for member, kills in losers:
        uid = str(member.id)
        player = guild_data[uid]
        old_rank = get_rank(player.get("cr", 0))
        change = calculate_ranked_cr(player, "loss", kills, loser_avg, winner_avg)
        add_result_snapshot(player, "ranked", "loss", kills, change)
        player["cr"] = max(0, player["cr"] + change)
        player["losses"] += 1
        player["win_streak"] = 0
        player["kills"] += kills
        player["matches"] += 1
        new_rank = get_rank(player["cr"])
        await apply_rank_role(member, new_rank)
        add_history(player, f"Ranked Scrim Loss {change} CR ({kills} kills) | {player['cr']} CR ({new_rank})")
        rank_change = f" 🔻 {old_rank} → {new_rank}" if old_rank != new_rank else ""
        result_lines.append(f"❌ {member.display_name}: {change} CR → {player['cr']} CR | {new_rank}{rank_change}")
        save_player_to_db_only(guild.id, uid, player)
        await send_webhook_to_website(uid, player)

    embed = discord.Embed(
        title="✅ Ranked Scrim Result Logged",
        description="\n".join(result_lines),
        color=discord.Color.green()
    )
    await interaction.followup.send(embed=embed)


# ============================
# DEVELOPER COMMANDS
# ============================

@bot.command()
async def devhelp(ctx):
    if not is_developer(ctx.author):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    embed = discord.Embed(
        title="🧑‍💻 Developer Commands",
        color=discord.Color.blurple()
    )
    embed.add_field(
        name="Commands",
        value=(
            "```"
            "!devhelp\n"
            "!dbstatus\n"
            "!syncbackup\n"
            "!exportdata\n"
            "!botstats\n"
            "!update\n"
            "!maintenance <message>\n"
            "!badgeassign @user badge\n"
            "!badgeremove @user badge\n"
            "!badgelist @user\n"
            "!addbadges \"Badge\" @u1 @u2\n"
            "!badges\n"
            "!premiumcheck @user\n"
            "!revokepremium @user"
            "```"
        ),
        inline=False
    )
    await ctx.send(embed=embed)


@bot.command()
async def dbstatus(ctx):
    if not is_developer(ctx.author):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    if using_database():
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM players")
            count = cur.fetchone()[0]
            cur.close()
            conn.close()
            await ctx.send(f"✅ PostgreSQL connected. {count} player records.")
        except Exception as e:
            await ctx.send(f"❌ PostgreSQL error: {e}")
    else:
        await ctx.send("⚠️ Using JSON backup only (no PostgreSQL).")


@bot.command()
async def syncbackup(ctx):
    if not is_developer(ctx.author):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    data = load_data()
    save_json_backup(data)
    await ctx.send(f"✅ JSON backup synced. {sum(len(g) for g in data.values())} player records.")


@bot.command()
async def exportdata(ctx):
    if not is_developer(ctx.author):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    data = load_data()
    json_str = json.dumps(data, indent=2)
    file = discord.File(io.StringIO(json_str), filename="players_export.json")
    await ctx.send("📦 Player data export:", file=file)


@bot.command()
async def botstats(ctx):
    if not is_developer(ctx.author):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    uptime = datetime.now() - START_TIME
    hours, remainder = divmod(int(uptime.total_seconds()), 3600)
    minutes, seconds = divmod(remainder, 60)

    embed = discord.Embed(title="🤖 Bot Stats", color=discord.Color.blurple())
    embed.add_field(name="Uptime", value=f"{hours}h {minutes}m {seconds}s", inline=True)
    embed.add_field(name="Guilds", value=str(len(bot.guilds)), inline=True)
    embed.add_field(name="DB", value="PostgreSQL" if using_database() else "JSON", inline=True)
    await ctx.send(embed=embed)


@bot.command()
async def update(ctx):
    if not is_developer(ctx.author):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    embed = discord.Embed(
        title="📢 EAS Ranked System — Update Notes",
        color=discord.Color.blurple()
    )
    embed.add_field(name="🔄 Latest Changes", value="See changelog for details.", inline=False)
    embed.set_footer(text="EAS Ranked System • No player data reset")
    await ctx.send(embed=embed)


@bot.command()
async def maintenance(ctx, *, message: str = None):
    if not is_developer(ctx.author):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    if not message:
        await ctx.send("❌ Please provide a maintenance message. Usage: `!maintenance <message>`")
        return

    embed = make_panel("🔧 Maintenance Notice", message, discord.Color.orange())
    embed.set_footer(text="EAS Ranked System • Maintenance Notification")

    sent = 0
    failed = 0
    for channel_id in ALLOWED_CHANNEL_IDS:
        channel = bot.get_channel(channel_id)
        if channel:
            try:
                await channel.send(embed=embed)
                sent += 1
            except Exception:
                failed += 1

    await ctx.send(f"✅ Maintenance notice sent to {sent} channel(s). Failed: {failed}")


@bot.command()
async def syncprofiles(ctx):
    if not is_developer(ctx.author):
        await ctx.send("❌ Only the bot developer can use this command.")
        return

    data = load_data()
    guild_data = get_guild_data(ctx, data)

    updated = 0
    for uid, player in guild_data.items():
        member = ctx.guild.get_member(int(uid))
        if member:
            ensure_profile_fields(member, player)
            save_player_to_db_only(ctx.guild.id, uid, player)
            updated += 1

    await ctx.send(f"✅ Synced profiles for {updated} players.")


# ============================
# ERROR HANDLER
# ============================

@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.CommandNotFound):
        return
    if isinstance(error, commands.MissingRequiredArgument):
        await ctx.send(f"❌ Missing argument: `{error.param.name}`")
        return
    if isinstance(error, commands.BadArgument):
        await ctx.send(f"❌ Bad argument: {error}")
        return
    if isinstance(error, commands.MemberNotFound):
        await ctx.send(f"❌ Member not found.")
        return

    print(f"❌ Unhandled error in {ctx.command}: {error}")
    traceback.print_exc()
    await ctx.send(f"❌ An error occurred: `{error}`")


# ============================
# RUN BOT
# ============================

if TOKEN is None:
    print("❌ TOKEN environment variable is missing.")
else:
    bot.run(TOKEN)
