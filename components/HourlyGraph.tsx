"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

/* ─── types ─────────────────────────────────────────── */

interface WeeklyPoint {
  dow: number;
  hour: number;
  pairs: number;
  revenue: number;
  transactions: number;
}

interface BranchWeekly {
  branch: string;
  weekly: WeeklyPoint[];
}

interface HourlyPoint {
  hour: number;
  pairs: number;
  revenue: number;
  transactions: number;
}

interface DowSummary {
  dow: number;
  pairs: number;
  revenue: number;
  transactions: number;
}

interface HourlyData {
  weekly: WeeklyPoint[];
  byBranchWeekly: BranchWeekly[];
  dowSummary: DowSummary[];
  hourly: HourlyPoint[];
  dateRange: { from: string | null; to: string | null };
  kpis: {
    totalPairs: number;
    totalRevenue: number;
    totalTxn: number;
    peakHour: number;
    peakPairs: number;
    peakWeeklyDow: number;
    peakWeeklyHour: number;
    peakWeeklyPairs: number;
  };
}

/* ─── helpers ───────────────────────────────────────── */

function fmt(n: number, type: "currency" | "int"): string {
  if (type === "currency") {
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
    return "Rp " + Math.round(n).toLocaleString("en-US");
  }
  return Math.round(n).toLocaleString("en-US");
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatDate(dateStr: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const day = parseInt(parts[2], 10);
  const month = months[parseInt(parts[1], 10) - 1] || parts[1];
  const year = parts[0];
  return `${day} ${month} ${year}`;
}

/* Build 168 labels: Mon 00:00 → Sun 23:00 */
const WEEKLY_LABELS: string[] = [];
for (let d = 0; d < 7; d++) {
  for (let h = 0; h < 24; h++) {
    WEEKLY_LABELS.push(`${DAY_NAMES[d]} ${String(h).padStart(2, "0")}:00`);
  }
}

const BRANCH_COLORS: Record<string, string> = {
  "Jatim": "#00E273",
  "Jakarta": "#3B82F6",
  "Sumatra": "#F59E0B",
  "Sulawesi": "#EF4444",
  "Batam": "#8B5CF6",
  "Bali": "#EC4899",
};

function getBranchColor(branch: string, idx: number): string {
  return BRANCH_COLORS[branch] || [
    "#06B6D4", "#84CC16", "#F97316", "#6366F1", "#14B8A6", "#E11D48",
  ][idx % 6];
}

/* ─── component ─────────────────────────────────────── */

export default function HourlyGraph() {
  const searchParams = useSearchParams();

  /* ── build API URL from shared filters ── */
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    const from = searchParams.get("from") || "2026-01-01";
    const to = searchParams.get("to") || new Date().toISOString().substring(0, 10);
    params.set("from", from);
    params.set("to", to);
    for (const key of ["branch", "store", "series", "gender", "tier", "color", "tipe", "version"]) {
      const val = searchParams.get(key);
      if (val) params.set(key, val);
    }
    return `/api/hourly?${params.toString()}`;
  }, [searchParams]);

  /* ── fetch ── */
  const { data, isLoading } = useSWR<HourlyData>(apiUrl, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 60000,
  });

  /* ── date range subtitle ── */
  const dateRangeLabel = useMemo(() => {
    if (!data?.dateRange?.from || !data?.dateRange?.to) return null;
    return `${formatDate(data.dateRange.from)} — ${formatDate(data.dateRange.to)}`;
  }, [data]);

  /* ── chart: weekly overall (168 points) ── */
  const weeklyChartData = useMemo(() => ({
    labels: WEEKLY_LABELS,
    datasets: [
      {
        label: "Pairs (Qty)",
        data: data?.weekly?.map((p) => p.pairs) ?? Array(168).fill(0),
        borderColor: "#00E273",
        backgroundColor: "rgba(0, 226, 115, 0.06)",
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: "#00E273",
        borderWidth: 2,
      },
      {
        label: "Transactions",
        data: data?.weekly?.map((p) => p.transactions) ?? Array(168).fill(0),
        borderColor: "#1a1a1a",
        backgroundColor: "transparent",
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointBackgroundColor: "#1a1a1a",
        borderWidth: 1.2,
        borderDash: [4, 3],
      },
    ],
  }), [data]);

  /* ── chart: by-branch weekly (168 points per branch) ── */
  const branchWeeklyChartData = useMemo(() => {
    if (!data?.byBranchWeekly?.length) return null;
    return {
      labels: WEEKLY_LABELS,
      datasets: data.byBranchWeekly.map((b, idx) => ({
        label: b.branch || "Unknown",
        data: b.weekly.map((p) => p.pairs),
        borderColor: getBranchColor(b.branch, idx),
        backgroundColor: "transparent",
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointBackgroundColor: getBranchColor(b.branch, idx),
        borderWidth: 1.8,
      })),
    };
  }, [data]);

  /* ── chart options for 168-point weekly view ── */
  const weeklyOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        position: "top" as const,
        labels: { font: { size: 10, family: "Inter" }, usePointStyle: true, pointStyle: "circle" as const },
      },
      tooltip: {
        callbacks: {
          title: (items: { dataIndex: number }[]) => {
            const idx = items[0]?.dataIndex ?? 0;
            return WEEKLY_LABELS[idx] ?? "";
          },
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const y = ctx.parsed.y ?? 0;
            return `${ctx.dataset.label}: ${y.toLocaleString("en-US")}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          font: { size: 8 },
          maxRotation: 0,
          autoSkip: false,
          callback: function (_: unknown, index: number) {
            /* Show day name at hour 0 of each day, hour labels at 06/12/18 */
            const hourInDay = index % 24;
            if (hourInDay === 0) return DAY_NAMES[Math.floor(index / 24)];
            if (hourInDay === 6 || hourInDay === 12 || hourInDay === 18) {
              return `${String(hourInDay).padStart(2, "0")}`;
            }
            return "";
          },
        },
        grid: {
          display: true,
          color: (ctx: { index: number }) => {
            /* Thicker line at day boundaries (every 24th tick) */
            return ctx.index % 24 === 0 ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.02)";
          },
          lineWidth: (ctx: { index: number }) => ctx.index % 24 === 0 ? 1.5 : 0.5,
        },
      },
      y: {
        type: "linear" as const,
        position: "left" as const,
        beginAtZero: true,
        ticks: { font: { size: 9 } },
        grid: { color: "rgba(0,0,0,0.04)" },
      },
    },
  }), []);

  /* ── KPIs ── */
  const kpis = data?.kpis;
  const peakDowLabel = kpis ? DAY_NAMES[kpis.peakWeeklyDow - 1] : undefined;

  const KPI_CARDS: { label: string; value: string | undefined; sub?: string }[] = [
    { label: "Total Pairs", value: kpis ? fmt(kpis.totalPairs, "int") : undefined },
    { label: "Total Revenue", value: kpis ? fmt(kpis.totalRevenue, "currency") : undefined },
    { label: "Total TXN", value: kpis ? fmt(kpis.totalTxn, "int") : undefined },
    {
      label: "Peak (Day + Hour)",
      value: kpis ? `${peakDowLabel} ${String(kpis.peakWeeklyHour).padStart(2, "0")}:00` : undefined,
      sub: kpis ? `${kpis.peakWeeklyPairs.toLocaleString("en-US")} pairs` : undefined,
    },
  ];

  /* ═══════════════════════════════════════════════════ */
  /*                     R E N D E R                     */
  /* ═══════════════════════════════════════════════════ */

  return (
    <div className="flex flex-col gap-4">

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPI_CARDS.map(({ label, value, sub }) => (
          <div
            key={label}
            className="bg-card border border-border rounded-sm px-4 py-3 flex flex-col gap-1 border-l-2 border-l-[#00E273] shadow-sm"
          >
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">{label}</p>
            {isLoading ? (
              <div className="h-5 w-20 bg-muted animate-pulse rounded-sm" />
            ) : (
              <>
                <p className="text-sm font-bold text-foreground tabular-nums tracking-tight">
                  {value ?? "—"}
                </p>
                {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── Weekly Hourly Chart (168 points) ── */}
      <div className="bg-card border border-border rounded-sm p-5 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">
              Weekly Traffic Pattern (All Branches)
            </h3>
            {dateRangeLabel && (
              <p className="text-[9px] text-muted-foreground">
                📅 {dateRangeLabel}
              </p>
            )}
          </div>
          <span className="text-[9px] text-muted-foreground">
            Mon → Sun · 00:00-23:00 WIB
          </span>
        </div>
        <div className="h-72 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-[#00E273] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <Line data={weeklyChartData} options={weeklyOptions} />
          )}
        </div>
      </div>

      {/* ── By-Branch Weekly Chart ── */}
      {branchWeeklyChartData && (
        <div className="bg-card border border-border rounded-sm p-5 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">
                Weekly Traffic Pattern (Per Branch)
              </h3>
              {dateRangeLabel && (
                <p className="text-[9px] text-muted-foreground">
                  📅 {dateRangeLabel}
                </p>
              )}
            </div>
          </div>
          <div className="h-72 relative">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-[#00E273] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <Line data={branchWeeklyChartData} options={weeklyOptions} />
            )}
          </div>
        </div>
      )}

      {/* ── Day-of-Week Summary Table ── */}
      <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">Day-of-Week Summary</h3>
          {dateRangeLabel && (
            <span className="text-[9px] text-muted-foreground">📅 {dateRangeLabel}</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]">Day</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]">Pairs</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]">Revenue</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]">TXN</th>
                <th className="px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em] w-[200px]">Volume Share</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 7 }, (_, i) => (
                  <tr key={`dskel-${String(i)}`} className="border-b border-border/50">
                    {Array.from({ length: 5 }, (_, j) => (
                      <td key={`dc-${String(j)}`} className="px-3 py-2.5">
                        <div className="h-3 bg-muted animate-pulse rounded-sm w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                (data?.dowSummary ?? []).map((d) => {
                  const maxPairs = Math.max(...(data?.dowSummary?.map((x) => x.pairs) ?? [1]), 1);
                  const pct = maxPairs > 0 ? (d.pairs / maxPairs) * 100 : 0;
                  const isPeak = kpis && d.dow === kpis.peakWeeklyDow;
                  const isWeekend = d.dow >= 6;
                  return (
                    <tr
                      key={d.dow}
                      className={`border-b border-border/40 hover:bg-muted/20 transition-colors
                        ${isPeak ? "bg-[#00E273]/5" : ""}
                        ${isWeekend ? "bg-amber-50/30" : ""}`}
                    >
                      <td className="px-3 py-2.5 font-medium text-foreground text-xs">
                        {DAY_NAMES_FULL[d.dow - 1]}
                        {isPeak && <span className="ml-1.5 text-[8px] text-[#00E273] font-bold">● PEAK</span>}
                        {isWeekend && <span className="ml-1.5 text-[8px] text-amber-500 font-medium">weekend</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold">
                        {d.pairs.toLocaleString("en-US")}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                        {fmt(d.revenue, "currency")}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                        {d.transactions.toLocaleString("en-US")}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#00E273] rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!isLoading && data?.dowSummary && (() => {
              const totPairs = data.dowSummary.reduce((s, d) => s + d.pairs, 0);
              const totRev = data.dowSummary.reduce((s, d) => s + d.revenue, 0);
              const totTxn = data.dowSummary.reduce((s, d) => s + d.transactions, 0);
              return (
                <tfoot>
                  <tr className="border-t-2 border-[#00E273]/40 bg-muted/40">
                    <td className="px-3 py-2.5 text-[9px] font-bold text-foreground">TOTAL</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-foreground">
                      {totPairs.toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-foreground">
                      {fmt(totRev, "currency")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-foreground">
                      {totTxn.toLocaleString("en-US")}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>

      {/* ── Hourly Breakdown Table (24 rows, aggregated across all days) ── */}
      <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">Hourly Breakdown (All Days Combined)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]">Hour (WIB)</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]">Pairs</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]">Revenue</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]">TXN</th>
                <th className="px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em] w-[200px]">Volume Share</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 12 }, (_, i) => (
                  <tr key={`hskel-${String(i)}`} className="border-b border-border/50">
                    {Array.from({ length: 5 }, (_, j) => (
                      <td key={`hc-${String(j)}`} className="px-3 py-2.5">
                        <div className="h-3 bg-muted animate-pulse rounded-sm w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                (data?.hourly ?? []).map((h) => {
                  const maxPairs = Math.max(...(data?.hourly?.map((x) => x.pairs) ?? [1]), 1);
                  const pct = maxPairs > 0 ? (h.pairs / maxPairs) * 100 : 0;
                  const isPeak = kpis && h.hour === kpis.peakHour;
                  return (
                    <tr
                      key={h.hour}
                      className={`border-b border-border/40 hover:bg-muted/20 transition-colors
                        ${isPeak ? "bg-[#00E273]/5" : ""}`}
                    >
                      <td className="px-3 py-2.5 font-medium text-foreground text-xs">
                        {`${String(h.hour).padStart(2, "0")}:00`}
                        {isPeak && <span className="ml-1.5 text-[8px] text-[#00E273] font-bold">● PEAK</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold">
                        {h.pairs.toLocaleString("en-US")}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                        {fmt(h.revenue, "currency")}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                        {h.transactions.toLocaleString("en-US")}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#00E273] rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!isLoading && data?.hourly && (() => {
              const totPairs = data.hourly.reduce((s, h) => s + h.pairs, 0);
              const totRev = data.hourly.reduce((s, h) => s + h.revenue, 0);
              const totTxn = data.hourly.reduce((s, h) => s + h.transactions, 0);
              return (
                <tfoot>
                  <tr className="border-t-2 border-[#00E273]/40 bg-muted/40">
                    <td className="px-3 py-2.5 text-[9px] font-bold text-foreground">TOTAL</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-foreground">
                      {totPairs.toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-foreground">
                      {fmt(totRev, "currency")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-foreground">
                      {totTxn.toLocaleString("en-US")}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>
    </div>
  );
}
