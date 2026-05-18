"use client";

interface TrendingIndicatorProps {
  delta: number;
  animate?: boolean;
}

export default function TrendingIndicator({ delta, animate = false }: TrendingIndicatorProps) {
  if (delta === 0) {
    return <span className="text-xs text-zinc-500 font-medium">—</span>;
  }

  const isUp = delta > 0;
  const colorClass = isUp ? "text-green-400" : "text-red-400";
  const bgClass = isUp ? "bg-green-500/10" : "bg-red-500/10";
  const arrow = isUp ? "↑" : "↓";
  const pulseClass = animate ? "animate-pulse" : "";

  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold ${colorClass} ${bgClass} ${pulseClass}`}>
      {arrow}
      {Math.abs(delta)}
    </span>
  );
}
