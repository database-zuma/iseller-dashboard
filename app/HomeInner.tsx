"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { preload, useSWRConfig } from "swr";
import { fetcher } from "@/lib/fetcher";
import FilterBar from "@/components/FilterBar";
import KpiCards from "@/components/KpiCards";
import PeriodChart from "@/components/PeriodChart";
import BranchPieChart from "@/components/BranchPieChart";
import StoreTable from "@/components/StoreTable";
import SkuCharts from "@/components/SkuCharts";
import DetailTable from "@/components/DetailTable";
import PromoTab from "@/components/PromoTab";
import HourlyGraph from "@/components/HourlyGraph";
import StoreAchievement from "@/components/StoreAchievement";
import { useMetisContext } from "@/providers/metis-provider";

const TABS = [
  { id: "summary", label: "Executive Summary" },
  { id: "achievement", label: "Store Achievement" },
  { id: "sku", label: "SKU Chart" },
  { id: "detail", label: "Detail (Kode)" },
  { id: "detail-size", label: "Detail Size (Kode Besar)" },
  { id: "promo", label: "Promo Monitor" },
  { id: "hourly", label: "Hourly Graph" },
] as const;

interface DashboardData {
  kpis: {
    revenue: number;
    pairs: number;
    transactions: number;
    atu: number;
    asp: number;
    atv: number;
  };
  lastUpdate: string | null;
  timeSeries: { period: string; revenue: number; pairs: number }[];
  stores: {
    toko: string;
    branch: string;
    pairs: number;
    revenue: number;
    transactions: number;
    atu: number;
    asp: number;
    atv: number;
  }[];
  byBranch: { branch: string; revenue: number }[];
  bySeries: { series: string; pairs: number }[];
  byGender: { gender: string; pairs: number }[];
  byTier: { tier: string; pairs: number }[];
  byTipe: { tipe: string; pairs: number }[];
  bySize: { size: string; pairs: number }[];
  byPrice: { label: string; pairs: number }[];
  rankByArticle: { article: string; kode_mix: string; pairs: number; revenue: number }[];
}

function formatLastUpdate(dateStr: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const day = parseInt(parts[2], 10);
  const month = months[parseInt(parts[1], 10) - 1] || parts[1];
  const year = parts[0];
  return `${day} ${month} ${year}`;
}

