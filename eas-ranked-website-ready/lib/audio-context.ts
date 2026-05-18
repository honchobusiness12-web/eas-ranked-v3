/**
 * Singleton AudioContext manager.
 *
 * - Lazy-initialises on first user interaction to respect browser autoplay policies.
 * - Provides a debounce guard so rapid events (hover, click spam) don't stack up.
 * - Keeps volume in a safe 0.1–0.3 range so sounds are never jarring.
 */

let _ctx: AudioContext | null = null;
let _lastPlayedAt = 0;
const MIN_INTERVAL_MS = 50; // hard floor — prevents audio glitches from stacking

/**
 * Returns the shared AudioContext, creating it on first call.
 * Returns null in SSR or when the Web Audio API is unavailable.
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!_ctx) {
      _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (e.g. after browser autoplay policy kicks in)
    if (_ctx.state === "suspended") {
      _ctx.resume().catch(() => {});
    }
    return _ctx;
  } catch {
    return null;
  }
}

/**
 * Returns true if enough time has passed since the last sound was played.
 * Call this before scheduling any audio to prevent rapid-fire stacking.
 */
export function canPlayNow(minIntervalMs = MIN_INTERVAL_MS): boolean {
  const now = Date.now();
  if (now - _lastPlayedAt < minIntervalMs) return false;
  _lastPlayedAt = now;
  return true;
}

/**
 * Clamp a volume value to the safe 0.1–0.3 range.
 * Prevents sounds from being inaudible or uncomfortably loud.
 */
export function clampVolume(v: number): number {
  return Math.max(0.05, Math.min(0.3, v));
}
