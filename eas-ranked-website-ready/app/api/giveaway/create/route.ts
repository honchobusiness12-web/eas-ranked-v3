import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createGiveawayCode } from "@/lib/giveaway";

// ---------------------------------------------------------------------------
// POST /api/giveaway/create
// Body: { code, duration_days, max_uses, expires_at? }
// Requires: owner session
// ---------------------------------------------------------------------------

function isDeveloper(userId: string): boolean {
  return userId === "733871667788644445";
}

export async function POST(req: NextRequest) {
  // 1. Require authentication
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Require owner
  if (!isDeveloper(session.userId)) {
    return NextResponse.json({ error: "Forbidden. Developer access required." }, { status: 403 });
  }

  // 3. Parse body
  let body: {
    code?: string;
    duration_days?: number;
    max_uses?: number;
    expires_at?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const code = (body.code ?? "").trim().toUpperCase();
  const durationDays = Number(body.duration_days);
  const maxUses = Number(body.max_uses);
  const expiresAt = body.expires_at ? new Date(body.expires_at) : null;

  // 4. Validate inputs
  if (!code) {
    return NextResponse.json({ error: "Code is required." }, { status: 400 });
  }
  if (!/^[A-Z0-9\-_]+$/.test(code)) {
    return NextResponse.json(
      { error: "Code may only contain letters, numbers, hyphens, and underscores." },
      { status: 400 }
    );
  }
  if (!durationDays || durationDays < 1 || durationDays > 3650) {
    return NextResponse.json({ error: "duration_days must be between 1 and 3650." }, { status: 400 });
  }
  if (!maxUses || maxUses < 1 || maxUses > 100000) {
    return NextResponse.json({ error: "max_uses must be between 1 and 100,000." }, { status: 400 });
  }
  if (expiresAt && isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: "Invalid expires_at date." }, { status: 400 });
  }

  // 5. Create the code
  try {
    const newCode = await createGiveawayCode(
      code,
      durationDays,
      maxUses,
      expiresAt,
      session.userId
    );
    return NextResponse.json({ success: true, code: newCode }, { status: 201 });
  } catch (err: unknown) {
    // Unique constraint violation
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
      return NextResponse.json({ error: "A code with that name already exists." }, { status: 409 });
    }
    console.error("[giveaway/create] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
