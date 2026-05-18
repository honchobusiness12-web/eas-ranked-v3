/**
 * Sound effects using the Web Audio API.
 * All sounds are generated programmatically — no external files needed.
 * Designed to be creamy, smooth, and buttery: pure sine waves, soft volumes,
 * longer durations (120–300ms), and gentle frequency transitions for a
 * premium, velvety feel with smooth fade in/out to avoid clicks/pops.
 *
 * Uses the shared AudioContext singleton from lib/audio-context.ts so that:
 *  - No audio fires on page load (lazy init on first user interaction).
 *  - Rapid events are debounced to prevent audio glitches.
 *  - Volume is clamped to a safe 0.05–0.3 range.
 */

import { getAudioContext, canPlayNow, clampVolume } from "@/lib/audio-context";

interface ToneOptions {
  startFreq: number;
  endFreq?: number;
  duration: number;
  volume?: number;
  type?: OscillatorType;
}

function playTone({ startFreq, endFreq, duration, volume = 0.2, type = "sine" }: ToneOptions): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const safeVolume = clampVolume(volume);

  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFreq, ctx.currentTime);

    if (endFreq !== undefined) {
      oscillator.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + duration / 1000);
    }

    // Fade in quickly, then fade out to avoid clicks/pops
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(safeVolume, ctx.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration / 1000);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000 + 0.01);
  } catch {
    // Silently fail if audio is unavailable
  }
}

/**
 * Play multiple frequencies simultaneously to create a chord effect.
 * Each entry in `tones` defines a voice in the chord.
 */
function playChord(
  tones: Array<{ startFreq: number; endFreq?: number; type?: OscillatorType }>,
  duration: number,
  volume = 0.2
): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const safeVolume = clampVolume(volume);
  // Distribute volume evenly across voices so the chord doesn't clip
  const voiceVolume = safeVolume / tones.length;

  for (const tone of tones) {
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = tone.type ?? "sine";
      oscillator.frequency.setValueAtTime(tone.startFreq, ctx.currentTime);

      if (tone.endFreq !== undefined) {
        oscillator.frequency.linearRampToValueAtTime(
          tone.endFreq,
          ctx.currentTime + duration / 1000
        );
      }

      // Smooth fade in/out per voice
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(voiceVolume, ctx.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration / 1000);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration / 1000 + 0.01);
    } catch {
      // Silently fail if audio is unavailable
    }
  }
}

/**
 * Creamy, smooth click — like pressing a soft, satisfying button.
 * Pure sine wave gliding from 350 Hz down to 320 Hz (150ms) with a
 * subtle lower harmonic at 175 Hz for added warmth and body.
 * Debounced: min 200ms between clicks to prevent audio stacking.
 */
export function playClick(volume = 0.2): void {
  if (!canPlayNow(200)) return;
  // Primary tone: smooth sine glide for a buttery click feel
  playTone({ startFreq: 350, endFreq: 320, duration: 150, volume: volume * 0.8, type: "sine" });
  // Warm harmonic: half-frequency layer adds depth and creaminess
  playTone({ startFreq: 175, endFreq: 160, duration: 150, volume: volume * 0.2, type: "sine" });
}

/**
 * Creamy, buttery hover — like butter gently melting.
 * Pure sine wave rising softly from 420 Hz to 450 Hz (120ms).
 * Debounced: min 80ms between hovers to prevent rapid-fire stacking.
 */
export function playHover(volume = 0.12): void {
  if (!canPlayNow(80)) return;
  playTone({ startFreq: 420, endFreq: 450, duration: 120, volume, type: "sine" });
}

/**
 * Creamy, warm success chord — like a smooth, velvety celebration.
 * Three pure sine waves rise together across a warm major chord
 * (330→360 Hz, 495→540 Hz, 660→720 Hz) over a luxurious 300ms.
 * Debounced: min 300ms between success sounds.
 */
export function playSuccess(volume = 0.2): void {
  if (!canPlayNow(300)) return;
  playChord(
    [
      { startFreq: 330, endFreq: 360, type: "sine" },
      { startFreq: 495, endFreq: 540, type: "sine" },
      { startFreq: 660, endFreq: 720, type: "sine" },
    ],
    300,
    volume
  );
}

/**
 * Creamy, warm warning — gentle and soft, never harsh.
 * Pure sine wave falling from 240 Hz to 200 Hz (180ms) for a
 * rounded, velvety tone that signals an error with warmth.
 * Debounced: min 200ms between error sounds.
 */
export function playError(volume = 0.15): void {
  if (!canPlayNow(200)) return;
  playTone({ startFreq: 240, endFreq: 200, duration: 180, volume, type: "sine" });
}
