"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import FilterBar from "@/components/FilterBar";
import KpiCards from "@/components/KpiCards";
import PeriodChart from "@/components/PeriodChart";
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
  bySeries: { series: string; revenue: number; pairs: number }[];
  byGender: { gender: string; revenue: number; pairs: number }[];
  byTier: { tier: string; revenue: number; pairs: number }[];
  topArticles: { article: string; kode: string; revenue: number; pairs: number }[];
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
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-foreground">iSeller Dashboard</h1>
          <FilterBar />
        </header>

        <nav className="flex flex-wrap gap-1 border-b border-border pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors
                ${activeTab === t.id
                  ? "text-foreground border-b-2 border-[#00E273]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
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
            </div>
          )}

          {activeTab === "sku" && (
            <SkuCharts
              data={{
                bySeries: data?.bySeries ?? [],
                byGender: data?.byGender ?? [],
                byTier: data?.byTier ?? [],
                topArticles: data?.topArticles ?? [],
              }}
              loading={isLoading}
            />
          )}

          {activeTab === "detail" && <DetailTable mode="kode" />}

          {activeTab === "detail-size" && <DetailTable mode="kode_besar" />}
        </main>

        <footer className="text-[10px] text-muted-foreground pt-4 border-t border-border">
          Zuma Indonesia · iSeller POS Analytics
        </footer>
      </div>
    </div>
  );
}
