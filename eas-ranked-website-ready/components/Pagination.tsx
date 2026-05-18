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

  const btnBase: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(255,255,255,0.04)",
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 0.15s cubic-bezier(0.4,0,0.2,1), background 0.15s cubic-bezier(0.4,0,0.2,1), border-color 0.15s cubic-bezier(0.4,0,0.2,1), box-shadow 0.15s cubic-bezier(0.4,0,0.2,1), color 0.15s cubic-bezier(0.4,0,0.2,1), opacity 0.15s cubic-bezier(0.4,0,0.2,1)",
    color: "#a1a1aa",
  };

  const btnHoverStyle = (active: boolean): React.CSSProperties =>
    active
      ? {
          ...btnBase,
          border: "1px solid rgba(168,85,247,0.40)",
          background: "rgba(168,85,247,0.15)",
          color: "#c4b5fd",
          boxShadow: "0 0 14px rgba(168,85,247,0.22)",
        }
      : btnBase;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
      {totalItems !== undefined && itemsPerPage !== undefined && (
        <p style={{ fontSize: 12, color: "#52525b", fontWeight: 600, margin: 0 }}>
          {Math.min((page - 1) * itemsPerPage + 1, totalItems)}–{Math.min(page * itemsPerPage, totalItems)} of {totalItems.toLocaleString()}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          style={{
            ...btnBase,
            opacity: page === 1 ? 0.28 : 1,
            cursor: page === 1 ? "not-allowed" : "pointer",
            pointerEvents: page === 1 ? "none" : "auto",
          }}
          onMouseEnter={(e) => { if (page !== 1) { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "white"; } }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = "#a1a1aa"; }}
          onMouseDown={(e) => { if (page !== 1) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.96)"; }}
          onMouseUp={(e) => { if (page !== 1) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
        >
          ← Prev
        </button>

        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} style={{ padding: "0 4px", color: "#3f3f46", fontSize: 12 }}>…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              style={btnHoverStyle(p === page)}
              onMouseEnter={(e) => { if (p !== page) { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#d4d4d8"; } }}
              onMouseLeave={(e) => { if (p !== page) { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = "#71717a"; } }}
              onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.96)"; }}
              onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = p !== page ? "translateY(-1px)" : ""; }}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          style={{
            ...btnBase,
            opacity: page === totalPages ? 0.28 : 1,
            cursor: page === totalPages ? "not-allowed" : "pointer",
            pointerEvents: page === totalPages ? "none" : "auto",
          }}
          onMouseEnter={(e) => { if (page !== totalPages) { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "white"; } }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = "#a1a1aa"; }}
          onMouseDown={(e) => { if (page !== totalPages) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.96)"; }}
          onMouseUp={(e) => { if (page !== totalPages) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
