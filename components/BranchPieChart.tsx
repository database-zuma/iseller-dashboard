"use client";

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Pie } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

interface BranchRow {
  branch: string;
  revenue: number;
}

/* Zuma brand–derived flat Dieter Rams palette — no gradients */
const BRANCH_COLORS = [
  "#00E273", // zuma green
  "#002A3A", // zuma teal
  "#4A4A4A", // charcoal
  "#8C8C8C", // mid grey
  "#C4C4C4", // light grey
  "#00B25A", // darker green
  "#1A5C6B", // steel teal
  "#D4D4D4", // pale grey
];

function fmtRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return `Rp ${Math.round(n).toLocaleString("en-US")}`;
}

export default function BranchPieChart({
  data,
  loading,
}: {
  data?: BranchRow[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-sm p-5 shadow-sm">
        <div className="h-6 w-48 bg-muted animate-pulse rounded-sm mb-4" />
        <div className="h-56 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[#00E273] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!data?.length) return null;

  const total = data.reduce((s, d) => s + d.revenue, 0);

  const chartData = {
    labels: data.map((d) => d.branch || "Unknown"),
    datasets: [
      {
        data: data.map((d) => d.revenue),
        backgroundColor: BRANCH_COLORS.slice(0, data.length),
        borderWidth: 1,
        borderColor: "#fff",
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right" as const,
        labels: {
          font: { size: 10, family: "Inter, system-ui, sans-serif" },
          usePointStyle: true,
          pointStyle: "rect" as const,
          padding: 12,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { label: string; parsed: number }) => {
            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : "0";
            return `${ctx.label}: ${fmtRp(ctx.parsed)} (${pct}%)`;
          },
        },
      },
    },
  };

  return (
    <div className="bg-card border border-border rounded-sm p-5 shadow-sm">
      <h3 className="text-[10px] font-bold text-foreground uppercase tracking-[0.15em] mb-3">
        Sales Contribution by Branch
      </h3>
      <div className="flex flex-col md:flex-row gap-4">
        <div className="h-56 flex-1 flex items-center justify-center">
          <div className="h-full w-full max-w-[320px]">
            <Pie data={chartData} options={options} />
          </div>
        </div>
        <div className="flex-shrink-0 min-w-[200px]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Branch</th>
                <th className="text-right py-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Revenue</th>
                <th className="text-right py-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.branch} className="border-b border-border/40">
                  <td className="py-1.5 font-medium">{d.branch || "Unknown"}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtRp(d.revenue)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {total > 0 ? ((d.revenue / total) * 100).toFixed(1) : "0"}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
