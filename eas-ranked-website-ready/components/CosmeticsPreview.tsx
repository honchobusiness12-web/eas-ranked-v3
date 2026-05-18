import type { Cosmetics } from "@/lib/premium";
import {
  THEMES,
  RANK_BADGE_STYLES,
  ACHIEVEMENT_FRAMES,
  PROFILE_COLORS,
  GRADIENT_PRESETS,
  BANNER_COLORS,
  PROFILE_EFFECTS,
  buildGradientCSS,
} from "@/lib/premium-constants";

interface CosmeticsPreviewProps {
  cosmetics: Cosmetics;
}

function findById<T extends { id: string }>(list: T[], id: string | null | undefined): T | undefined {
  if (!id) return undefined;
  return list.find((item) => item.id === id);
}

/**
 * Displays a summary of a user's active cosmetics — theme, rank badge style,
 * achievement frame, profile colour, gradient, banner, effect, and player title.
 * Premium customizations (gradient, banner, effect) are listed first so they
 * are clearly visible and not buried under theme defaults.
 */
export default function CosmeticsPreview({ cosmetics }: CosmeticsPreviewProps) {
  const theme = findById(THEMES, cosmetics.theme);
  const badgeStyle = findById(RANK_BADGE_STYLES, cosmetics.rank_badge_style);
  const frame = findById(ACHIEVEMENT_FRAMES, cosmetics.achievement_frame);

  // Profile color: stored as a hex value (e.g. "#FF6B6B") — look up the label,
  // but fall back to showing the raw hex if it's a custom value not in the preset list.
  const profileColorPreset = findById(PROFILE_COLORS, cosmetics.profile_color);
  const profileColorLabel = profileColorPreset?.label ?? cosmetics.profile_color ?? null;
  const profileColorHex = cosmetics.profile_color ?? null;

  // Premium customizations
  const gradientPreset = findById(GRADIENT_PRESETS, cosmetics.gradient_preset);
  const gradientCSS = buildGradientCSS(cosmetics.gradient_preset ?? "none");
  const bannerEntry = findById(BANNER_COLORS, cosmetics.banner_color);
  const effectEntry = findById(PROFILE_EFFECTS, cosmetics.profile_effect);

  const rows: { icon: string; label: string; value: string; accent?: string; gradient?: string }[] = [];

  // --- Premium customizations first (highest priority) ---

  if (gradientPreset && cosmetics.gradient_preset !== "none") {
    rows.push({
      icon: "🌈",
      label: "Gradient",
      value: gradientPreset.label,
      gradient: gradientCSS ?? undefined,
    });
  }

  if (bannerEntry && cosmetics.banner_color !== "default") {
    rows.push({
      icon: "🖼",
      label: "Banner",
      value: bannerEntry.label,
      accent: bannerEntry.color ?? undefined,
      gradient: bannerEntry.gradient ?? undefined,
    });
  }

  if (effectEntry && cosmetics.profile_effect !== "none") {
    rows.push({
      icon: effectEntry.icon,
      label: "Profile Effect",
      value: effectEntry.label,
    });
  }

  // --- Base cosmetics ---

  if (theme && cosmetics.theme !== "dark") {
    rows.push({
      icon: theme.icon,
      label: "Theme",
      value: theme.label,
      accent: theme.preview,
    });
  }

  if (badgeStyle && cosmetics.rank_badge_style !== "default") {
    rows.push({
      icon: badgeStyle.icon,
      label: "Rank Badge Style",
      value: badgeStyle.label,
    });
  }

  if (frame && cosmetics.achievement_frame !== "default") {
    rows.push({
      icon: frame.icon,
      label: "Achievement Frame",
      value: frame.label,
    });
  }

  if (profileColorHex && profileColorHex !== "#FF6B6B") {
    rows.push({
      icon: "🎨",
      label: "Profile Colour",
      value: profileColorLabel ?? profileColorHex,
      accent: profileColorHex,
    });
  }

  if (cosmetics.player_title) {
    rows.push({
      icon: "🏷️",
      label: "Player Title",
      value: cosmetics.player_title,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d0d14] p-6">
      <h2 className="mb-4 text-xl font-black">✨ Active Cosmetics</h2>
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"
          >
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span>{row.icon}</span>
              <span>{row.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {(row.gradient || row.accent) && (
                <span
                  className="h-3 w-12 rounded-full border border-white/20"
                  style={{ background: row.gradient ?? row.accent }}
                />
              )}
              <span className="text-sm font-black">{row.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
