/**
 * POST /api/admin/sync-roles
 *
 * Manually triggers a full batch sync of all Discord role holders into the
 * database.  Developer access only.
 *
 * Query params:
 *   ?force=true  — bypass the 5-minute cooldown and Discord role cache
 *
 * Response:
 *   { success: true, result: BatchSyncResult }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DEVELOPER_USER_ID } from "@/lib/premium";
import { batchSyncAllRoles } from "@/lib/batch-sync";
import { invalidateRoleCache } from "@/lib/discord-roles";

export async function POST(req: NextRequest) {
  // Auth — developer only
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.userId !== DEVELOPER_USER_ID) {
    return NextResponse.json(
      { error: "Forbidden. Developer access required." },
      { status: 403 }
    );
  }

  const force = req.nextUrl.searchParams.get("force") === "true";

  // Optionally bust the Discord role cache before syncing
  if (force) {
    invalidateRoleCache();
  }

  try {
    const result = await batchSyncAllRoles(force);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("[api/admin/sync-roles] POST failed:", err);
    return NextResponse.json(
      { error: "Sync failed. Check server logs." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/sync-roles
 *
 * Returns the current sync status (last run time, whether a run is in
 * progress).  Useful for polling from the admin UI.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.userId !== DEVELOPER_USER_ID) {
    return NextResponse.json(
      { error: "Forbidden. Developer access required." },
      { status: 403 }
    );
  }

  return NextResponse.json({ status: "ready" });
}
