"use client";

import Link from "next/link";
import { useSounds } from "@/components/SoundProvider";
import type { ComponentProps } from "react";

type SoundLinkProps = ComponentProps<typeof Link> & {
  soundType?: "click" | "success";
};

/**
 * Drop-in replacement for Next.js <Link> that plays a sound on click/hover.
 * Accepts all the same props as <Link>.
 */
export default function SoundLink({ onClick, onMouseEnter, soundType = "click", children, ...props }: SoundLinkProps) {
  const sounds = useSounds();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (soundType === "success") {
      sounds.success();
    } else {
      sounds.click();
    }
    onClick?.(e);
  }

  function handleMouseEnter(e: React.MouseEvent<HTMLAnchorElement>) {
    sounds.hover();
    onMouseEnter?.(e);
  }

  return (
    <Link {...props} onClick={handleClick} onMouseEnter={handleMouseEnter}>
      {children}
    </Link>
  );
}
