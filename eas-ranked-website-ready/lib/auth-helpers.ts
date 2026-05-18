import { NextResponse } from "next/server";
import { getSession, Session } from "@/lib/auth";
import { isPremiumUser } from "@/lib/premium";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthResult {
  session: Session;
  userId: string;
}

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

/**
 * Ensures the incoming request has a valid authenticated session.
 *
 * Returns `{ session, userId }` on success.
 * Returns a 401 NextResponse if the user is not authenticated.
 *
 * Usage in an API route:
 *   const auth = await requireAuth();
 *   if (auth instanceof NextResponse) return auth;
 *   const { session, userId } = auth;
 */
export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
  return { session, userId: session.userId };
}

// ---------------------------------------------------------------------------
// requirePremium
// ---------------------------------------------------------------------------

/**
 * Ensures the incoming request has a valid authenticated session AND that the
 * authenticated user has an active premium subscription.
 *
 * Returns `{ session, userId }` on success.
 * Returns a 401 NextResponse if not authenticated.
 * Returns a 403 NextResponse if the user does not have premium.
 *
 * Usage in an API route:
 *   const auth = await requirePremium();
 *   if (auth instanceof NextResponse) return auth;
 *   const { session, userId } = auth;
 */
export async function requirePremiumAuth(): Promise<AuthResult | NextResponse> {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const { userId } = authResult;
  const premium = await isPremiumUser(userId);
  if (!premium) {
    return NextResponse.json(
      { error: "Premium subscription required" },
      { status: 403 }
    );
  }

  return authResult;
}

// ---------------------------------------------------------------------------
// requireOwnUser
// ---------------------------------------------------------------------------

/**
 * Ensures the authenticated user is operating on their own data.
 *
 * Checks that `requestedUserId` matches the authenticated session's userId.
 * Returns `{ session, userId }` on success.
 * Returns a 401 NextResponse if not authenticated.
 * Returns a 403 NextResponse if the user is trying to access someone else's data.
 *
 * Usage in an API route:
 *   const auth = await requireOwnUser(requestedUserId);
 *   if (auth instanceof NextResponse) return auth;
 *   const { session, userId } = auth;
 */
export async function requireOwnUser(
  requestedUserId: string
): Promise<AuthResult | NextResponse> {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const { session, userId } = authResult;

  if (userId !== requestedUserId) {
    console.warn(
      `[auth-helpers] Ownership violation: session user ${userId} attempted to access data for ${requestedUserId}`
    );
    return NextResponse.json(
      { error: "You can only access your own data" },
      { status: 403 }
    );
  }

  return { session, userId };
}

// ---------------------------------------------------------------------------
// verifyUserOwnership
// ---------------------------------------------------------------------------

/**
 * Verifies that the authenticated user owns a resource identified by
 * `resourceUserId`. Unlike `requireOwnUser`, this does not return a
 * NextResponse — it returns a boolean so callers can decide how to handle
 * the mismatch (e.g. allow read but block write).
 *
 * Returns `true` if the session user matches `resourceUserId`.
 * Returns `false` if there is no session or the IDs do not match.
 *
 * Usage:
 *   const isOwner = await verifyUserOwnership(targetUserId);
 *   if (!isOwner) { ... }
 */
export async function verifyUserOwnership(
  resourceUserId: string
): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return session.userId === resourceUserId;
}
