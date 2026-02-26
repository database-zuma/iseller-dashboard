"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { ChevronLeft, ChevronRight, ChevronDown, Check, X } from "lucide-react";
import { toCSV, downloadCSV, downloadXLSX } from "@/lib/export";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

/* ─── types ─────────────────────────────────────────── */

interface PromoKpis {
  qtyAll: number;
  qtyPromo: number;
  revenue: number;
  discountTotal: number;
  txnCount: number;
  promoShare: number;
  atu: number;
  asp: number;
  atv: number;
}

interface OverallKpis {
  pairs: number;
  revenue: number;
  txnCount: number;
  atu: number;
  asp: number;
  atv: number;
}

interface TimeSeriesRow {
  period: string;
  qtyAll: number;
  qtyPromo: number;
  revenue: number;
  discountTotal: number;
  txnCount: number;
}

interface CampaignRow {
  campaign: string;
  qtyAll: number;
  qtyPromo: number;
  revenue: number;
  discountTotal: number;
  txnCount: number;
}

interface StoreRow {
  toko: string;
  branch: string;
  qtyAll: number;
  qtyPromo: number;
  revenue: number;
  discountTotal: number;
  txnCount: number;
}

interface SpgRow {
  spg: string;
  qtyPromo: number;
  qtyAll: number;
  revenue: number;
  txnCount: number;
}

interface CampaignOption {
  code: string;
  name: string;
}

interface PromoData {
  promoKpis: PromoKpis;
  overallKpis: OverallKpis;
  timeSeries: TimeSeriesRow[];
  byCampaign: CampaignRow[];
  stores: StoreRow[];
  spgLeaderboard: SpgRow[];
  campaignOptions: CampaignOption[];
}

/* ─── helpers ───────────────────────────────────────── */

