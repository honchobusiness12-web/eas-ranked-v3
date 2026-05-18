"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage?: number;
  totalItems?: number;
}

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  itemsPerPage,
  totalItems,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  // Build page number array with ellipsis
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
      {totalItems !== undefined && itemsPerPage !== undefined && (
        <p className="text-xs text-zinc-600 font-medium">
          {Math.min((page - 1) * itemsPerPage + 1, totalItems)}–{Math.min(page * itemsPerPage, totalItems)} of {totalItems.toLocaleString()}
        </p>
      )}
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-zinc-400 transition-all duration-200 disabled:opacity-25 hover:border-white/[0.12] hover:bg-white/[0.08] hover:text-white"
        >
          ← Prev
        </button>

        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-1.5 text-zinc-700 text-xs">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
                p === page
                  ? "border-purple-500/40 bg-purple-500/15 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                  : "border-white/[0.07] bg-white/[0.04] text-zinc-500 hover:border-white/[0.12] hover:bg-white/[0.08] hover:text-zinc-300"
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-zinc-400 transition-all duration-200 disabled:opacity-25 hover:border-white/[0.12] hover:bg-white/[0.08] hover:text-white"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
