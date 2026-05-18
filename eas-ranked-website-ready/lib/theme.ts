// Theme utilities — shared between ThemeToggle and ThemeProvider

export type Theme = "dark" | "light";

export const THEME_KEY = "eas-theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem(THEME_KEY) as Theme) || "dark";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}
