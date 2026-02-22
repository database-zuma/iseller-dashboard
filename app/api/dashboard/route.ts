import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function parseMulti(sp: URLSearchParams, key: string): string[] {
  const val = sp.get(key);
  if (!val) return [];
  return val.split(",").map((v) => v.trim()).filter(Boolean);
}

function buildFilters(
  sp: URLSearchParams,
  vals: unknown[],
  startIdx: number,
  tablePrefix = ""
): { conds: string[]; nextIdx: number } {
  const conds: string[] = [];
  let i = startIdx;
  const pre = tablePrefix ? `${tablePrefix}.` : "";

  const from = sp.get("from");
  const to = sp.get("to");
  if (from) { conds.push(`${pre}sale_date >= $${i++}`); vals.push(from); }
  if (to)   { conds.push(`${pre}sale_date <= $${i++}`); vals.push(to); }

  const branch = parseMulti(sp, "branch");
  if (branch.length) {
    const phs = branch.map(() => `$${i++}`).join(", ");
    conds.push(`${pre}branch IN (${phs})`);
    vals.push(...branch);
  }

  const store = parseMulti(sp, "store");
  if (store.length) {
    const phs = store.map(() => `$${i++}`).join(", ");
    conds.push(`${pre}toko IN (${phs})`);
    vals.push(...store);
  }

  return { conds, nextIdx: i };
}

