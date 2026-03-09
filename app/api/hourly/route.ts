import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Max store lines to return for the by-store chart */
const MAX_STORES = 20;

function parseMulti(sp: URLSearchParams, key: string): string[] {
  const val = sp.get(key);
  if (!val) return [];
  return val.split(",").map((v) => v.trim()).filter(Boolean);
}

function shiftYear(dateStr: string, offset: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setFullYear(d.getFullYear() + offset);
  return d.toISOString().substring(0, 10);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const client = await pool.connect();

  try {
    const vals: unknown[] = [];
    const conds: string[] = [];
    const valsLastYear: unknown[] = [];
    const condsLastYear: string[] = [];
    let i = 1;
    let iLy = 1;

    const from = sp.get("from");
    const to = sp.get("to");
    
    // Current year filter
    if (from) { conds.push(`h.sale_date >= $${i++}`); vals.push(from); }
    if (to) { conds.push(`h.sale_date <= $${i++}`); vals.push(to); }
    
    // Last year filter (shifted dates)
    if (from && to) {
      const fromLy = shiftYear(from, -1);
      const toLy = shiftYear(to, -1);
      condsLastYear.push(`h.sale_date >= $${iLy++}`);
      valsLastYear.push(fromLy);
      condsLastYear.push(`h.sale_date <= $${iLy++}`);
      valsLastYear.push(toLy);
    } else if (from) {
      const fromLy = shiftYear(from, -1);
      condsLastYear.push(`h.sale_date >= $${iLy++}`);
      valsLastYear.push(fromLy);
    } else if (to) {
      const toLy = shiftYear(to, -1);
      condsLastYear.push(`h.sale_date <= $${iLy++}`);
      valsLastYear.push(toLy);
    }

    // Other filters (applied to both queries)
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
      
      const phsLy = fv.map(() => `$${iLy++}`).join(", ");
      condsLastYear.push(`h.${col} IN (${phsLy})`);
      valsLastYear.push(...fv);
    }

    const areaFv = parseMulti(sp, "area");
    if (areaFv.length) {
      const phs = areaFv.map(() => `$${i++}`).join(", ");
      conds.push(`h.toko IN (SELECT nama_iseller FROM portal.store WHERE area IN (${phs}))`);
      vals.push(...areaFv);

      const phsLy = areaFv.map(() => `$${iLy++}`).join(", ");
      condsLastYear.push(`h.toko IN (SELECT nama_iseller FROM portal.store WHERE area IN (${phsLy}))`);
      valsLastYear.push(...areaFv);
    }

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const whereLastYear = condsLastYear.length ? `WHERE ${condsLastYear.join(" AND ")}` : "";

    // Run queries in parallel
    const [timelineRes, byStoreRes, dateRangeRes, lastYearRes] = await Promise.all([
      // Current year timeline
      client.query(
        `SELECT h.sale_date::text AS sale_date,
                h.hour_wib,
                SUM(h.pairs)::int AS pairs,
                SUM(h.revenue)::bigint AS revenue,
                SUM(h.transactions)::int AS transactions
         FROM mart.iseller_hourly h ${where}
         GROUP BY h.sale_date, h.hour_wib
         ORDER BY h.sale_date, h.hour_wib`,
        vals
      ),
      // By-store timeline
      client.query(
        `SELECT h.toko,
                h.sale_date::text AS sale_date,
                h.hour_wib,
                SUM(h.pairs)::int AS pairs,
                SUM(h.transactions)::int AS transactions
         FROM mart.iseller_hourly h ${where}
         GROUP BY h.toko, h.sale_date, h.hour_wib
         ORDER BY h.toko, h.sale_date, h.hour_wib`,
        vals
      ),
      // Date range
      client.query(
        `SELECT MIN(h.sale_date)::text AS min_date,
                MAX(h.sale_date)::text AS max_date
         FROM mart.iseller_hourly h ${where}`,
        vals
      ),
      // Last year timeline
      client.query(
        `SELECT h.sale_date::text AS sale_date,
                h.hour_wib,
                SUM(h.pairs)::int AS pairs,
                SUM(h.revenue)::bigint AS revenue,
                SUM(h.transactions)::int AS transactions
         FROM mart.iseller_hourly h ${whereLastYear}
         GROUP BY h.sale_date, h.hour_wib
         ORDER BY h.sale_date, h.hour_wib`,
        valsLastYear
      ),
    ]);

    // Build date list from current year data
    const minDate = dateRangeRes.rows[0]?.min_date;
    const maxDate = dateRangeRes.rows[0]?.max_date;
    const dates: string[] = [];

    if (minDate && maxDate) {
      const d = new Date(minDate + "T00:00:00");
      const end = new Date(maxDate + "T00:00:00");
      while (d <= end) {
        dates.push(d.toISOString().substring(0, 10));
        d.setDate(d.getDate() + 1);
      }
    }

    const totalSlots = dates.length * 24;

    // Build slot index for current dates
    const slotIndex = new Map<string, number>();
    let idx = 0;
    for (const date of dates) {
      for (let h = 0; h < 24; h++) {
        slotIndex.set(`${date}|${h}`, idx++);
      }
    }

    // Process current year data
    const pairs = new Array<number>(totalSlots).fill(0);
    const revenue = new Array<number>(totalSlots).fill(0);
    const transactions = new Array<number>(totalSlots).fill(0);

    for (const r of timelineRes.rows) {
      const si = slotIndex.get(`${r.sale_date}|${r.hour_wib}`);
      if (si !== undefined) {
        pairs[si] = Number(r.pairs);
        revenue[si] = Number(r.revenue);
        transactions[si] = Number(r.transactions);
      }
    }

    // Process last year data - map to current year slots
    const lastYearPairs = new Array<number>(totalSlots).fill(0);
    const lastYearRevenue = new Array<number>(totalSlots).fill(0);
    const lastYearTransactions = new Array<number>(totalSlots).fill(0);

    for (const r of lastYearRes.rows) {
      // Shift last year date to current year
      const shiftedDate = shiftYear(r.sale_date as string, 1);
      const si = slotIndex.get(`${shiftedDate}|${r.hour_wib}`);
      if (si !== undefined) {
        lastYearPairs[si] = Number(r.pairs);
        lastYearRevenue[si] = Number(r.revenue);
        lastYearTransactions[si] = Number(r.transactions);
      }
    }

    // Build by-store data
    const storeMap = new Map<string, { pairs: number[]; transactions: number[]; total: number }>();

    for (const r of byStoreRes.rows) {
      const store = String(r.toko || "Unknown");
      if (!storeMap.has(store)) {
        storeMap.set(store, {
          pairs: new Array<number>(totalSlots).fill(0),
          transactions: new Array<number>(totalSlots).fill(0),
          total: 0,
        });
      }
      const si = slotIndex.get(`${r.sale_date}|${r.hour_wib}`);
      if (si !== undefined) {
        const entry = storeMap.get(store)!;
        const p = Number(r.pairs);
        entry.pairs[si] = p;
        entry.transactions[si] = Number(r.transactions);
        entry.total += p;
      }
    }

    const byStore = Array.from(storeMap.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, MAX_STORES)
      .map(([store, data]) => ({
        store,
        pairs: data.pairs,
        transactions: data.transactions,
      }));

    // KPIs
    const totalPairs = pairs.reduce((s, v) => s + v, 0);
    const totalRevenue = revenue.reduce((s, v) => s + v, 0);
    const totalTxn = transactions.reduce((s, v) => s + v, 0);

    let peakSlot = 0;
    for (let si = 1; si < totalSlots; si++) {
      if (pairs[si] > pairs[peakSlot]) peakSlot = si;
    }

    const peakDate = totalSlots > 0 ? dates[Math.floor(peakSlot / 24)] ?? null : null;
    const peakHour = totalSlots > 0 ? peakSlot % 24 : 0;
    const peakPairs = totalSlots > 0 ? pairs[peakSlot] ?? 0 : 0;

    const lastYearTotalPairs = lastYearPairs.reduce((s, v) => s + v, 0);

    const body = {
      dates,
      pairs,
      revenue,
      transactions,
      byStore,
      storeCount: storeMap.size,
      dateRange: { from: minDate || null, to: maxDate || null },
      kpis: { totalPairs, totalRevenue, totalTxn, peakDate, peakHour, peakPairs },
      lastYear: {
        pairs: lastYearPairs,
        revenue: lastYearRevenue,
        transactions: lastYearTransactions,
        totalPairs: lastYearTotalPairs,
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
