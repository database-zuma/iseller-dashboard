"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

interface SkuData {
  bySeries: { series: string; revenue: number; pairs: number }[];
  byGender: { gender: string; revenue: number; pairs: number }[];
  byTier: { tier: string; revenue: number; pairs: number }[];
  topArticles: { article: string; kode: string; revenue: number; pairs: number }[];
}

const GREEN = "#00E273";
const PALETTE = [
  "#00E273", "#1cb865", "#3a8f58", "#56674a", "#6b5b3e",
  "#7e4f35", "#8f4030", "#9e2e2e", "#ab1a2e", "#b5002e",
];

function fmtRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

const barOpts = (title: string) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: { display: true, text: title, font: { size: 11 } },
    tooltip: {
      callbacks: {
        label: (ctx: { parsed: { y: number | null } }) => fmtRp(ctx.parsed.y ?? 0),
      },
    },
  },
  scales: {
    x: { ticks: { font: { size: 9 } } },
    y: { ticks: { font: { size: 9 }, callback: (v: number | string) => fmtRp(Number(v)) } },
  },
});

const hBarOpts = (title: string) => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y" as const,
  plugins: {
    legend: { display: false },
    title: { display: true, text: title, font: { size: 11 } },
    tooltip: {
      callbacks: {
        label: (ctx: { parsed: { x: number | null } }) => fmtRp(ctx.parsed.x ?? 0),
      },
    },
  },
  scales: {
    x: { ticks: { font: { size: 9 }, callback: (v: number | string) => fmtRp(Number(v)) } },
    y: { ticks: { font: { size: 9 } } },
  },
});

export default function SkuCharts({ data, loading }: { data?: SkuData; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {["series","gender","tier","top"].map((k) => (
          <div key={k} className="bg-card border border-border rounded-md p-4 h-64 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#00E273] border-t-transparent rounded-full animate-spin" />
          </div>
        ))}
      </div>
    );
  }

  const seriesData = {
    labels: data?.bySeries.map((d) => d.series || "Unknown") ?? [],
    datasets: [{
      data: data?.bySeries.map((d) => d.revenue) ?? [],
      backgroundColor: GREEN,
      borderRadius: 2,
    }],
  };

  const genderData = {
    labels: data?.byGender.map((d) => d.gender || "Unknown") ?? [],
    datasets: [{
      data: data?.byGender.map((d) => d.revenue) ?? [],
      backgroundColor: PALETTE.slice(0, (data?.byGender.length ?? 0)),
    }],
  };

  const tierData = {
    labels: data?.byTier.map((d) => `T${d.tier}`) ?? [],
    datasets: [{
      data: data?.byTier.map((d) => d.revenue) ?? [],
      backgroundColor: GREEN,
      borderRadius: 2,
    }],
  };

  const topData = {
    labels: data?.topArticles.map((d) => d.article || d.kode || "Unknown") ?? [],
    datasets: [{
      data: data?.topArticles.map((d) => d.revenue) ?? [],
      backgroundColor: GREEN,
      borderRadius: 2,
    }],
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-card border border-border rounded-md p-4 h-64">
        <Bar data={seriesData} options={barOpts("Revenue by Series")} />
      </div>
      <div className="bg-card border border-border rounded-md p-4 h-64 flex items-center justify-center">
        <div className="h-full w-full max-w-[260px]">
          <Doughnut
            data={genderData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: "right", labels: { font: { size: 10 } } },
                title: { display: true, text: "Revenue by Gender", font: { size: 11 } },
                tooltip: {
                  callbacks: {
                    label: (ctx: { parsed: number }) => fmtRp(ctx.parsed),
                  },
                },
              },
            }}
          />
        </div>
      </div>
      <div className="bg-card border border-border rounded-md p-4 h-64">
        <Bar data={tierData} options={barOpts("Revenue by Tier")} />
      </div>
      <div className="bg-card border border-border rounded-md p-4 h-72">
        <Bar data={topData} options={hBarOpts("Top 20 Articles by Revenue")} />
      </div>
    </div>
  );
}
