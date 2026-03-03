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

interface StoreData {
  store: string;
  pairs: number[];
  transactions: number[];
}

interface HourlyData {
  dates: string[];
  pairs: number[];
  revenue: number[];
  transactions: number[];
  byStore: StoreData[];
  storeCount: number;
  dateRange: { from: string | null; to: string | null };
  kpis: {
    totalPairs: number;
    totalRevenue: number;
    totalTxn: number;
    peakDate: string | null;
    peakHour: number;
    peakPairs: number;
  };
}

/* ─── helpers ───────────────────────────────────────── */

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function fmtDateFull(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getDayName(dateStr: string): string {
  return DAY_FULL[new Date(dateStr + "T00:00:00").getDay()];
}

function getDayShort(dateStr: string): string {
  return DAY_SHORT[new Date(dateStr + "T00:00:00").getDay()];
}

function fmt(n: number, type: "currency" | "int"): string {
  if (type === "currency") {
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
    return "Rp " + Math.round(n).toLocaleString("en-US");
  }
  return Math.round(n).toLocaleString("en-US");
}

/** 24 distinct colors for store lines */
const STORE_COLORS = [
  "#3B82F6", "#EF4444", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4",
  "#84CC16", "#F97316", "#6366F1", "#14B8A6", "#E11D48", "#0EA5E9",
  "#A3E635", "#FB923C", "#818CF8", "#2DD4BF", "#F43F5E", "#38BDF8",
  "#BEF264", "#FDBA74",
];

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

  const numDays = data?.dates?.length ?? 0;
  const totalSlots = numDays * 24;

  /* ── metadata per slot (for tooltips) ── */
  const slotMeta = useMemo(() => {
    if (!data?.dates?.length) return [];
    const meta: { date: string; hour: number; dayFull: string; dateFmt: string }[] = [];
    for (const date of data.dates) {
      for (let h = 0; h < 24; h++) {
        meta.push({
          date,
          hour: h,
          dayFull: getDayName(date),
          dateFmt: fmtDateFull(date),
        });
      }
    }
    return meta;
  }, [data?.dates]);

  /* ── labels for X-axis ── */
  const labels = useMemo(() => {
    if (!data?.dates?.length) return [];
    const lbls: string[] = [];
    for (const date of data.dates) {
      for (let h = 0; h < 24; h++) {
        lbls.push(`${getDayShort(date)} ${fmtDateShort(date)} ${String(h).padStart(2, "0")}:00`);
      }
    }
    return lbls;
  }, [data?.dates]);

  /* ── date range subtitle ── */
  const dateRangeLabel = useMemo(() => {
    if (!data?.dateRange?.from || !data?.dateRange?.to) return null;
    return `${fmtDateFull(data.dateRange.from)} — ${fmtDateFull(data.dateRange.to)}`;
  }, [data]);

  /* ── Chart 1: Total (single line) ── */
  const totalChartData = useMemo(() => ({
    labels,
    datasets: [{
      label: "Pairs (Qty)",
      data: data?.pairs ?? [],
      borderColor: "#00E273",
      backgroundColor: "rgba(0, 226, 115, 0.06)",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointBackgroundColor: "#00E273",
      borderWidth: 2,
    }],
  }), [labels, data?.pairs]);

  /* ── Chart 2: By Store (multiple lines) ── */
  const storeChartData = useMemo(() => {
    if (!data?.byStore?.length) return null;
    return {
      labels,
      datasets: data.byStore.map((s, idx) => ({
        label: s.store.replace(/^Zuma\s*/i, ""),
        data: s.pairs,
        borderColor: STORE_COLORS[idx % STORE_COLORS.length],
        backgroundColor: "transparent",
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointBackgroundColor: STORE_COLORS[idx % STORE_COLORS.length],
        borderWidth: 1.8,
      })),
    };
  }, [labels, data?.byStore]);

  /* ── Shared X-axis tick callback ── */
  const xTickCallback = useMemo(() => {
    return function (_: unknown, index: number) {
      const hourInDay = index % 24;
      const dayIdx = Math.floor(index / 24);
      const date = data?.dates?.[dayIdx];
      if (!date) return "";

      if (hourInDay === 0) {
        /* Show date at start of each day */
        if (numDays > 31) {
          /* For very long ranges, show every ~7 days */
          if (dayIdx % 7 !== 0) return "";
        } else if (numDays > 14) {
          /* For 2-4 weeks, show every 2-3 days */
          if (dayIdx % 2 !== 0) return "";
        }
        return `${getDayShort(date)} ${date.substring(8)}/${date.substring(5, 7)}`;
      }

      /* Show hour ticks for short ranges */
      if (numDays <= 7 && hourInDay === 12) return "12h";
      if (numDays <= 14 && hourInDay === 12) return "12";

      return "";
    };
  }, [data?.dates, numDays]);

  /* ── X-axis grid (day separators) ── */
  const xGridColor = (ctx: { index: number }) =>
    ctx.index % 24 === 0 ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.02)";
  const xGridWidth = (ctx: { index: number }) =>
    ctx.index % 24 === 0 ? 1.5 : 0.5;

  /* ── Chart 1 options ── */
  const totalChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.85)",
        titleFont: { size: 12, family: "Inter", weight: "bold" as const },
        bodyFont: { size: 11, family: "Inter" },
        padding: 12,
        cornerRadius: 6,
        callbacks: {
          title: (items: { dataIndex: number }[]) => {
            const m = slotMeta[items[0]?.dataIndex ?? 0];
            if (!m) return "";
            return `${m.dayFull}, ${m.dateFmt}`;
          },
          afterTitle: (items: { dataIndex: number }[]) => {
            const m = slotMeta[items[0]?.dataIndex ?? 0];
            if (!m) return "";
            return `${String(m.hour).padStart(2, "0")}:00 WIB`;
          },
          label: (ctx: { parsed: { y: number | null }; dataIndex: number }) => {
            const y = ctx.parsed.y ?? 0;
            return `  Pairs: ${y.toLocaleString("en-US")}`;
          },
          afterBody: (items: { dataIndex: number }[]) => {
            const idx = items[0]?.dataIndex ?? 0;
            const txn = data?.transactions?.[idx] ?? 0;
            return [`  Transactions: ${txn.toLocaleString("en-US")}`];
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 8 }, maxRotation: 45, autoSkip: false, callback: xTickCallback },
        grid: { display: true, color: xGridColor, lineWidth: xGridWidth },
      },
      y: {
        type: "linear" as const,
        position: "left" as const,
        beginAtZero: true,
        ticks: { font: { size: 9 } },
        grid: { color: "rgba(0,0,0,0.04)" },
      },
    },
  }), [slotMeta, data?.transactions, xTickCallback]);

  /* ── Chart 2 options (per store) ── */
  const storeChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          font: { size: 9, family: "Inter" },
          usePointStyle: true,
          pointStyle: "circle" as const,
          boxWidth: 6,
          padding: 8,
        },
      },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.85)",
        titleFont: { size: 12, family: "Inter", weight: "bold" as const },
        bodyFont: { size: 10, family: "Inter" },
        padding: 12,
        cornerRadius: 6,
        filter: (ctx: { parsed: { y: number | null } }) => (ctx.parsed.y ?? 0) > 0,
        callbacks: {
          title: (items: { dataIndex: number }[]) => {
            const m = slotMeta[items[0]?.dataIndex ?? 0];
            if (!m) return "";
            return `${m.dayFull}, ${m.dateFmt}`;
          },
          afterTitle: (items: { dataIndex: number }[]) => {
            const m = slotMeta[items[0]?.dataIndex ?? 0];
            if (!m) return "";
            return `${String(m.hour).padStart(2, "0")}:00 WIB`;
          },
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const y = ctx.parsed.y ?? 0;
            return `  ${ctx.dataset.label}: ${y.toLocaleString("en-US")} pairs`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 8 }, maxRotation: 45, autoSkip: false, callback: xTickCallback },
        grid: { display: true, color: xGridColor, lineWidth: xGridWidth },
      },
      y: {
        type: "linear" as const,
        position: "left" as const,
        beginAtZero: true,
        ticks: { font: { size: 9 } },
        grid: { color: "rgba(0,0,0,0.04)" },
      },
    },
  }), [slotMeta, xTickCallback]);

  /* ── Scrollable chart width ── */
  const chartMinWidth = Math.max(800, numDays * 50);

  /* ── KPIs ── */
  const kpis = data?.kpis;
  const peakLabel = kpis?.peakDate
    ? `${getDayShort(kpis.peakDate)} ${fmtDateShort(kpis.peakDate)} ${String(kpis.peakHour).padStart(2, "0")}:00`
    : undefined;

  const KPI_CARDS: { label: string; value: string | undefined; sub?: string }[] = [
    { label: "Total Pairs", value: kpis ? fmt(kpis.totalPairs, "int") : undefined },
    { label: "Total Revenue", value: kpis ? fmt(kpis.totalRevenue, "currency") : undefined },
    { label: "Total TXN", value: kpis ? fmt(kpis.totalTxn, "int") : undefined },
    {
      label: "Peak (Date + Hour)",
      value: peakLabel,
      sub: kpis ? `${kpis.peakPairs.toLocaleString("en-US")} pairs` : undefined,
    },
  ];

  /* ── DOW Summary (computed from timeline) ── */
  const dowSummary = useMemo(() => {
    if (!data?.dates?.length || !data?.pairs?.length) return [];
    /* 0=Sun..6=Sat */
    const sums = Array.from({ length: 7 }, () => ({ pairs: 0, revenue: 0, transactions: 0, days: 0 }));
    const seen = Array.from({ length: 7 }, () => new Set<string>());

    for (let di = 0; di < data.dates.length; di++) {
      const dow = new Date(data.dates[di] + "T00:00:00").getDay();
      for (let h = 0; h < 24; h++) {
        const si = di * 24 + h;
        sums[dow].pairs += data.pairs[si] ?? 0;
        sums[dow].revenue += data.revenue[si] ?? 0;
        sums[dow].transactions += data.transactions[si] ?? 0;
      }
      seen[dow].add(data.dates[di]);
    }
    for (let d = 0; d < 7; d++) sums[d].days = seen[d].size;

    /* Reorder: Mon(1) → Sun(0) */
    return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
      dow,
      dayName: DAY_FULL[dow],
      dayShort: DAY_SHORT[dow],
      pairs: sums[dow].pairs,
      revenue: sums[dow].revenue,
      transactions: sums[dow].transactions,
      days: sums[dow].days,
    }));
  }, [data]);

  /* ── Hourly Summary (24 rows, all dates combined) ── */
  const hourlySummary = useMemo(() => {
    if (!data?.dates?.length || !data?.pairs?.length) return [];
    const sums = Array.from({ length: 24 }, () => ({ pairs: 0, revenue: 0, transactions: 0 }));
    for (let di = 0; di < data.dates.length; di++) {
      for (let h = 0; h < 24; h++) {
        const si = di * 24 + h;
        sums[h].pairs += data.pairs[si] ?? 0;
        sums[h].revenue += data.revenue[si] ?? 0;
        sums[h].transactions += data.transactions[si] ?? 0;
      }
    }
    return sums.map((s, h) => ({ hour: h, ...s }));
  }, [data]);

  const peakDow = dowSummary.reduce((max, d) => d.pairs > max.pairs ? d : max, dowSummary[0] ?? { dow: 0, pairs: 0 });
  const peakHourlySummary = hourlySummary.reduce((max, h) => h.pairs > max.pairs ? h : max, hourlySummary[0] ?? { hour: 0, pairs: 0 });

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

      {/* ── Period info ── */}
      {dateRangeLabel && (
        <p className="text-[10px] text-muted-foreground">
          📅 Showing <strong>{numDays} days</strong> · {dateRangeLabel}
          {data?.storeCount && data.storeCount > (data.byStore?.length ?? 0)
            ? ` · Stores: showing top ${data.byStore.length} of ${data.storeCount}`
            : ""}
        </p>
      )}

      {/* ── Chart 1: Total Hourly (single line, scrollable) ── */}
      <div className="bg-card border border-border rounded-sm p-5 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">
              Hourly Traffic — All Stores (Total)
            </h3>
            <p className="text-[9px] text-muted-foreground">
              Hover for date, day, pairs &amp; transactions
            </p>
          </div>
          <span className="text-[9px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {totalSlots.toLocaleString()} data points · {numDays} days × 24h
          </span>
        </div>

        <div className="overflow-x-auto rounded">
          <div style={{ minWidth: `${chartMinWidth}px`, height: "288px" }}>
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-[#00E273] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <Line data={totalChartData} options={totalChartOptions} />
            )}
          </div>
        </div>
      </div>

      {/* ── Chart 2: By Store (multiple lines, scrollable) ── */}
      {storeChartData && (
        <div className="bg-card border border-border rounded-sm p-5 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">
                Hourly Traffic — By Store
              </h3>
              <p className="text-[9px] text-muted-foreground">
                {data?.byStore?.length ?? 0} stores · click legend to toggle
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded">
            <div style={{ minWidth: `${chartMinWidth}px`, height: "320px" }}>
              {isLoading ? (
                <div className="h-full flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-[#00E273] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <Line data={storeChartData} options={storeChartOptions} />
              )}
            </div>
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
                <th className="text-right px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]">Days</th>
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
                    {Array.from({ length: 6 }, (_, j) => (
                      <td key={`dc-${String(j)}`} className="px-3 py-2.5">
                        <div className="h-3 bg-muted animate-pulse rounded-sm w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                dowSummary.map((d) => {
                  const maxPairs = Math.max(...dowSummary.map((x) => x.pairs), 1);
                  const pct = maxPairs > 0 ? (d.pairs / maxPairs) * 100 : 0;
                  const isPeak = peakDow && d.dow === peakDow.dow;
                  const isWeekend = d.dow === 0 || d.dow === 6;
                  return (
                    <tr
                      key={d.dow}
                      className={`border-b border-border/40 hover:bg-muted/20 transition-colors
                        ${isPeak ? "bg-[#00E273]/5" : ""}
                        ${isWeekend ? "bg-amber-50/30" : ""}`}
                    >
                      <td className="px-3 py-2.5 font-medium text-foreground text-xs">
                        {d.dayName}
                        {isPeak && <span className="ml-1.5 text-[8px] text-[#00E273] font-bold">● PEAK</span>}
                        {isWeekend && <span className="ml-1.5 text-[8px] text-amber-500 font-medium">weekend</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                        {d.days}
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
            {!isLoading && dowSummary.length > 0 && (() => {
              const totPairs = dowSummary.reduce((s, d) => s + d.pairs, 0);
              const totRev = dowSummary.reduce((s, d) => s + d.revenue, 0);
              const totTxn = dowSummary.reduce((s, d) => s + d.transactions, 0);
              const totDays = dowSummary.reduce((s, d) => s + d.days, 0);
              return (
                <tfoot>
                  <tr className="border-t-2 border-[#00E273]/40 bg-muted/40">
                    <td className="px-3 py-2.5 text-[9px] font-bold text-foreground">TOTAL</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-foreground">
                      {totDays}
                    </td>
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

      {/* ── Hourly Breakdown Table (24 rows, all dates combined) ── */}
      <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">
            Hourly Breakdown (All Days Combined)
          </h3>
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
                hourlySummary.map((h) => {
                  const maxPairs = Math.max(...hourlySummary.map((x) => x.pairs), 1);
                  const pct = maxPairs > 0 ? (h.pairs / maxPairs) * 100 : 0;
                  const isPeak = peakHourlySummary && h.hour === peakHourlySummary.hour;
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
            {!isLoading && hourlySummary.length > 0 && (() => {
              const totPairs = hourlySummary.reduce((s, h) => s + h.pairs, 0);
              const totRev = hourlySummary.reduce((s, h) => s + h.revenue, 0);
              const totTxn = hourlySummary.reduce((s, h) => s + h.transactions, 0);
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
