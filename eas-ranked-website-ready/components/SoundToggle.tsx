"use client";

import { useSounds } from "@/components/SoundProvider";

export default function SoundToggle() {
  const { enabled, toggle, click } = useSounds();

  function handleClick() {
    click();
    toggle();
  }

  return (
    <button
      onClick={handleClick}
      title={enabled ? "Mute sounds" : "Unmute sounds"}
      aria-label={enabled ? "Mute sounds" : "Unmute sounds"}
      className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04] text-sm transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.08]"
    >
      {enabled ? "🔊" : "🔇"}
    </button>
  );
}