function buildDailyFilters(
  sp: URLSearchParams,
  vals: unknown[],
  startIdx: number
): { conds: string[]; nextIdx: number } {
  const { conds, nextIdx } = buildFilters(sp, vals, startIdx);
  let i = nextIdx;

  const series = parseMulti(sp, "series");
  if (series.length) {
    const phs = series.map(() => `$${i++}`).join(", ");
    conds.push(`series IN (${phs})`);
    vals.push(...series);
  }

  const gender = parseMulti(sp, "gender");
  if (gender.length) {
    const phs = gender.map(() => `$${i++}`).join(", ");
    conds.push(`gender IN (${phs})`);
    vals.push(...gender);
  }

  const tier = parseMulti(sp, "tier");
  if (tier.length) {
    const phs = tier.map(() => `$${i++}`).join(", ");
    conds.push(`tier IN (${phs})`);
    vals.push(...tier);
  }

  const payment = parseMulti(sp, "payment");
  if (payment.length) {
    const phs = payment.map(() => `$${i++}`).join(", ");
    conds.push(`payment_type IN (${phs})`);
    vals.push(...payment);
  }

  return { conds, nextIdx: i };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const period = sp.get("period") || "daily";

  const periodExpr =
    period === "monthly" ? "DATE_TRUNC('month', sale_date)::DATE" :
    period === "weekly"  ? "DATE_TRUNC('week',  sale_date)::DATE" :
                           "sale_date";

  try {
    // ── Daily filters (for iseller_daily queries)
    const dailyVals: unknown[] = [];
    const { conds: dailyConds } = buildDailyFilters(sp, dailyVals, 1);
    const dailyWhere = dailyConds.length ? `WHERE ${dailyConds.join(" AND ")}` : "";

    // ── Base filters only (for iseller_txn, which has no SKU dimensions)
    const txnVals: unknown[] = [];
    const { conds: txnConds } = buildFilters(sp, txnVals, 1);
    // Also apply payment filter to txn
    const payment = parseMulti(sp, "payment");
    let txnNextIdx = txnConds.length > 0 ? txnVals.length + 1 : 1;
    // recalculate txnNextIdx properly
    txnNextIdx = txnVals.length + 1;
    if (payment.length) {
      const phs = payment.map(() => `$${txnNextIdx++}`).join(", ");
      txnConds.push(`payment_type IN (${phs})`);
      txnVals.push(...payment);
    }
    const txnWhere = txnConds.length ? `WHERE ${txnConds.join(" AND ")}` : "";

    // ── 1. Global KPI: revenue + pairs from daily; txn count from txn table
    const [kpiDaily, kpiTxn] = await Promise.all([
      pool.query(
        `SELECT SUM(revenue) AS revenue, SUM(pairs) AS pairs FROM mart.iseller_daily ${dailyWhere}`,
        dailyVals
      ),
      pool.query(
        `SELECT COUNT(*) AS transactions FROM mart.iseller_txn ${txnWhere}`,
        txnVals
      ),
    ]);

    const revenue = Number(kpiDaily.rows[0].revenue || 0);
    const pairs = Number(kpiDaily.rows[0].pairs || 0);
    const transactions = Number(kpiTxn.rows[0].transactions || 0);
    const kpis = {
      revenue,
      pairs,
      transactions,
      atu: transactions > 0 ? pairs / transactions : 0,
      asp: pairs > 0 ? revenue / pairs : 0,
      atv: transactions > 0 ? revenue / transactions : 0,
    };

    // ── 2. Time series
    const tsVals = [...dailyVals];
    const tsSql = `
      SELECT ${periodExpr} AS period,
             SUM(revenue) AS revenue,
             SUM(pairs)   AS pairs
      FROM mart.iseller_daily
      ${dailyWhere}
      GROUP BY 1 ORDER BY 1
    `;
    const tsRes = await pool.query(tsSql, tsVals);
    const timeSeries = tsRes.rows.map((r: Record<string, unknown>) => ({
      period: String(r.period).substring(0, 10),
      revenue: Number(r.revenue),
      pairs: Number(r.pairs),
    }));

    // ── 3. Store performance (join daily + txn)
    // Build separate vals arrays for the CTE sub-queries inside one query
    const storeVals: unknown[] = [];
    const storeD: string[] = [];
    const storeT: string[] = [];
    let si = 1;

    const from = sp.get("from");
    const to = sp.get("to");
    if (from) {
      storeD.push(`d.sale_date >= $${si}`);
      storeT.push(`t.sale_date >= $${si}`);
      storeVals.push(from);
      si++;
    }
    if (to) {
      storeD.push(`d.sale_date <= $${si}`);
      storeT.push(`t.sale_date <= $${si}`);
      storeVals.push(to);
      si++;
    }

    const branch = parseMulti(sp, "branch");
    if (branch.length) {
      const phs = branch.map(() => `$${si++}`).join(", ");
      storeD.push(`d.branch IN (${phs})`);
      storeT.push(`t.branch IN (${phs})`);
      storeVals.push(...branch);
    }

    const store = parseMulti(sp, "store");
    if (store.length) {
      const phs = store.map(() => `$${si++}`).join(", ");
      storeD.push(`d.toko IN (${phs})`);
      storeT.push(`t.toko IN (${phs})`);
      storeVals.push(...store);
    }

    const series = parseMulti(sp, "series");
    if (series.length) {
      const phs = series.map(() => `$${si++}`).join(", ");
      storeD.push(`d.series IN (${phs})`);
      storeVals.push(...series);
    }

    const gender = parseMulti(sp, "gender");
    if (gender.length) {
      const phs = gender.map(() => `$${si++}`).join(", ");
      storeD.push(`d.gender IN (${phs})`);
      storeVals.push(...gender);
    }

    const tier = parseMulti(sp, "tier");
    if (tier.length) {
      const phs = tier.map(() => `$${si++}`).join(", ");
      storeD.push(`d.tier IN (${phs})`);
      storeVals.push(...tier);
    }

    if (payment.length) {
      const phs = payment.map(() => `$${si++}`).join(", ");
      storeD.push(`d.payment_type IN (${phs})`);
      storeT.push(`t.payment_type IN (${phs})`);
      storeVals.push(...payment);
    }

    const storeDWhere = storeD.length ? `WHERE ${storeD.join(" AND ")}` : "";
    const storeTWhere = storeT.length ? `WHERE ${storeT.join(" AND ")}` : "";

    const storeSql = `
      WITH daily_agg AS (
        SELECT d.toko, SUM(d.pairs) AS pairs, SUM(d.revenue) AS revenue,
               MAX(d.branch) AS branch
        FROM mart.iseller_daily d
        ${storeDWhere}
        GROUP BY d.toko
      ),
      txn_agg AS (
        SELECT t.toko, COUNT(*) AS transactions
        FROM mart.iseller_txn t
        ${storeTWhere}
        GROUP BY t.toko
      )
      SELECT
        a.toko,
        a.branch,
        a.pairs,
        a.revenue,
        COALESCE(x.transactions, 0) AS transactions,
        CASE WHEN COALESCE(x.transactions,0) > 0 THEN a.pairs  / x.transactions ELSE 0 END AS atu,
        CASE WHEN a.pairs > 0                     THEN a.revenue / a.pairs         ELSE 0 END AS asp,
        CASE WHEN COALESCE(x.transactions,0) > 0 THEN a.revenue / x.transactions ELSE 0 END AS atv
      FROM daily_agg a
      LEFT JOIN txn_agg x ON a.toko = x.toko
      ORDER BY a.revenue DESC
    `;
    const storeRes = await pool.query(storeSql, storeVals);
    const stores = storeRes.rows.map((r: Record<string, unknown>) => ({
      toko: r.toko,
      branch: r.branch,
      pairs: Number(r.pairs),
      revenue: Number(r.revenue),
      transactions: Number(r.transactions),
      atu: Number(r.atu),
      asp: Number(r.asp),
      atv: Number(r.atv),
    }));

    // ── 4. SKU breakdowns (from mart.iseller_daily with all filters)
    const [seriesRes, genderRes, tierRes, topRes] = await Promise.all([
      pool.query(
        `SELECT series, SUM(revenue) AS revenue, SUM(pairs) AS pairs
         FROM mart.iseller_daily ${dailyWhere}
         GROUP BY series ORDER BY revenue DESC NULLS LAST`,
        dailyVals
      ),
      pool.query(
        `SELECT gender, SUM(revenue) AS revenue, SUM(pairs) AS pairs
         FROM mart.iseller_daily ${dailyWhere}
         GROUP BY gender ORDER BY revenue DESC NULLS LAST`,
        dailyVals
      ),
      pool.query(
        `SELECT tier, SUM(revenue) AS revenue, SUM(pairs) AS pairs
         FROM mart.iseller_daily ${dailyWhere}
         GROUP BY tier ORDER BY tier ASC NULLS LAST`,
        dailyVals
      ),
      pool.query(
        `SELECT article, kode, SUM(revenue) AS revenue, SUM(pairs) AS pairs
         FROM mart.iseller_daily ${dailyWhere}
         GROUP BY article, kode ORDER BY revenue DESC NULLS LAST
         LIMIT 20`,
        dailyVals
      ),
    ]);

    const mapRows = (rows: Record<string, unknown>[], revKey = "revenue", pairsKey = "pairs") =>
      rows.map((r) => ({
        ...r,
        [revKey]: Number(r[revKey]),
        [pairsKey]: Number(r[pairsKey]),
      }));

    return NextResponse.json({
      kpis,
      timeSeries,
      stores,
      bySeries:    mapRows(seriesRes.rows),
      byGender:    mapRows(genderRes.rows),
      byTier:      mapRows(tierRes.rows),
      topArticles: mapRows(topRes.rows),
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    console.error("dashboard error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
