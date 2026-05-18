import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          0: "#04040e",
          1: "#07071a",
          2: "#0b0b1f",
          3: "#0f0f28",
          4: "#141432",
        },
        brand: {
          coral:   "#FF6B6B",
          orange:  "#FF9F43",
          yellow:  "#FFD93D",
          teal:    "#00D4FF",
          blue:    "#4F8EF7",
          lime:    "#00FF88",
          purple:  "#A855F7",
          violet:  "#7C3AED",
          indigo:  "#6366F1",
          pink:    "#EC4899",
          cyan:    "#06B6D4",
        },
      },
      spacing: {
        "4.5": "1.125rem",
        "13":  "3.25rem",
        "15":  "3.75rem",
        "18":  "4.5rem",
        "22":  "5.5rem",
        "26":  "6.5rem",
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "1rem" }],
      },
      maxWidth: {
        "8xl": "88rem",
        "9xl": "96rem",
      },
      transitionDuration: {
        "150": "150ms",
        "250": "250ms",
        "400": "400ms",
      },
      backdropBlur: {
        xs: "2px",
        "2xl": "40px",
        "3xl": "64px",
      },
      boxShadow: {
        "glow-orange":  "0 0 20px rgba(255,159,67,0.35), 0 0 60px rgba(255,159,67,0.12)",
        "glow-purple":  "0 0 20px rgba(168,85,247,0.35), 0 0 60px rgba(168,85,247,0.12)",
        "glow-teal":    "0 0 20px rgba(0,212,255,0.35), 0 0 60px rgba(0,212,255,0.12)",
        "glow-blue":    "0 0 20px rgba(79,142,247,0.35), 0 0 60px rgba(79,142,247,0.12)",
        "glow-gold":    "0 0 20px rgba(255,215,0,0.40), 0 0 60px rgba(255,159,67,0.18)",
        "depth-sm":     "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.6)",
        "depth-md":     "0 4px 20px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.7)",
        "depth-lg":     "0 8px 40px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.8)",
        "depth-xl":     "0 16px 60px rgba(0,0,0,0.7), 0 8px 20px rgba(0,0,0,0.9)",
        "glass":        "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        "glass-lg":     "0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
        "inner-glow":   "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.3)",
      },
      fontWeight: {
        "950": "950",
      },
      letterSpacing: {
        "tightest": "-0.04em",
        "tighter":  "-0.02em",
        "widest":   "0.2em",
      },
      animation: {
        "fade-in":        "fade-in 0.4s ease-out both",
        "fade-up":        "fade-up 0.5s ease-out both",
        "slide-in":       "slide-in 0.3s ease-out both",
        "slide-up":       "slide-up 0.4s ease-out both",
        "sun-pulse":      "sun-pulse 4s ease-in-out infinite",
        "wave":           "wave 3s ease-in-out infinite",
        "premium-glow":   "premium-glow 2.5s ease-in-out infinite",
        "glow-pulse":     "glow-pulse 3s ease-in-out infinite",
        "shimmer":        "shimmer 2s infinite linear",
        "float":          "float 6s ease-in-out infinite",
        "float-delayed":  "float 6s ease-in-out 2s infinite",
        "gradient-shift": "gradient-shift 8s ease infinite",
        "scale-in":       "scale-in 0.3s ease-out both",
        "border-glow":    "border-glow 3s ease-in-out infinite",
        "spin-slow":      "spin 8s linear infinite",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%":      { opacity: "1" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-12px)" },
        },
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%":      { backgroundPosition: "100% 50%" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.92)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        "border-glow": {
          "0%, 100%": { borderColor: "rgba(168,85,247,0.3)" },
          "50%":      { borderColor: "rgba(168,85,247,0.7)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
