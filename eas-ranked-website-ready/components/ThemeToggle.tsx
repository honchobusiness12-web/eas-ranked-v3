"use client";

import { useTheme } from "@/components/ThemeProvider";
import { useSounds } from "@/components/SoundProvider";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { click } = useSounds();

  function handleClick() {
    click();
    toggle();
  }

  return (
    <button
      onClick={handleClick}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg transition hover:border-purple-600 hover:bg-purple-950/40"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
