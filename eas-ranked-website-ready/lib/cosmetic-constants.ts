// ---------------------------------------------------------------------------
// Cosmetic constants — no database imports, safe for Client Components
// ---------------------------------------------------------------------------

export interface GradientPreset {
  id: string;
  label: string;
  from: string;
  to: string;
  css: string;
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  { id: "orange-red",    label: "Orange → Red",    from: "#FF9F43", to: "#EF4444", css: "linear-gradient(135deg, #FF9F43, #EF4444)" },
  { id: "blue-purple",   label: "Blue → Purple",   from: "#0099FF", to: "#A855F7", css: "linear-gradient(135deg, #0099FF, #A855F7)" },
  { id: "green-cyan",    label: "Green → Cyan",    from: "#00FF88", to: "#00D4FF", css: "linear-gradient(135deg, #00FF88, #00D4FF)" },
  { id: "pink-purple",   label: "Pink → Purple",   from: "#FF6BFF", to: "#A855F7", css: "linear-gradient(135deg, #FF6BFF, #A855F7)" },
  { id: "yellow-orange", label: "Yellow → Orange", from: "#FFD93D", to: "#FF9F43", css: "linear-gradient(135deg, #FFD93D, #FF9F43)" },
  { id: "cyan-blue",     label: "Cyan → Blue",     from: "#00D4FF", to: "#0099FF", css: "linear-gradient(135deg, #00D4FF, #0099FF)" },
  { id: "lime-green",    label: "Lime → Green",    from: "#A3E635", to: "#00FF88", css: "linear-gradient(135deg, #A3E635, #00FF88)" },
  { id: "red-pink",      label: "Red → Pink",      from: "#EF4444", to: "#FF6BFF", css: "linear-gradient(135deg, #EF4444, #FF6BFF)" },
  { id: "purple-blue",   label: "Purple → Blue",   from: "#A855F7", to: "#0099FF", css: "linear-gradient(135deg, #A855F7, #0099FF)" },
  { id: "gold-orange",   label: "Gold → Orange",   from: "#FFD700", to: "#FF9F43", css: "linear-gradient(135deg, #FFD700, #FF9F43)" },
];

export interface UsernameColor {
  id: string;
  label: string;
  hex: string;
}

export const USERNAME_COLORS: UsernameColor[] = [
  { id: "red",    label: "Red",    hex: "#EF4444" },
  { id: "orange", label: "Orange", hex: "#FF9F43" },
  { id: "yellow", label: "Yellow", hex: "#FFD93D" },
  { id: "green",  label: "Green",  hex: "#00FF88" },
  { id: "cyan",   label: "Cyan",   hex: "#00D4FF" },
  { id: "blue",   label: "Blue",   hex: "#0099FF" },
  { id: "purple", label: "Purple", hex: "#A855F7" },
  { id: "pink",   label: "Pink",   hex: "#FF6BFF" },
  { id: "white",  label: "White",  hex: "#FFFFFF" },
  { id: "gold",   label: "Gold",   hex: "#FFD700" },
  { id: "silver", label: "Silver", hex: "#C0C0C0" },
  { id: "lime",   label: "Lime",   hex: "#A3E635" },
];
