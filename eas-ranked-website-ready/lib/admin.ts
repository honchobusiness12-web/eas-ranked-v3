export const OWNER_DISCORD_IDS = (process.env.OWNER_DISCORD_IDS ?? "733871667788644445")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export const OWNER_ROBLOX_IDS = (process.env.OWNER_ROBLOX_IDS ?? "2584136")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export function isOwnerIdentity(discordId?: string | null, robloxId?: string | number | null) {
  const rbx = robloxId == null ? null : String(robloxId);
  return (!!discordId && OWNER_DISCORD_IDS.includes(discordId)) || (!!rbx && OWNER_ROBLOX_IDS.includes(rbx));
}
