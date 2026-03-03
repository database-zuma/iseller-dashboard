import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function parseMulti(sp: URLSearchParams, key: string): string[] {
  const val = sp.get(key);
  if (!val) return [];
  return val.split(",").map((v) => v.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const client = await pool.connect();

  try {
    const vals: unknown[] = [];
    const conds: string[] = [];
    let i = 1;

    const from = sp.get("from");
    const to = sp.get("to");
    if (from) { conds.push(`h.sale_date >= $${i++}`); vals.push(from); }
    if (to)   { conds.push(`h.sale_date <= $${i++}`); vals.push(to); }

    for (const [param, col] of [
      ["branch", "branch"],
      ["store",  "toko"],
      ["series", "series"],
      ["gender", "gender"],
      ["tier",   "tier"],
      ["color",  "color"],
      ["tipe",   "tipe"],
      ["version", "version"],
    ] as [string, string][]) {
      const fv = parseMulti(sp, param);
      if (!fv.length) continue;
      const phs = fv.map(() => `$${i++}`).join(", ");
      conds.push(`h.${col} IN (${phs})`);
      vals.push(...fv);
    }

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    /* ── Main hourly aggregation: hours 0-23 ── */
    const hourlyRes = await client.query(
      `SELECT h.hour_wib,
              SUM(h.pairs) AS pairs,
              SUM(h.revenue) AS revenue,
              SUM(h.transactions) AS transactions
       FROM mart.iseller_hourly h ${where}
       GROUP BY h.hour_wib
       ORDER BY h.hour_wib`,
      vals
    );

    /* ── By-branch hourly breakdown (for multi-line chart) ── */
    const byBranchRes = await client.query(
      `SELECT h.branch, h.hour_wib,
              SUM(h.pairs) AS pairs,
              SUM(h.revenue) AS revenue,
              SUM(h.transactions) AS transactions
       FROM mart.iseller_hourly h ${where}
       GROUP BY h.branch, h.hour_wib
       ORDER BY h.branch, h.hour_wib`,
      vals
    );

    /* ── Fill all 24 hours (0-23) even if no data ── */
    const hourMap = new Map<number, { pairs: number; revenue: number; transactions: number }>();
    for (let h = 0; h < 24; h++) {
      hourMap.set(h, { pairs: 0, revenue: 0, transactions: 0 });
    }
    for (const r of hourlyRes.rows) {
      hourMap.set(Number(r.hour_wib), {
        pairs: Number(r.pairs),
        revenue: Number(r.revenue),
        transactions: Number(r.transactions),
      });
    }

    const hourly = Array.from(hourMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, data]) => ({ hour, ...data }));

    /* ── Group by-branch data ── */
    const branchMap = new Map<string, Map<number, { pairs: number; revenue: number; transactions: number }>>();
    for (const r of byBranchRes.rows) {
      const branch = String(r.branch || "Unknown");
      if (!branchMap.has(branch)) {
        const m = new Map<number, { pairs: number; revenue: number; transactions: number }>();
        for (let h = 0; h < 24; h++) m.set(h, { pairs: 0, revenue: 0, transactions: 0 });
        branchMap.set(branch, m);
      }
      branchMap.get(branch)!.set(Number(r.hour_wib), {
        pairs: Number(r.pairs),
        revenue: Number(r.revenue),
        transactions: Number(r.transactions),
      });
    }

    const byBranch = Array.from(branchMap.entries()).map(([branch, hours]) => ({
      branch,
      hourly: Array.from(hours.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([hour, data]) => ({ hour, ...data })),
    }));

    /* ── KPI summary ── */
    const totalPairs = hourly.reduce((s, h) => s + h.pairs, 0);
    const totalRevenue = hourly.reduce((s, h) => s + h.revenue, 0);
    const totalTxn = hourly.reduce((s, h) => s + h.transactions, 0);

    /* ── Peak hour ── */
    const peakHour = hourly.reduce((max, h) => h.pairs > max.pairs ? h : max, hourly[0]);

    const body = {
      hourly,
      byBranch,
      kpis: {
        totalPairs,
        totalRevenue,
        totalTxn,
        peakHour: peakHour.hour,
        peakPairs: peakHour.pairs,
      },
    };

    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    console.error("hourly error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  } finally {
    client.release();
  }
}
