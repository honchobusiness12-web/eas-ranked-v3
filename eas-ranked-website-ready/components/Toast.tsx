"use client";

import { useEffect } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const TYPE_STYLES: Record<ToastType, string> = {
  success: "border-green-500/30 text-green-300",
  error:   "border-red-500/30 text-red-300",
  info:    "border-purple-500/30 text-purple-300",
  warning: "border-yellow-500/30 text-yellow-300",
};

const TYPE_ICONS: Record<ToastType, string> = {
  success: "✅",
  error:   "❌",
  info:    "ℹ️",
  warning: "⚠️",
};

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 3500);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-depth-xl backdrop-blur-xl animate-slide-in ${TYPE_STYLES[toast.type]}`}
      style={{ minWidth: 260, maxWidth: 380, background: "rgba(11,11,31,0.95)" }}
    >
      <span className="text-lg">{TYPE_ICONS[toast.type]}</span>
      <p className="flex-1 text-sm font-semibold">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="ml-2 rounded-md px-1.5 py-0.5 text-xs opacity-50 transition-all duration-200 hover:bg-white/[0.08] hover:opacity-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
