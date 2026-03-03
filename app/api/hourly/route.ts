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

    /* ── Run all queries in parallel ── */
    const [weeklyRes, byBranchWeeklyRes, hourlyRes, byBranchRes, dateRangeRes] = await Promise.all([
      /* Weekly aggregation: DOW (1=Mon..7=Sun) × hour (0-23) = 168 points */
      client.query(
        `SELECT EXTRACT(ISODOW FROM h.sale_date)::int AS dow,
                h.hour_wib,
                SUM(h.pairs) AS pairs,
                SUM(h.revenue) AS revenue,
                SUM(h.transactions) AS transactions
         FROM mart.iseller_hourly h ${where}
         GROUP BY EXTRACT(ISODOW FROM h.sale_date)::int, h.hour_wib
         ORDER BY dow, h.hour_wib`,
        vals
      ),
      /* By-branch weekly breakdown */
      client.query(
        `SELECT h.branch,
                EXTRACT(ISODOW FROM h.sale_date)::int AS dow,
                h.hour_wib,
                SUM(h.pairs) AS pairs,
                SUM(h.revenue) AS revenue,
                SUM(h.transactions) AS transactions
         FROM mart.iseller_hourly h ${where}
         GROUP BY h.branch, EXTRACT(ISODOW FROM h.sale_date)::int, h.hour_wib
         ORDER BY h.branch, dow, h.hour_wib`,
        vals
      ),
      /* Hour-only aggregation (for table + KPIs) */
      client.query(
        `SELECT h.hour_wib,
                SUM(h.pairs) AS pairs,
                SUM(h.revenue) AS revenue,
                SUM(h.transactions) AS transactions
         FROM mart.iseller_hourly h ${where}
         GROUP BY h.hour_wib
         ORDER BY h.hour_wib`,
        vals
      ),
      /* By-branch hour-only (kept for backward compat) */
      client.query(
        `SELECT h.branch, h.hour_wib,
                SUM(h.pairs) AS pairs,
                SUM(h.revenue) AS revenue,
                SUM(h.transactions) AS transactions
         FROM mart.iseller_hourly h ${where}
         GROUP BY h.branch, h.hour_wib
         ORDER BY h.branch, h.hour_wib`,
        vals
      ),
      /* Actual date range in the data */
      client.query(
        `SELECT MIN(h.sale_date)::text AS min_date,
                MAX(h.sale_date)::text AS max_date
         FROM mart.iseller_hourly h ${where}`,
        vals
      ),
    ]);

    /* ── Build weekly (168 points) ── */
    const weeklyMap = new Map<string, { pairs: number; revenue: number; transactions: number }>();
    for (let d = 1; d <= 7; d++) {
      for (let h = 0; h < 24; h++) {
        weeklyMap.set(`${d}-${h}`, { pairs: 0, revenue: 0, transactions: 0 });
      }
    }
    for (const r of weeklyRes.rows) {
      weeklyMap.set(`${r.dow}-${r.hour_wib}`, {
        pairs: Number(r.pairs),
        revenue: Number(r.revenue),
        transactions: Number(r.transactions),
      });
    }

    const weekly: { dow: number; hour: number; pairs: number; revenue: number; transactions: number }[] = [];
    for (let d = 1; d <= 7; d++) {
      for (let h = 0; h < 24; h++) {
        const data = weeklyMap.get(`${d}-${h}`)!;
        weekly.push({ dow: d, hour: h, ...data });
      }
    }

    /* ── By-branch weekly ── */
    const branchWeeklyMap = new Map<string, Map<string, { pairs: number; revenue: number; transactions: number }>>();
    for (const r of byBranchWeeklyRes.rows) {
      const branch = String(r.branch || "Unknown");
      if (!branchWeeklyMap.has(branch)) {
        const m = new Map<string, { pairs: number; revenue: number; transactions: number }>();
        for (let d = 1; d <= 7; d++) {
          for (let h = 0; h < 24; h++) {
            m.set(`${d}-${h}`, { pairs: 0, revenue: 0, transactions: 0 });
          }
        }
        branchWeeklyMap.set(branch, m);
      }
      branchWeeklyMap.get(branch)!.set(`${r.dow}-${r.hour_wib}`, {
        pairs: Number(r.pairs),
        revenue: Number(r.revenue),
        transactions: Number(r.transactions),
      });
    }

    const byBranchWeekly = Array.from(branchWeeklyMap.entries()).map(([branch, dmap]) => {
      const points: { dow: number; hour: number; pairs: number; revenue: number; transactions: number }[] = [];
      for (let d = 1; d <= 7; d++) {
        for (let h = 0; h < 24; h++) {
          const data = dmap.get(`${d}-${h}`)!;
          points.push({ dow: d, hour: h, ...data });
        }
      }
      return { branch, weekly: points };
    });

    /* ── Day-of-week summary (7 rows) ── */
    const dowSummary: { dow: number; pairs: number; revenue: number; transactions: number }[] = [];
    for (let d = 1; d <= 7; d++) {
      let pairs = 0, revenue = 0, transactions = 0;
      for (let h = 0; h < 24; h++) {
        const data = weeklyMap.get(`${d}-${h}`)!;
        pairs += data.pairs;
        revenue += data.revenue;
        transactions += data.transactions;
      }
      dowSummary.push({ dow: d, pairs, revenue, transactions });
    }

    /* ── Fill all 24 hours (for backward compat table) ── */
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

    /* ── By-branch hourly (backward compat) ── */
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

    /* ── KPIs ── */
    const totalPairs = hourly.reduce((s, h) => s + h.pairs, 0);
    const totalRevenue = hourly.reduce((s, h) => s + h.revenue, 0);
    const totalTxn = hourly.reduce((s, h) => s + h.transactions, 0);

    /* Peak: find the DOW+hour combo with most pairs */
    const peakWeekly = weekly.reduce((max, p) => p.pairs > max.pairs ? p : max, weekly[0]);
    const peakHour = hourly.reduce((max, h) => h.pairs > max.pairs ? h : max, hourly[0]);

    /* Date range */
    const dateRange = {
      from: dateRangeRes.rows[0]?.min_date || null,
      to: dateRangeRes.rows[0]?.max_date || null,
    };

    const body = {
      weekly,
      byBranchWeekly,
      dowSummary,
      hourly,
      byBranch,
      dateRange,
      kpis: {
        totalPairs,
        totalRevenue,
        totalTxn,
        peakHour: peakHour.hour,
        peakPairs: peakHour.pairs,
        peakWeeklyDow: peakWeekly.dow,
        peakWeeklyHour: peakWeekly.hour,
        peakWeeklyPairs: peakWeekly.pairs,
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
