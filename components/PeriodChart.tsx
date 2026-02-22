"use client";

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
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface TimeSeriesPoint {
  period: string;
  revenue: number;
  pairs: number;
}

const PERIODS = ["daily", "weekly", "monthly"] as const;

export default function PeriodChart({
  data,
  loading,
}: {
  data?: TimeSeriesPoint[];
  loading?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = (searchParams.get("period") || "daily") as typeof PERIODS[number];

  const setPeriod = useCallback(
    (p: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("period", p);
      router.push(`/?${params.toString()}`);
    },
    [router, searchParams]
  );

  const labels = data?.map((d) => d.period) ?? [];
  const revenueData = data?.map((d) => d.revenue / 1_000_000) ?? [];
  const pairsData = data?.map((d) => d.pairs) ?? [];

  const chartData = {
    labels,
    datasets: [
      {
        label: "Revenue (Rp juta)",
        data: revenueData,
        backgroundColor: "#00E273",
        borderRadius: 2,
        yAxisID: "y",
      },
      {
        label: "Pairs Sold",
        data: pairsData,
        backgroundColor: "oklch(0.35 0.01 60)",
        borderRadius: 2,
        yAxisID: "y1",
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { position: "top" as const, labels: { font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const y = ctx.parsed.y ?? 0;
            if (ctx.dataset.label?.includes("Revenue")) {
              return `Revenue: Rp ${(y * 1_000_000).toLocaleString("id-ID")}`;
            }
            return `Pairs: ${y.toLocaleString("id-ID")}`;
          },
        },
      },
    },
    scales: {
      y:  { type: "linear" as const, position: "left"  as const, ticks: { font: { size: 10 } } },
      y1: { type: "linear" as const, position: "right" as const, ticks: { font: { size: 10 } }, grid: { drawOnChartArea: false } },
    },
  };

  return (
    <div className="bg-card border border-border rounded-md p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Sales Over Time</h3>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded capitalize transition-colors
                ${period === p
                  ? "bg-[#00E273] text-black"
                  : "bg-secondary text-muted-foreground hover:bg-muted border border-border"
                }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="h-56 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#00E273] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Bar data={chartData} options={options} />
        )}
      </div>
    </div>
  );
}
