import { NextRequest, NextResponse } from "next/server";
import { triggerBatchSync } from "@/lib/batch-sync";

// Use the Node.js runtime so we can import pg-backed modules (batch-sync → db)
export const runtime = "nodejs";

// Routes that require authentication
const PROTECTED_ROUTES = [
  "/premium/cosmetics",
  "/premium/export",
  "/premium/matches",
  "/premium/tracker",
  "/premium/manage",
  "/premium/comparisons",
  "/premium/stats",
  "/redeem",
  "/admin/giveaways",
  "/admin/cr",
  "/admin/announcements",
  "/admin/seasons",
  "/cosmetics/colors",
];

// Routes that are always public
const PUBLIC_ROUTES = [
  "/",
  "/leaderboard",
  "/players",
  "/compare",
  "/placements",
  "/ranks",
  "/guide",
  "/auth/login",
  "/auth/callback",
  "/premium/subscribe",
  "/premium/commands",
  "/giveaway/redeem",
];

const SESSION_COOKIE = "eas_session";

function isAuthenticated(req: NextRequest): boolean {
  const cookie = req.cookies.get(SESSION_COOKIE);
  if (!cookie?.value) return false;

  try {
    const raw = Buffer.from(cookie.value, "base64").toString("utf-8");
    const session = JSON.parse(raw);
    return session && Date.now() < session.expiresAt;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Startup batch sync — fire-and-forget, runs at most once every 5 minutes
// ---------------------------------------------------------------------------

let startupSyncTriggered = false;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Trigger a background batch sync on the first request after a cold start.
  // triggerBatchSync has its own 5-minute cooldown so subsequent requests are
  // no-ops.  We skip API routes to avoid triggering during health checks.
  if (!startupSyncTriggered && !pathname.startsWith("/api/")) {
    startupSyncTriggered = true;
    triggerBatchSync();
  }

  // Check if this is a protected route
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));

  if (isProtected && !isAuthenticated(req)) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - API routes (handled separately)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
