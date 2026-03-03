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

interface HourlyPoint {
  hour: number;
  pairs: number;
  revenue: number;
  transactions: number;
}

interface BranchHourly {
  branch: string;
  hourly: HourlyPoint[];
}

interface HourlyData {
  hourly: HourlyPoint[];
  byBranch: BranchHourly[];
  kpis: {
    totalPairs: number;
    totalRevenue: number;
    totalTxn: number;
    peakHour: number;
    peakPairs: number;
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

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

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

  /* ── chart: overall line ── */
  const overallChartData = useMemo(() => ({
    labels: HOUR_LABELS,
    datasets: [
      {
        label: "Pairs (Qty)",
        data: data?.hourly?.map((h) => h.pairs) ?? Array(24).fill(0),
        borderColor: "#00E273",
        backgroundColor: "rgba(0, 226, 115, 0.08)",
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: "#00E273",
        borderWidth: 2.5,
      },
      {
        label: "Transactions",
        data: data?.hourly?.map((h) => h.transactions) ?? Array(24).fill(0),
        borderColor: "#1a1a1a",
        backgroundColor: "transparent",
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#1a1a1a",
        borderWidth: 1.5,
        borderDash: [5, 3],
      },
    ],
  }), [data]);

  /* ── chart: by-branch lines ── */
  const branchChartData = useMemo(() => {
    if (!data?.byBranch?.length) return null;
    return {
      labels: HOUR_LABELS,
      datasets: data.byBranch.map((b, idx) => ({
        label: b.branch || "Unknown",
        data: b.hourly.map((h) => h.pairs),
        borderColor: getBranchColor(b.branch, idx),
        backgroundColor: "transparent",
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: getBranchColor(b.branch, idx),
        borderWidth: 2,
      })),
    };
  }, [data]);

  const lineOptions = {
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
          title: (items: { label: string }[]) => items[0]?.label ?? "",
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const y = ctx.parsed.y ?? 0;
            return `${ctx.dataset.label}: ${y.toLocaleString("en-US")}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 9 }, maxRotation: 0 },
        grid: { display: false },
      },
      y: {
        type: "linear" as const,
        position: "left" as const,
        beginAtZero: true,
        ticks: { font: { size: 9 } },
        grid: { color: "rgba(0,0,0,0.04)" },
      },
    },
  };

  /* ── KPIs ── */
  const kpis = data?.kpis;

  const KPI_CARDS: { label: string; value: number | undefined; type: "currency" | "int"; sub?: string }[] = [
    { label: "Total Pairs", value: kpis?.totalPairs, type: "int" },
    { label: "Total Revenue", value: kpis?.totalRevenue, type: "currency" },
    { label: "Total TXN", value: kpis?.totalTxn, type: "int" },
    { label: "Peak Hour (WIB)", value: kpis?.peakHour, type: "int", sub: kpis ? `${kpis.peakPairs.toLocaleString("en-US")} pairs` : undefined },
  ];

  /* ═══════════════════════════════════════════════════ */
  /*                     R E N D E R                     */
  /* ═══════════════════════════════════════════════════ */

  return (
    <div className="flex flex-col gap-4">

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPI_CARDS.map(({ label, value, type, sub }) => (
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
                  {value !== undefined
                    ? label === "Peak Hour (WIB)"
                      ? `${String(value).padStart(2, "0")}:00`
                      : fmt(value, type)
                    : "—"}
                </p>
                {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── Overall Hourly Chart ── */}
      <div className="bg-card border border-border rounded-sm p-5 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">
            Sales by Hour (All Branches)
          </h3>
          <span className="text-[9px] text-muted-foreground">
            X = Hour WIB (00-23) · Y = Qty (Pairs)
          </span>
        </div>
        <div className="h-64 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-[#00E273] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <Line data={overallChartData} options={lineOptions} />
          )}
        </div>
      </div>

      {/* ── By-Branch Hourly Chart ── */}
      {branchChartData && (
        <div className="bg-card border border-border rounded-sm p-5 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">
              Sales by Hour (Per Branch)
            </h3>
          </div>
          <div className="h-64 relative">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-[#00E273] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <Line data={branchChartData} options={lineOptions} />
            )}
          </div>
        </div>
      )}

      {/* ── Hourly Data Table ── */}
      <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">Hourly Breakdown</h3>
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