function fmt(n: number, type: "currency" | "int" | "decimal" | "pct"): string {
  if (type === "currency") {
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
    return "Rp " + Math.round(n).toLocaleString("en-US");
  }
  if (type === "pct") return `${(n * 100).toFixed(1)}%`;
  if (type === "decimal") {
    return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  return Math.round(n).toLocaleString("en-US");
}

const ROWS_PER_PAGE = 10;

type SortKey = "toko" | "branch" | "qtyAll" | "qtyPromo" | "revenue" | "discountTotal" | "txnCount";

/* ─── component ─────────────────────────────────────── */

export default function PromoTab() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /* ── local state ── */
  const [mode, setMode] = useState<"promo" | "all">("promo");
  const [storePage, setStorePage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState("");
  const campaignRef = useRef<HTMLDivElement>(null);
  const campaignSearchRef = useRef<HTMLInputElement>(null);

  /* ── read shared URL params ── */
  const from = searchParams.get("from") || "2026-01-01";
  const to = searchParams.get("to") || new Date().toISOString().substring(0, 10);
  const branch = searchParams.get("branch") || "";
  const store = searchParams.get("store") || "";
  const campaign = searchParams.get("campaign") || "";

  const selectedCampaigns = useMemo(() => {
    return campaign ? campaign.split(",").map((v) => v.trim()).filter(Boolean) : [];
  }, [campaign]);

  /* ── build API URL ── */
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    if (branch) params.set("branch", branch);
    if (store) params.set("store", store);
    if (campaign) params.set("campaign", campaign);
    return `/api/promo?${params.toString()}`;
  }, [from, to, branch, store, campaign]);

  /* ── fetch ── */
  const { data, isLoading } = useSWR<PromoData>(apiUrl, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 60000,
  });

  /* ── campaign filter helpers ── */
  const setCampaignParam = useCallback(
    (codes: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (codes.length === 0) params.delete("campaign");
      else params.set("campaign", codes.join(","));
      params.delete("page");
      router.push(`/?${params.toString()}`);
    },
    [router, searchParams]
  );

  const campaignOptions = data?.campaignOptions ?? [];

  const filteredCampaignOptions = useMemo(() => {
    if (!campaignSearch) return campaignOptions;
    const q = campaignSearch.toLowerCase();
    return campaignOptions.filter(
      (o) => o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
    );
  }, [campaignOptions, campaignSearch]);

  const allCampaignsSelected =
    filteredCampaignOptions.length > 0 &&
    filteredCampaignOptions.every((o) => selectedCampaigns.includes(o.code));

  const toggleCampaign = useCallback(
    (code: string) => {
      const next = selectedCampaigns.includes(code)
        ? selectedCampaigns.filter((v) => v !== code)
        : [...selectedCampaigns, code];
      setCampaignParam(next);
    },
    [selectedCampaigns, setCampaignParam]
  );

  const toggleAllCampaigns = useCallback(() => {
    if (allCampaignsSelected) {
      setCampaignParam([]);
    } else {
      const merged = [...new Set([...selectedCampaigns, ...filteredCampaignOptions.map((o) => o.code)])];
      setCampaignParam(merged);
    }
  }, [allCampaignsSelected, selectedCampaigns, filteredCampaignOptions, setCampaignParam]);

  const clearCampaigns = useCallback(() => setCampaignParam([]), [setCampaignParam]);

  /* ── dropdown outside-click ── */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (campaignRef.current && !campaignRef.current.contains(e.target as Node)) setCampaignOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!campaignOpen) setCampaignSearch("");
    else setTimeout(() => campaignSearchRef.current?.focus(), 0);
  }, [campaignOpen]);

  /* ── reset store page on filter change (ref-based, no effect dep lint issue) ── */
  const prevApiUrlRef = useRef(apiUrl);
  if (prevApiUrlRef.current !== apiUrl) {
    prevApiUrlRef.current = apiUrl;
    if (storePage !== 1) setStorePage(1);
  }

  /* ── sorted stores ── */
  const sortedStores = useMemo(() => {
    if (!data?.stores) return [];
    const sorted = [...data.stores];
    sorted.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = aVal as number;
      const bNum = bVal as number;
      return sortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
    return sorted;
  }, [data?.stores, sortKey, sortDir]);

  const totalStorePages = Math.ceil(sortedStores.length / ROWS_PER_PAGE);
  const currentStoreRows = sortedStores.slice((storePage - 1) * ROWS_PER_PAGE, storePage * ROWS_PER_PAGE);

  /* ── toggle sort ── */
  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSortKey(key);
        setSortDir("desc");
      }
      setStorePage(1);
    },
    [sortKey]
  );

  /* ── campaign breakdown sorted by revenue DESC ── */
  const sortedCampaigns = useMemo(() => {
    if (!data?.byCampaign) return [];
    return [...data.byCampaign].sort((a, b) => b.revenue - a.revenue);
  }, [data?.byCampaign]);

  const maxCampaignRevenue = useMemo(() => {
    if (sortedCampaigns.length === 0) return 1;
    return Math.max(...sortedCampaigns.map((c) => c.revenue), 1);
  }, [sortedCampaigns]);

  /* ── SPG leaderboard sorted by QTY Promo DESC, top 50 ── */
  const sortedSpg = useMemo(() => {
    if (!data?.spgLeaderboard) return [];
    return [...data.spgLeaderboard].sort((a, b) => b.qtyPromo - a.qtyPromo).slice(0, 50);
  }, [data?.spgLeaderboard]);

  /* ── mode-dependent KPIs for ATU/ASP/ATV ── */
  const modeKpis = mode === "promo" ? data?.promoKpis : data?.overallKpis;

  /* ── handle campaign click from breakdown ── */
  const handleCampaignClick = useCallback(
    (campaignCode: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = params.get("campaign");
      if (current === campaignCode) {
        params.delete("campaign");
      } else {
        params.set("campaign", campaignCode);
      }
      params.delete("page");
      router.push(`/?${params.toString()}`);
    },
    [router, searchParams]
  );

  /* ── store export ── */
  const handleStoreCSV = useCallback(() => {
    if (sortedStores.length === 0) return;
    const headers = ["#", "Store", "Branch", "QTY All", "QTY Promo", "Revenue", "Discount", "TXN"];
    const keys = ["rank", "toko", "branch", "qtyAll", "qtyPromo", "revenue", "discountTotal", "txnCount"];
    const rows: Record<string, unknown>[] = sortedStores.map((s, idx) => ({
      rank: idx + 1,
      toko: s.toko,
      branch: s.branch,
      qtyAll: s.qtyAll,
      qtyPromo: s.qtyPromo,
      revenue: s.revenue,
      discountTotal: s.discountTotal,
      txnCount: s.txnCount,
    }));
    downloadCSV(toCSV(headers, rows, keys), "promo_store_performance.csv");
  }, [sortedStores]);

  const handleStoreXLSX = useCallback(() => {
    if (sortedStores.length === 0) return;
    const headers = ["#", "Store", "Branch", "QTY All", "QTY Promo", "Revenue", "Discount", "TXN"];
    const keys = ["rank", "toko", "branch", "qtyAll", "qtyPromo", "revenue", "discountTotal", "txnCount"];
    const rows: Record<string, unknown>[] = sortedStores.map((s, idx) => ({
      rank: idx + 1,
      toko: s.toko,
      branch: s.branch,
      qtyAll: s.qtyAll,
      qtyPromo: s.qtyPromo,
      revenue: s.revenue,
      discountTotal: s.discountTotal,
      txnCount: s.txnCount,
    }));
    void downloadXLSX(headers, rows, keys, "promo_store_performance.xlsx");
  }, [sortedStores]);

  /* ── sort indicator ── */
  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  /* ── table class tokens ── */
  const thSort = "text-left px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em] cursor-pointer select-none hover:text-foreground transition-colors";
  const thSortRight = "text-right px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em] cursor-pointer select-none hover:text-foreground transition-colors";
  const thStatic = "text-left px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]";
  const thStaticRight = "text-right px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]";

  /* ── chart data ── */
  const chartLabels = data?.timeSeries?.map((d) => d.period) ?? [];
  const chartRevenue = data?.timeSeries?.map((d) => d.revenue / 1_000_000) ?? [];
  const chartQtyPromo = data?.timeSeries?.map((d) => d.qtyPromo) ?? [];

  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: "Revenue (Rp juta)",
        data: chartRevenue,
        backgroundColor: "#00E273",
        borderRadius: 1,
        yAxisID: "y",
      },
      {
        label: "QTY Promo",
        data: chartQtyPromo,
        backgroundColor: "#1a1a1a",
        borderRadius: 1,
        yAxisID: "y1",
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        position: "top" as const,
        labels: { font: { size: 10, family: "Inter" }, usePointStyle: true, pointStyle: "rect" as const },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const y = ctx.parsed.y ?? 0;
            if (ctx.dataset.label?.includes("Revenue")) {
              return `Revenue: Rp ${(y * 1_000_000).toLocaleString("en-US")}`;
            }
            return `QTY Promo: ${y.toLocaleString("en-US")}`;
          },
        },
      },
    },
    scales: {
      x: { ticks: { font: { size: 9 } }, grid: { display: false } },
      y: { type: "linear" as const, position: "left" as const, ticks: { font: { size: 9 } }, grid: { color: "rgba(0,0,0,0.04)" } },
      y1: { type: "linear" as const, position: "right" as const, ticks: { font: { size: 9 } }, grid: { drawOnChartArea: false } },
    },
  };

  /* ── campaign filter label ── */
  const campaignLabel =
    selectedCampaigns.length === 0
      ? "All Campaigns"
      : selectedCampaigns.length === 1
        ? selectedCampaigns[0]
        : `${selectedCampaigns.length} campaigns`;

  /* ── KPI card definitions ── */
  const ROW1_CARDS: { label: string; value: number | undefined; type: "currency" | "int" | "decimal" | "pct" }[] = [
    { label: "QTY All", value: data?.promoKpis?.qtyAll, type: "int" },
    { label: "QTY Promo", value: data?.promoKpis?.qtyPromo, type: "int" },
    { label: "% Promo Share", value: data?.promoKpis?.promoShare, type: "pct" },
    { label: "Revenue", value: data?.promoKpis?.revenue, type: "currency" },
    { label: "Discount Total", value: data?.promoKpis?.discountTotal, type: "currency" },
    { label: "TXN", value: data?.promoKpis?.txnCount, type: "int" },
  ];

  const ROW2_CARDS: { label: string; value: number | undefined; type: "currency" | "int" | "decimal" | "pct"; tooltip: string }[] = [
    { label: "ATU", value: modeKpis?.atu, type: "decimal", tooltip: "Avg Transaction Unit" },
    { label: "ASP", value: modeKpis?.asp, type: "currency", tooltip: "Avg Selling Price" },
    { label: "ATV", value: modeKpis?.atv, type: "currency", tooltip: "Avg Transaction Value" },
  ];

  /* ═══════════════════════════════════════════════════ */
  /*                     R E N D E R                     */
  /* ═══════════════════════════════════════════════════ */

  return (
    <div className="flex flex-col gap-4">

      {/* ── 1. Campaign Filter Bar ─────────────────── */}
      <div className="bg-card border border-border rounded-sm px-5 py-3 flex flex-wrap items-center gap-3 shadow-sm">
        <div ref={campaignRef} className="relative min-w-[200px]">
          <button
            type="button"
            onClick={() => setCampaignOpen((v) => !v)}
            className={`w-full inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-sm border bg-card text-card-foreground hover:bg-muted transition-colors whitespace-nowrap
              ${selectedCampaigns.length > 0 ? "border-[#00E273]" : "border-border"}`}
          >
            <span className="truncate">{campaignLabel}</span>
            <ChevronDown
              className={`size-3.5 flex-shrink-0 text-muted-foreground transition-transform ${campaignOpen ? "rotate-180" : ""}`}
            />
          </button>

          {campaignOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[260px] w-max max-w-[360px] rounded-sm border border-border bg-card shadow-lg">
              <div className="p-1.5 border-b border-border">
                <input
                  ref={campaignSearchRef}
                  type="text"
                  placeholder="Search campaigns..."
                  value={campaignSearch}
                  onChange={(e) => setCampaignSearch(e.target.value)}
                  className="w-full text-xs px-2 py-1 rounded-sm border border-border bg-background text-foreground placeholder:text-muted-foreground outline-none focus:border-[#00E273]"
                />
              </div>
              <div className="max-h-56 overflow-y-auto">
                {filteredCampaignOptions.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAllCampaigns}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors border-b border-border"
                  >
                    <span
                      className={`size-4 rounded-sm flex items-center justify-center flex-shrink-0 border transition-colors
                        ${allCampaignsSelected ? "bg-[#00E273] border-[#00E273]" : "border-border bg-background"}`}
                    >
                      {allCampaignsSelected && <Check className="size-2.5 text-black stroke-[3]" />}
                    </span>
                    <span className="text-muted-foreground">Select All</span>
                  </button>
                )}
                {selectedCampaigns.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCampaigns}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors border-b border-border"
                  >
                    <X className="size-3" />
                    Clear Campaigns
                  </button>
                )}
                {filteredCampaignOptions.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No campaigns found</p>
                )}
                {filteredCampaignOptions.map((opt) => {
                  const checked = selectedCampaigns.includes(opt.code);
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => toggleCampaign(opt.code)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
                    >
                      <span
                        className={`size-4 rounded-sm flex items-center justify-center flex-shrink-0 border transition-colors
                          ${checked ? "bg-[#00E273] border-[#00E273]" : "border-border bg-background"}`}
                      >
                        {checked && <Check className="size-2.5 text-black stroke-[3]" />}
                      </span>
                      <span className="truncate">
                        <span className="font-semibold">{opt.code}</span>
                        <span className="text-muted-foreground"> — {opt.name}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center rounded-sm border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setMode("promo")}
            className={`px-3 py-1.5 text-[10px] font-semibold transition-colors
              ${mode === "promo" ? "bg-[#00E273] text-black" : "bg-card text-muted-foreground hover:bg-muted"}`}
          >
            Promo Struks
          </button>
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`px-3 py-1.5 text-[10px] font-semibold transition-colors
              ${mode === "all" ? "bg-[#00E273] text-black" : "bg-card text-muted-foreground hover:bg-muted"}`}
          >
            All Struks
          </button>
        </div>

        {selectedCampaigns.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {selectedCampaigns.length} campaign{selectedCampaigns.length > 1 ? "s" : ""} active
          </span>
        )}
      </div>

      {/* ── 2a. KPI Row 1: Promo-specific (always promoKpis) ── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {ROW1_CARDS.map(({ label, value, type }) => (
          <div
            key={label}
            className="bg-card border border-border rounded-sm px-4 py-3 flex flex-col gap-1 border-l-2 border-l-[#00E273] shadow-sm"
          >
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">{label}</p>
            {isLoading ? (
              <div className="h-5 w-20 bg-muted animate-pulse rounded-sm" />
            ) : (
              <p className="text-sm font-bold text-foreground tabular-nums tracking-tight">
                {value !== undefined ? fmt(value, type) : "—"}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── 2b. KPI Row 2: Mode-dependent ATU / ASP / ATV ── */}
      <div className="grid grid-cols-3 gap-3">
        {ROW2_CARDS.map(({ label, value, type, tooltip }) => (
          <div
            key={label}
            title={tooltip}
            className="bg-card border border-border rounded-sm px-4 py-3 flex flex-col gap-1 border-l-2 border-l-[#00E273] shadow-sm"
          >
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">
              {label}
              <span className="ml-1 text-[8px] font-normal normal-case tracking-normal text-muted-foreground/60">
                ({mode === "promo" ? "promo" : "all"})
              </span>
            </p>
            {isLoading ? (
              <div className="h-5 w-20 bg-muted animate-pulse rounded-sm" />
            ) : (
              <p className="text-sm font-bold text-foreground tabular-nums tracking-tight">
                {value !== undefined ? fmt(value, type) : "—"}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── 3. Time Series Chart ───────────────────── */}
      <div className="bg-card border border-border rounded-sm p-5 flex flex-col gap-3 shadow-sm">
        <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">Promo Sales Over Time</h3>
        <div className="h-56 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-[#00E273] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <Bar data={chartData} options={chartOptions} />
          )}
        </div>
      </div>

      {/* ── 4. Campaign Breakdown ──────────────────── */}
      <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">Campaign Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className={thStatic}>Campaign</th>
                <th className={thStaticRight}>QTY Promo</th>
                <th className={thStaticRight}>Revenue</th>
                <th className={thStaticRight}>TXN</th>
                <th className="px-3 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em] w-[200px]">
                  Revenue Share
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }, (_, i) => (
                  <tr key={`cskel-${String(i)}`} className="border-b border-border/50">
                    {Array.from({ length: 5 }, (_, j) => (
                      <td key={`cc-${String(j)}`} className="px-3 py-2.5">
                        <div className="h-3 bg-muted animate-pulse rounded-sm w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sortedCampaigns.length > 0 ? (
                sortedCampaigns.map((c) => {
                  const pct = maxCampaignRevenue > 0 ? (c.revenue / maxCampaignRevenue) * 100 : 0;
                  const isActive = selectedCampaigns.includes(c.campaign);
                  return (
                    <tr
                      key={c.campaign}
                      onClick={() => handleCampaignClick(c.campaign)}
                      className={`border-b border-border/40 hover:bg-muted/20 transition-colors cursor-pointer
                        ${isActive ? "bg-[#00E273]/5" : ""}`}
                    >
                      <td className="px-3 py-2.5 font-medium text-foreground text-xs">
                        {c.campaign}
                        {isActive && <span className="ml-1.5 text-[8px] text-[#00E273] font-bold">●</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                        {Math.round(c.qtyPromo).toLocaleString("en-US")}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">{fmt(c.revenue, "currency")}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                        {c.txnCount.toLocaleString("en-US")}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-[#00E273] rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    No campaign data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 5. Store Table ─────────────────────────── */}
      <div className="bg-card border border-border rounded-sm overflow-hidden flex flex-col shadow-sm">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">Store Performance (Promo)</h3>
            {!isLoading && sortedStores.length > 0 && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handleStoreCSV}
                  className="text-[9px] px-2 py-0.5 rounded-sm border border-border hover:bg-muted transition-colors font-medium"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={handleStoreXLSX}
                  className="text-[9px] px-2 py-0.5 rounded-sm border border-border hover:bg-muted transition-colors font-medium"
                >
                  XLSX
                </button>
              </div>
            )}
          </div>
          {!isLoading && sortedStores.length > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {sortedStores.length} stores · Page {storePage}/{totalStorePages}
            </span>
          )}
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-center px-2 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em] w-8">
                  #
                </th>
                <th className={thSort} onClick={() => handleSort("toko")}>
                  Store{sortIndicator("toko")}
                </th>
                <th className={thSort} onClick={() => handleSort("branch")}>
                  Branch{sortIndicator("branch")}
                </th>
                <th className={thSortRight} onClick={() => handleSort("qtyAll")}>
                  QTY All{sortIndicator("qtyAll")}
                </th>
                <th className={thSortRight} onClick={() => handleSort("qtyPromo")}>
                  QTY Promo{sortIndicator("qtyPromo")}
                </th>
                <th className={thSortRight} onClick={() => handleSort("revenue")}>
                  Revenue{sortIndicator("revenue")}
                </th>
                <th className={thSortRight} onClick={() => handleSort("discountTotal")}>
                  Discount{sortIndicator("discountTotal")}
                </th>
                <th className={thSortRight} onClick={() => handleSort("txnCount")}>
                  TXN{sortIndicator("txnCount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={`sskel-${String(i)}`} className="border-b border-border/50">
                    {Array.from({ length: 8 }, (_, j) => (
                      <td key={`sc-${String(j)}`} className="px-3 py-2.5">
                        <div className="h-3 bg-muted animate-pulse rounded-sm w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : currentStoreRows.length > 0 ? (
                currentStoreRows.map((s, idx) => {
                  const rank = (storePage - 1) * ROWS_PER_PAGE + idx + 1;
                  return (
                    <tr key={s.toko} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="px-2 py-2.5 text-center tabular-nums text-xs text-muted-foreground font-medium">{rank}</td>
                      <td className="px-3 py-2.5 font-medium text-foreground max-w-[180px] truncate text-xs">{s.toko}</td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">{s.branch || "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">{Math.round(s.qtyAll).toLocaleString("en-US")}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">{Math.round(s.qtyPromo).toLocaleString("en-US")}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">{fmt(s.revenue, "currency")}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                        {fmt(s.discountTotal, "currency")}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                        {s.txnCount.toLocaleString("en-US")}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    No data
                  </td>
                </tr>
              )}
            </tbody>
            {!isLoading && sortedStores.length > 0 && (() => {
              const totAll = sortedStores.reduce((sum, r) => sum + r.qtyAll, 0);
              const totPromo = sortedStores.reduce((sum, r) => sum + r.qtyPromo, 0);
              const totRev = sortedStores.reduce((sum, r) => sum + r.revenue, 0);
              const totDisc = sortedStores.reduce((sum, r) => sum + r.discountTotal, 0);
              const totTxn = sortedStores.reduce((sum, r) => sum + r.txnCount, 0);
              return (
                <tfoot>
                  <tr className="border-t-2 border-[#00E273]/40 bg-muted/40">
                    <td className="px-2 py-2.5 text-center text-[9px] font-bold text-foreground" colSpan={3}>
                      TOTAL
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-foreground">
                      {Math.round(totAll).toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-foreground">
                      {Math.round(totPromo).toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-foreground">
                      {fmt(totRev, "currency")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-muted-foreground">
                      {fmt(totDisc, "currency")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-foreground">
                      {totTxn.toLocaleString("en-US")}
                    </td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>

        {totalStorePages > 1 && (
          <div className="px-5 py-2.5 border-t border-border flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStorePage((p) => Math.max(1, p - 1))}
              disabled={storePage <= 1}
              className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-semibold rounded-sm border border-border bg-card hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="size-3" /> Prev
            </button>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              Page {storePage} of {totalStorePages}
            </span>
            <button
              type="button"
              onClick={() => setStorePage((p) => Math.min(totalStorePages, p + 1))}
              disabled={storePage >= totalStorePages}
              className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-semibold rounded-sm border border-border bg-card hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next <ChevronRight className="size-3" />
            </button>
          </div>
        )}
      </div>

      {/* ── 6. SPG Leaderboard ─────────────────────── */}
      <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em]">SPG Leaderboard</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-center px-2 py-2.5 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em] w-8">
                  #
                </th>
                <th className={thStatic}>SPG Name</th>
                <th className={thStaticRight}>QTY Promo</th>
                <th className={thStaticRight}>QTY All</th>
                <th className={thStaticRight}>Revenue</th>
                <th className={thStaticRight}>TXN</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={`lskel-${String(i)}`} className="border-b border-border/50">
                    {Array.from({ length: 6 }, (_, j) => (
                      <td key={`lc-${String(j)}`} className="px-3 py-2.5">
                        <div className="h-3 bg-muted animate-pulse rounded-sm w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sortedSpg.length > 0 ? (
                sortedSpg.map((s, idx) => (
                  <tr key={s.spg} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-2.5 text-center tabular-nums text-xs text-muted-foreground font-medium">{idx + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground text-xs">{s.spg}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold">
                      {Math.round(s.qtyPromo).toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      {Math.round(s.qtyAll).toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">{fmt(s.revenue, "currency")}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      {s.txnCount.toLocaleString("en-US")}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    No SPG data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
