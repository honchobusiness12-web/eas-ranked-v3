// ---------------------------------------------------------------------------
// Announcement constants — no database imports, safe for Client Components
// ---------------------------------------------------------------------------

export type AnnouncementColor =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple";

export const ANNOUNCEMENT_COLORS: { id: AnnouncementColor; label: string; hex: string; bg: string; border: string; text: string }[] = [
  { id: "red",    label: "🔴 Urgent",   hex: "#EF4444", bg: "bg-red-950/30",    border: "border-red-700/50",    text: "text-red-300"    },
  { id: "orange", label: "🟠 Update",   hex: "#FF9F43", bg: "bg-orange-950/30", border: "border-orange-700/50", text: "text-orange-300" },
  { id: "yellow", label: "🟡 Info",     hex: "#FFD93D", bg: "bg-yellow-950/30", border: "border-yellow-700/50", text: "text-yellow-300" },
  { id: "green",  label: "🟢 Success",  hex: "#00FF88", bg: "bg-green-950/30",  border: "border-green-700/50",  text: "text-green-300"  },
  { id: "blue",   label: "🔵 Feature",  hex: "#0099FF", bg: "bg-blue-950/30",   border: "border-blue-700/50",   text: "text-blue-300"   },
  { id: "purple", label: "🟣 Special",  hex: "#A855F7", bg: "bg-purple-950/30", border: "border-purple-700/50", text: "text-purple-300" },
];
