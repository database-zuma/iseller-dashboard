"use client";


import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { toCSV, downloadCSV, downloadXLSX } from "@/lib/export";

interface MonthMeta {
  key: string; // "2025-01"
  label: string; // "Jan 2025"
}

interface MonthlyData {
  qty: number;
  revenue: number;
  target: number | null;
  achievementPct: number | null;
}

interface StoreRow {
  toko: string;
  branch: string;
  totalRevenue: number;
  monthly: Record<string, MonthlyData>;
}

interface AchievementData {
  months: MonthMeta[];
  stores: StoreRow[];
}

function fmtRp(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}jt`;
  if (n > 0) return Math.round(n).toLocaleString("en-US");
  return "—";
}

function achColor(pct: number | null): string {
  if (pct === null) return "";
  if (pct >= 100) return "text-[#00E273] font-semibold";
  if (pct >= 80) return "text-amber-500 font-semibold";
  return "text-red-500 font-semibold";
}

function achBg(pct: number | null): string {
  if (pct === null) return "";
  if (pct >= 100) return "bg-[#00E273]/10";
  if (pct >= 80) return "bg-amber-50 dark:bg-amber-500/10";
  return "bg-red-50 dark:bg-red-500/10";
}

export default function StoreAchievement() {
  const { data, isLoading } = useSWR<AchievementData>("/api/achievement", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120000,
  });


  const months = data?.months ?? [];
  const stores = data?.stores ?? [];

  // Export handler
  const handleExport = (format: "csv" | "xlsx") => {
    if (!data) return;
    const headers = ["#", "Store", "Branch"];
    const keys = ["rank", "toko", "branch"];
    for (const m of months) {
      headers.push(`${m.label} Qty`, `${m.label} Rev`, `${m.label} Target`, `${m.label} Ach%`);
      keys.push(`${m.key}_qty`, `${m.key}_rev`, `${m.key}_target`, `${m.key}_ach`);
    }
    const rows: Record<string, unknown>[] = stores.map((s, idx) => {
      const row: Record<string, unknown> = { rank: idx + 1, toko: s.toko, branch: s.branch };
      for (const m of months) {
        const d = s.monthly[m.key];
        row[`${m.key}_qty`] = d?.qty ?? 0;
        row[`${m.key}_rev`] = d?.revenue ?? 0;
        row[`${m.key}_target`] = d?.target ?? "";
        row[`${m.key}_ach`] = d?.achievementPct != null ? `${d.achievementPct}%` : "—";
      }
      return row;
    });
    if (format === "csv") downloadCSV(toCSV(headers, rows, keys), "store_achievement.csv");
    else void downloadXLSX(headers, rows, keys, "store_achievement.xlsx");
  };

  const thBase = "px-2 py-2 text-[8px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap";
  const tdBase = "px-2 py-1.5 text-[10px] tabular-nums whitespace-nowrap";

  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden flex flex-col shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">
            Store Achievement
          </h3>
          <span className="text-[9px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-sm border border-border">
            Jan 2025 — Dec 2026 · Filter-independent
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Export buttons */}
          {!isLoading && stores.length > 0 && (
            <div className="flex gap-1">
              <button type="button" onClick={() => handleExport("csv")}
                className="text-[9px] px-2 py-0.5 rounded-sm border border-border hover:bg-muted transition-colors font-medium">
                CSV
              </button>
              <button type="button" onClick={() => handleExport("xlsx")}
                className="text-[9px] px-2 py-0.5 rounded-sm border border-border hover:bg-muted transition-colors font-medium">
                XLSX
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-max min-w-full text-xs border-collapse">
          <thead>
            {/* Row 1: Month group headers */}
            <tr className="border-b border-border bg-muted/40">
              <th className={`${thBase} text-center sticky left-0 z-20 bg-muted/40 w-8 border-r border-border/30`} rowSpan={2}>#</th>
              <th className={`${thBase} text-left sticky left-8 z-20 bg-muted/40 min-w-[160px] border-r border-border/30`} rowSpan={2}>Store</th>
              <th className={`${thBase} text-left sticky left-[224px] z-20 bg-muted/40 min-w-[70px] border-r border-border`} rowSpan={2}>Branch</th>
              {months.map((m) => (
                <th
                  key={m.key}
                  colSpan={4}
                  className={`${thBase} text-center border-l border-border ${
                    m.key.endsWith("-01") ? "border-l-2 border-l-border" : ""
                  }`}
                >
                  {m.label}
                </th>
              ))}
            </tr>
            {/* Row 2: Sub-headers per month */}
            <tr className="border-b border-border bg-muted/20">
              {months.map((m) => (
                <Fragment key={`sub-${m.key}`}>
                  <th className={`${thBase} text-right ${m.key.endsWith("-01") ? "border-l-2 border-l-border" : "border-l border-border/40"}`}>Qty</th>
                  <th className={`${thBase} text-right`}>Rev</th>
                  <th className={`${thBase} text-right`}>Target</th>
                  <th className={`${thBase} text-right`}>Ach%</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 10 }, (_, i) => (
                <tr key={`skel-${String(i)}`} className="border-b border-border/30">
                  <td className="px-2 py-2 sticky left-0 bg-card"><div className="h-3 bg-muted animate-pulse rounded-sm w-4" /></td>
                  <td className="px-2 py-2 sticky left-8 bg-card"><div className="h-3 bg-muted animate-pulse rounded-sm w-28" /></td>
                  <td className="px-2 py-2 sticky left-[224px] bg-card"><div className="h-3 bg-muted animate-pulse rounded-sm w-12" /></td>
                  {months.map((m) => (
                    <Fragment key={`sk-${m.key}`}>
                      {Array.from({ length: 4 }, (_, j) => (
                        <td key={`sk-${m.key}-${String(j)}`} className="px-2 py-2">
                          <div className="h-3 bg-muted animate-pulse rounded-sm w-10" />
                        </td>
                      ))}
                    </Fragment>
                  ))}
                </tr>
              ))
            ) : stores.length ? (
              stores.map((s, idx) => (
                <tr key={s.toko} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                  <td className={`${tdBase} text-center sticky left-0 z-10 bg-card text-muted-foreground font-medium border-r border-border/30`}>{idx + 1}</td>
                  <td className={`${tdBase} sticky left-8 z-10 bg-card font-medium text-foreground max-w-[160px] truncate border-r border-border/30`}>{s.toko}</td>
                  <td className={`${tdBase} sticky left-[224px] z-10 bg-card text-muted-foreground border-r border-border`}>{s.branch}</td>
                  {months.map((m) => {
                    const d = s.monthly[m.key] || { qty: 0, revenue: 0, target: null, achievementPct: null };
                    return (
                      <Fragment key={`${s.toko}-${m.key}`}>
                        <td className={`${tdBase} text-right text-muted-foreground ${m.key.endsWith("-01") ? "border-l-2 border-l-border" : "border-l border-border/20"}`}>
                          {d.qty > 0 ? d.qty.toLocaleString("en-US") : "—"}
                        </td>
                        <td className={`${tdBase} text-right`}>
                          {d.revenue > 0 ? fmtRp(d.revenue) : "—"}
                        </td>
                        <td className={`${tdBase} text-right text-muted-foreground`}>
                          {d.target != null ? fmtRp(d.target) : "—"}
                        </td>
                        <td className={`${tdBase} text-right ${achColor(d.achievementPct)} ${achBg(d.achievementPct)}`}>
                          {d.achievementPct != null ? `${d.achievementPct}%` : "—"}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3 + months.length * 4} className="px-4 py-8 text-center text-muted-foreground text-xs">
                  No data
                </td>
              </tr>
            )}
          </tbody>
          {/* Footer totals */}
          {!isLoading && stores.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[#00E273]/40 bg-muted/40">
                <td className={`${tdBase} text-center sticky left-0 z-10 bg-muted/40 font-bold text-foreground border-r border-border/30`} colSpan={3}>
                  TOTAL ({stores.length} stores)
                </td>
                {months.map((m) => {
                  const totQty = stores.reduce((sum, s) => sum + (s.monthly[m.key]?.qty ?? 0), 0);
                  const totRev = stores.reduce((sum, s) => sum + (s.monthly[m.key]?.revenue ?? 0), 0);
                  const totTarget = stores.reduce((sum, s) => sum + (s.monthly[m.key]?.target ?? 0), 0);
                  const totAch = totTarget > 0 ? Math.round((totRev / totTarget) * 1000) / 10 : null;
                  return (
                    <Fragment key={`tot-${m.key}`}>
                      <td className={`${tdBase} text-right font-bold text-foreground ${m.key.endsWith("-01") ? "border-l-2 border-l-border" : "border-l border-border/20"}`}>
                        {totQty > 0 ? totQty.toLocaleString("en-US") : "—"}
                      </td>
                      <td className={`${tdBase} text-right font-bold text-foreground`}>
                        {totRev > 0 ? fmtRp(totRev) : "—"}
                      </td>
                      <td className={`${tdBase} text-right font-bold text-muted-foreground`}>
                        {totTarget > 0 ? fmtRp(totTarget) : "—"}
                      </td>
                      <td className={`${tdBase} text-right font-bold ${achColor(totAch)} ${achBg(totAch)}`}>
                        {totAch != null ? `${totAch}%` : "—"}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// Fragment helper (avoid importing React just for this)
function Fragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
