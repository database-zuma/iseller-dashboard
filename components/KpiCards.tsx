"use client";

interface KpiData {
  revenue: number;
  pairs: number;
  transactions: number;
  atu: number;
  asp: number;
  atv: number;
}

function fmt(n: number, type: "currency" | "int" | "decimal"): string {
  if (type === "currency") {
    return "Rp " + Math.round(n).toLocaleString("id-ID");
  }
  if (type === "decimal") {
    return n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  return Math.round(n).toLocaleString("id-ID");
}

const CARDS = [
  { label: "Revenue", key: "revenue" as const, type: "currency" as const },
  { label: "Pairs Sold", key: "pairs" as const, type: "int" as const },
  { label: "Transactions", key: "transactions" as const, type: "int" as const },
  { label: "ATU", key: "atu" as const, type: "decimal" as const, tooltip: "Avg Transaction Unit = Pairs / Transactions" },
  { label: "ASP", key: "asp" as const, type: "currency" as const, tooltip: "Avg Selling Price = Revenue / Pairs" },
  { label: "ATV", key: "atv" as const, type: "currency" as const, tooltip: "Avg Transaction Value = Revenue / Transactions" },
];

export default function KpiCards({ kpis, loading }: { kpis?: KpiData; loading?: boolean }) {
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
      {CARDS.map(({ label, key, type, tooltip }) => (
        <div
          key={key}
          title={tooltip}
          className="bg-card border border-border rounded-md px-3 py-3 flex flex-col gap-0.5"
        >
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          {loading ? (
            <div className="h-5 w-20 bg-muted animate-pulse rounded" />
          ) : (
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {kpis ? fmt(kpis[key], type) : "—"}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
