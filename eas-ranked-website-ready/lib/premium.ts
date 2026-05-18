import { isOwnerIdentity } from "@/lib/admin";
export const DEVELOPER_USER_ID = "733871667788644445";
export const PREMIUM_ROLE_ID = "";
export const STAFF_ROLE_IDS: string[] = [];
export const CONTENT_CREATOR_ROLE_IDS: string[] = [];
export type UserBadge = { id: string; label?: string; icon?: string; color?: string; description?: string };
export type Cosmetics = Record<string, any> | null;
export async function ensurePremiumTables() { return; }
export async function isDeveloper(userId: string | null | undefined) { return isOwnerIdentity(userId, null); }
export async function isPremiumUser(_userId?: string) { return false; }
export async function getPremiumStatus(userId: string) { return { userId, premium: false, permanent: false, expiresAt: null }; }
export async function grantPremium(_userId?: string, _expiry?: Date) { return false; }
export async function revokePremium(_userId?: string) { return false; }
export async function getCosmetics(_userId?: string): Promise<Cosmetics> { return null; }
export async function getUserBadges(_userId?: string): Promise<UserBadge[]> { return []; }
export async function assignBadgeRole(_userId?: string, _roleId?: string) { return false; }
export async function removeBadgeRole(_userId?: string, _roleId?: string) { return false; }
export function invalidatePremiumStatusCache(_userId?: string) {}
