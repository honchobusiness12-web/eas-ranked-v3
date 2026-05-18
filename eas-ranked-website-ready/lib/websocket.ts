/**
 * WebSocket client utility for real-time player updates.
 *
 * Usage (in a client component):
 *   import { createLeaderboardSocket } from "@/lib/websocket";
 *
 *   useEffect(() => {
 *     const ws = createLeaderboardSocket((event) => {
 *       addToast(`${event.playerName} updated: ${event.crDelta > 0 ? "+" : ""}${event.crDelta} CR`, "info");
 *     });
 *     return () => ws.close();
 *   }, []);
 */

export interface PlayerUpdateEvent {
  type: "player_update";
  userId: string;
  playerName: string;
  cr: number;
  crDelta: number;
}

type UpdateHandler = (event: PlayerUpdateEvent) => void;

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

export function createLeaderboardSocket(onUpdate: UpdateHandler): WebSocket | null {
  if (typeof window === "undefined") return null;

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (!wsUrl) {
    console.info("[ws] NEXT_PUBLIC_WS_URL not set — real-time updates disabled.");
    return null;
  }

  let attempts = 0;
  let ws: WebSocket;

  function connect() {
    ws = new WebSocket(wsUrl!);

    ws.onopen = () => {
      console.info("[ws] Connected to leaderboard socket.");
      attempts = 0;
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as PlayerUpdateEvent;
        if (data.type === "player_update") {
          onUpdate(data);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = (err) => {
      console.warn("[ws] Socket error:", err);
    };

    ws.onclose = () => {
      if (attempts < MAX_RECONNECT_ATTEMPTS) {
        attempts++;
        console.info(`[ws] Reconnecting in ${RECONNECT_DELAY_MS}ms (attempt ${attempts})…`);
        setTimeout(connect, RECONNECT_DELAY_MS);
      } else {
        console.warn("[ws] Max reconnect attempts reached. Real-time updates paused.");
      }
    };
  }

  connect();
  return ws!;
}
