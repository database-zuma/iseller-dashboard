"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import FilterBar from "@/components/FilterBar";
import KpiCards from "@/components/KpiCards";
import PeriodChart from "@/components/PeriodChart";
import BranchPieChart from "@/components/BranchPieChart";
import StoreTable from "@/components/StoreTable";
import SkuCharts from "@/components/SkuCharts";
import DetailTable from "@/components/DetailTable";

const TABS = [
  { id: "summary", label: "Executive Summary" },
  { id: "sku", label: "SKU Chart" },
  { id: "detail", label: "Detail (Kode)" },
  { id: "detail-size", label: "Detail Size (Kode Besar)" },
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

export default function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as typeof TABS[number]["id"]) || "summary";

  const setTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.push(`/?${params.toString()}`);
    },
    [router, searchParams]
  );

  const qs = searchParams.toString();
  const dashboardUrl = `/api/dashboard${qs ? `?${qs}` : ""}`;
  const { data, isLoading } = useSWR<DashboardData>(dashboardUrl, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

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
            {data?.lastUpdate && (
              <span className="text-[10px] text-muted-foreground tabular-nums bg-muted/60 px-2.5 py-1 rounded-sm border border-border">
                Data as of <span className="font-semibold text-foreground">{data.lastUpdate}</span>
              </span>
            )}
          </div>
          <FilterBar />
        </header>
        <nav className="flex flex-wrap gap-0.5 border-b-2 border-border pb-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PeriodChart data={data?.timeSeries} loading={isLoading} />
                <div className="h-64 lg:h-auto">
                  <StoreTable stores={data?.stores} loading={isLoading} />
                </div>
              </div>
              <BranchPieChart data={data?.byBranch} loading={isLoading} />
            </div>
          )}
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
              }}
              loading={isLoading}
            />
          )}

          {activeTab === "detail" && <DetailTable mode="kode" />}
          {activeTab === "detail-size" && <DetailTable mode="kode_besar" />}
        </main>
        <footer className="text-[10px] text-muted-foreground pt-4 border-t border-border flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00E273]" />
          Zuma Indonesia · iSeller POS Analytics
        </footer>
      </div>
    </div>
  );
}
