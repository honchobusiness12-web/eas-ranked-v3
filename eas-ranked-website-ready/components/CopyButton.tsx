"use client";

import { useState, useCallback } from "react";

interface CopyButtonProps {
  text: string;
  /** Optional label shown next to the icon. Defaults to nothing. */
  label?: string;
  /** Tailwind class string for the button wrapper. */
  className?: string;
  /** Size variant — controls icon/text sizing. */
  size?: "xs" | "sm" | "md";
}

/**
 * Reusable copy-to-clipboard button.
 * Shows a brief "Copied!" confirmation after a successful copy.
 */
export default function CopyButton({
  text,
  label,
  className = "",
  size = "sm",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  const sizeClasses = {
    xs: "px-1.5 py-0.5 text-[10px] gap-1",
    sm: "px-2 py-1 text-xs gap-1",
    md: "px-3 py-1.5 text-sm gap-1.5",
  }[size];

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : `Copy: ${text}`}
      className={`inline-flex items-center rounded-lg border font-bold transition-all select-none ${sizeClasses} ${
        copied
          ? "border-green-600/50 bg-green-950/30 text-green-400"
          : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
      } ${className}`}
    >
      <span>{copied ? "✅" : "📋"}</span>
      {label && <span>{copied ? "Copied!" : label}</span>}
      {!label && copied && <span>Copied!</span>}
    </button>
  );
}