export default function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as typeof TABS[number]["id"]) || "summary";

  const setTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      
      // Ensure date range is set for detail tabs
      if ((tab === "detail" || tab === "detail-size") && !params.has("from")) {
        params.set("from", "2026-01-01");
      }
      if ((tab === "detail" || tab === "detail-size") && !params.has("to")) {
        const today = new Date().toISOString().substring(0, 10);
        params.set("to", today);
      }
      
      router.push(`/?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleChartFilter = useCallback(
    (param: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = params.get(param);
      if (current === value) {
        params.delete(param);
      } else {
        params.set(param, value);
      }
      params.delete("page");
      router.push(`/?${params.toString()}`);
    },
    [router, searchParams]
  );

  const prefetchTab = useCallback((tabId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("from")) params.set("from", "2026-01-01");
    if (!params.has("to")) params.set("to", new Date().toISOString().substring(0, 10));

    let url = "";
    switch (tabId) {
      case "achievement":
        url = "/api/achievement";
        break;
      case "detail":
        url = `/api/detail?v=2&mode=kode&${params.toString()}`;
        break;
      case "detail-size":
        url = `/api/detail?v=2&mode=kode_besar&${params.toString()}`;
        break;
      case "promo":
        const promoParams = new URLSearchParams();
        promoParams.set("from", params.get("from") || "2026-01-01");
        promoParams.set("to", params.get("to") || "");
        if (params.get("branch")) promoParams.set("branch", params.get("branch")!);
        if (params.get("store")) promoParams.set("store", params.get("store")!);
        if (params.get("campaign")) promoParams.set("campaign", params.get("campaign")!);
        url = `/api/promo?${promoParams.toString()}`;
        break;
      case "hourly":
        const hourlyParams = new URLSearchParams();
        hourlyParams.set("from", params.get("from") || "2026-01-01");
        hourlyParams.set("to", params.get("to") || "");
        ["branch", "store", "series", "gender", "tier", "color", "tipe", "version"].forEach(k => {
          if (params.get(k)) hourlyParams.set(k, params.get(k)!);
        });
        url = `/api/hourly?${hourlyParams.toString()}`;
        break;
    }

    if (url) {
      preload(url, fetcher);
    }
  }, [searchParams]);

  const apiParams = new URLSearchParams(searchParams.toString());
  if (!apiParams.has("from")) apiParams.set("from", "2026-01-01");
  if (!apiParams.has("to")) apiParams.set("to", new Date().toISOString().substring(0, 10));
  const dashboardUrl = `/api/dashboard?v=3&${apiParams.toString()}`;
  const { data, isLoading } = useSWR<DashboardData>(dashboardUrl, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 60000,
  });

  // Auto-detect stale data (raw newer than mart)
  const { data: staleness, mutate: recheckStaleness } = useSWR<{ rawLatest: string; martLatest: string; isStale: boolean }>(
    "/api/refresh",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 120000 }
  );

  const { mutate: globalMutate } = useSWRConfig();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Refresh failed");
      // Re-validate all SWR caches to pick up fresh data
      await globalMutate(() => true, undefined, { revalidate: true });
      await recheckStaleness();
    } catch (err) {
      console.error("Refresh failed:", err);
      alert(`Refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, globalMutate, recheckStaleness]);

  // Push dashboard state to Metis context
  const { setDashboardContext } = useMetisContext();

  const currentFilters = useMemo(() => ({
    from: searchParams.get("from") || "2026-01-01",
    to: searchParams.get("to") || new Date().toISOString().substring(0, 10),
    branch: searchParams.get("branch")?.split(",").filter(Boolean) || [],
    store: searchParams.get("store")?.split(",").filter(Boolean) || [],
    gender: searchParams.get("gender")?.split(",").filter(Boolean) || [],
    series: searchParams.get("series")?.split(",").filter(Boolean) || [],
    color: searchParams.get("color")?.split(",").filter(Boolean) || [],
    tier: searchParams.get("tier")?.split(",").filter(Boolean) || [],
    tipe: searchParams.get("tipe")?.split(",").filter(Boolean) || [],
    version: searchParams.get("version")?.split(",").filter(Boolean) || [],
    q: searchParams.get("q") || "",
    excludeNonSku: searchParams.get("excludeNonSku") === "1",
  }), [searchParams]);

  const visibleDataSummary = useMemo(() => {
    if (!data) return undefined;
    return {
      kpis: data.kpis,
      topStores: data.stores?.slice(0, 5).map(s => ({ name: s.toko, branch: s.branch, revenue: s.revenue, pairs: s.pairs })),
      byBranch: data.byBranch,
      bySeries: data.bySeries?.slice(0, 10),
      byGender: data.byGender,
      lastUpdate: data.lastUpdate,
    };
  }, [data]);

  useEffect(() => {
    setDashboardContext({
      filters: currentFilters,
      visibleData: visibleDataSummary,
      activeTab: activeTab,
    });
  }, [currentFilters, visibleDataSummary, activeTab, setDashboardContext]);

  return (
    <div className="min-h-screen bg-background">
      <div className="h-1 bg-[#00E273]" />
      <div className="max-w-7xl mx-auto flex flex-col gap-4 p-4 md:p-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-5 bg-[#00E273] rounded-full" />
              <h1 className="text-lg font-semibold text-foreground tracking-tight">iSeller Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              {staleness?.isStale && !refreshing && (
                <span className="text-[10px] text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40 px-2 py-0.5 rounded-sm border border-amber-200 dark:border-amber-800 animate-pulse">
                  New data available
                </span>
              )}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                title={refreshing ? 'Refreshing...' : 'Refresh mart data'}
                className="text-[10px] text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted px-2 py-1 rounded-sm border border-border transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center gap-1"
              >
                {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon with text label */}
                <svg className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M13.5 8a5.5 5.5 0 0 1-10.38 2.5M2.5 8a5.5 5.5 0 0 1 10.38-2.5" strokeLinecap="round" />
                  <path d="M13.5 3v3.5H10M2.5 13v-3.5H6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              {data?.lastUpdate && (
                <span className="text-[10px] text-muted-foreground tabular-nums bg-muted/60 px-2.5 py-1 rounded-sm border border-border">
                  Last Update: <span className="font-semibold text-foreground">{formatLastUpdate(data.lastUpdate)}</span>
                </span>
              )}
            </div>
          </div>
          <FilterBar />
        </header>
        <nav className="flex flex-wrap gap-0.5 border-b-2 border-border pb-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              onMouseEnter={() => prefetchTab(t.id)}
              className={`px-4 py-2 text-xs font-semibold transition-colors
                ${activeTab === t.id
                  ? "text-foreground border-b-[3px] border-[#00E273] -mb-[2px] bg-card"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 -mb-[2px] border-b-[3px] border-transparent"
                }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <main className="flex flex-col gap-4">
          {activeTab === "summary" && (
            <div className="flex flex-col gap-4">
              <KpiCards kpis={data?.kpis} loading={isLoading} />
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
                <div className="flex flex-col gap-4">
                  <PeriodChart data={data?.timeSeries} loading={isLoading} />
                  <BranchPieChart data={data?.byBranch} loading={isLoading} onChartFilter={handleChartFilter} />
                </div>
                <div className="lg:min-h-[500px]">
                  <StoreTable stores={data?.stores} loading={isLoading} />
                </div>
              </div>
            </div>
          )}
          {activeTab === "achievement" && <StoreAchievement />}
          {activeTab === "sku" && (
            <SkuCharts
              data={{
                bySeries: data?.bySeries ?? [],
                byGender: data?.byGender ?? [],
                byTier: data?.byTier ?? [],
                byTipe: data?.byTipe ?? [],
                bySize: data?.bySize ?? [],
                byPrice: data?.byPrice ?? [],
                rankByArticle: data?.rankByArticle ?? [],
                kpis: data?.kpis,
              }}
              loading={isLoading}
              onChartFilter={handleChartFilter}
            />
          )}

          {activeTab === "detail" && <DetailTable mode="kode" />}
          {activeTab === "detail-size" && <DetailTable mode="kode_besar" />}
          {activeTab === "promo" && <PromoTab />}
          {activeTab === "hourly" && <HourlyGraph />}
        </main>
        <footer className="text-[10px] text-muted-foreground pt-4 border-t border-border flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00E273]" />
          Zuma Indonesia · iSeller POS Analytics
        </footer>
      </div>
    </div>
  );
}
