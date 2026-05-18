"use client";

import { useSounds } from "@/components/SoundProvider";
import type { ComponentProps } from "react";

type SoundButtonProps = ComponentProps<"button"> & {
  soundType?: "click" | "error";
};

/**
 * Drop-in replacement for <button> that plays a sound on click/hover.
 */
export default function SoundButton({ onClick, onMouseEnter, soundType = "click", children, ...props }: SoundButtonProps) {
  const sounds = useSounds();

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (soundType === "error") {
      sounds.error();
    } else {
      sounds.click();
    }
    onClick?.(e);
  }

  function handleMouseEnter(e: React.MouseEvent<HTMLButtonElement>) {
    sounds.hover();
    onMouseEnter?.(e);
  }

  return (
    <button {...props} onClick={handleClick} onMouseEnter={handleMouseEnter}>
      {children}
    </button>
  );
}
