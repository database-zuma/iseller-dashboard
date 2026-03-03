import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getCached, setCache } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 24 months: Jan 2025 → Dec 2026
const ALL_MONTHS: { yr: number; mo: number; key: string; label: string }[] = [];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
for (const yr of [2025, 2026]) {
  for (let mo = 1; mo <= 12; mo++) {
    ALL_MONTHS.push({
      yr,
      mo,
      key: `${yr}-${String(mo).padStart(2, "0")}`,
      label: `${MONTH_NAMES[mo - 1]} ${yr}`,
    });
  }
}

export async function GET() {
  const cacheKey = "achievement:all";
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  }

  try {
    // Two parallel queries — no filters, all data
    const [salesRes, targetRes] = await Promise.all([
      // Query 1: Monthly sales per store (qty + revenue)
      pool.query(`
        SELECT
          d.toko,
          COALESCE(NULLIF(d.branch, ''), 'Event') AS branch,
          EXTRACT(YEAR FROM d.sale_date)::int AS yr,
          EXTRACT(MONTH FROM d.sale_date)::int AS mo,
          SUM(d.pairs)::int AS qty,
          SUM(d.revenue)::bigint AS revenue
        FROM mart.mv_iseller_summary d
        WHERE d.sale_date >= '2025-01-01' AND d.sale_date < '2027-01-01'
        GROUP BY d.toko, d.branch,
                 EXTRACT(YEAR FROM d.sale_date),
                 EXTRACT(MONTH FROM d.sale_date)
      `),
      // Query 2: Monthly targets per store (unpivoted)
      pool.query(`
        SELECT
          s.nama_iseller AS toko,
          t.year AS yr,
          m.month_num AS mo,
          m.target_revenue::bigint AS target
        FROM portal.store_monthly_target t
        JOIN portal.store s ON LOWER(s.nama_iseller) = t.store_name_norm
        CROSS JOIN LATERAL (VALUES
          (1, t.jan), (2, t.feb), (3, t.mar), (4, t.apr), (5, t.may), (6, t.jun),
          (7, t.jul), (8, t.aug), (9, t.sep), (10, t.oct), (11, t.nov), (12, t.dec)
        ) AS m(month_num, target_revenue)
        WHERE t.year IN (2025, 2026)
      `),
    ]);

    // Build lookup maps
    // salesMap: toko -> "YYYY-MM" -> { qty, revenue, branch }
    const salesMap = new Map<string, Map<string, { qty: number; revenue: number; branch: string }>>();
    const branchMap = new Map<string, string>(); // toko -> branch (latest)

    for (const r of salesRes.rows) {
      const toko = String(r.toko);
      const key = `${r.yr}-${String(r.mo).padStart(2, "0")}`;
      if (!salesMap.has(toko)) salesMap.set(toko, new Map());
      salesMap.get(toko)!.set(key, {
        qty: Number(r.qty),
        revenue: Number(r.revenue),
        branch: String(r.branch),
      });
      branchMap.set(toko, String(r.branch));
    }

    // targetMap: toko -> "YYYY-MM" -> target
    const targetMap = new Map<string, Map<string, number>>();
    for (const r of targetRes.rows) {
      const toko = String(r.toko);
      const key = `${r.yr}-${String(r.mo).padStart(2, "0")}`;
      const target = Number(r.target || 0);
      if (!targetMap.has(toko)) targetMap.set(toko, new Map());
      targetMap.get(toko)!.set(key, target);
    }

    // Collect all unique stores from both sales and target
    const allStores = new Set<string>();
    for (const toko of salesMap.keys()) allStores.add(toko);
    for (const toko of targetMap.keys()) allStores.add(toko);

    // Build response — each store with monthly data
    const stores = Array.from(allStores)
      .sort((a, b) => a.localeCompare(b))
      .map((toko) => {
        const salesData = salesMap.get(toko);
        const targetData = targetMap.get(toko);
        const branch = branchMap.get(toko) || "—";

        // Calculate total revenue across all months for sorting later
        let totalRevenue = 0;

        const monthly: Record<string, { qty: number; revenue: number; target: number | null; achievementPct: number | null }> = {};
        for (const m of ALL_MONTHS) {
          const s = salesData?.get(m.key);
          const t = targetData?.get(m.key);
          const qty = s?.qty ?? 0;
          const revenue = s?.revenue ?? 0;
          const target = (t && t > 0) ? t : null;
          const achievementPct = target && target > 0 ? Math.round((revenue / target) * 1000) / 10 : null;
          monthly[m.key] = { qty, revenue, target, achievementPct };
          totalRevenue += revenue;
        }

        return { toko, branch, totalRevenue, monthly };
      })
      // Sort by total revenue descending
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    const body = {
      months: ALL_MONTHS.map((m) => ({ key: m.key, label: m.label })),
      stores,
    };

    setCache(cacheKey, body);

    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    console.error("achievement error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
