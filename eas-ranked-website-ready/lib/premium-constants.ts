export type Option = { id: string; label: string; icon?: string; preview?: string; color?: string; gradient?: string };
export const THEMES: Option[] = [{ id: "dark", label: "Dark", preview: "#050816", icon: "✦" }];
export const ACHIEVEMENT_FRAMES: Option[] = [{ id: "default", label: "Default", icon: "✦" }];
export const BANNER_COLORS: Option[] = [{ id: "default", label: "Default", color: "#7c3aed", gradient: "linear-gradient(135deg,#0f172a,#4c1d95)" }];
export const RANK_BADGE_STYLES: Option[] = [{ id: "default", label: "Default", icon: "✦" }];
export const PROFILE_COLORS: Option[] = [{ id: "violet", label: "Violet", color: "#7c3aed" }];
export const GRADIENT_PRESETS: Option[] = [{ id: "none", label: "None", gradient: "" }];
export const PROFILE_EFFECTS: Option[] = [{ id: "none", label: "None", icon: "✦" }];
export function buildGradientCSS(_id?: string) { return ""; }
