import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function parseMulti(sp: URLSearchParams, key: string): string[] {
  const val = sp.get(key);
  if (!val) return [];
  return val.split(",").map((v) => v.trim()).filter(Boolean);
}

const EXCLUDE_ARTICLE = (alias: string) => `
  (${alias}.article IS NULL OR (
    ${alias}.article NOT ILIKE '%shopbag%'
    AND ${alias}.article NOT ILIKE '%paperbag%'
    AND ${alias}.article NOT ILIKE '%gwp%'
    AND ${alias}.article NOT ILIKE '%gift%'
    AND ${alias}.article NOT ILIKE '%voucher%'
    AND ${alias}.article NOT ILIKE '%membership%'
    AND ${alias}.article NOT ILIKE '%paper bag%'
    AND ${alias}.article NOT ILIKE '%shopping bag%'
    AND ${alias}.article NOT ILIKE '%hanger%'
    AND ${alias}.kode_besar NOT ILIKE '%shopbag%'
    AND ${alias}.kode_besar NOT ILIKE '%paperbag%'
    AND ${alias}.kode_besar NOT ILIKE '%gwp%'
    AND ${alias}.kode_besar NOT ILIKE '%gift%'
    AND ${alias}.kode_besar NOT ILIKE '%voucher%'
    AND ${alias}.kode_besar NOT ILIKE '%membership%'
    AND ${alias}.kode_besar NOT ILIKE '%hanger%'
    AND ${alias}.kode NOT ILIKE '%shopbag%'
    AND ${alias}.kode NOT ILIKE '%paperbag%'
    AND ${alias}.kode NOT ILIKE '%gwp%'
    AND ${alias}.kode NOT ILIKE '%hanger%'
  ))
`;

function buildBaseFilters(
  sp: URLSearchParams,
  vals: unknown[],
  startIdx: number,
  prefix = ""
): { conds: string[]; nextIdx: number } {
  const conds: string[] = [];
  let i = startIdx;
  const p = prefix ? `${prefix}.` : "";

  const from = sp.get("from");
  const to = sp.get("to");
  if (from) { conds.push(`${p}sale_date >= $${i++}`); vals.push(from); }
  if (to)   { conds.push(`${p}sale_date <= $${i++}`); vals.push(to); }

  const branch = parseMulti(sp, "branch");
  if (branch.length) {
    const phs = branch.map(() => `$${i++}`).join(", ");
    conds.push(`${p}branch IN (${phs})`);
    vals.push(...branch);
  }

  const store = parseMulti(sp, "store");
  if (store.length) {
    const phs = store.map(() => `$${i++}`).join(", ");
    conds.push(`${p}toko IN (${phs})`);
    vals.push(...store);
  }

  return { conds, nextIdx: i };
}

function buildDailyFilters(
  sp: URLSearchParams,
  vals: unknown[],
  startIdx: number,
  prefix = ""
): { conds: string[]; nextIdx: number } {
  const { conds, nextIdx } = buildBaseFilters(sp, vals, startIdx, prefix);
  let i = nextIdx;
  const p = prefix ? `${prefix}.` : "";

  for (const [param, col] of [
    ["series", "series"],
    ["gender", "gender"],
    ["tier",   "tier"],
    ["color",  "color"],
  ] as [string, string][]) {
    const fv = parseMulti(sp, param);
    if (!fv.length) continue;
    const phs = fv.map(() => `$${i++}`).join(", ");
    conds.push(`${p}${col} IN (${phs})`);
    vals.push(...fv);
  }

  conds.push(EXCLUDE_ARTICLE(prefix || "d"));

  return { conds, nextIdx: i };
}

function addTipeFilter(
  sp: URLSearchParams,
  vals: unknown[],
  startIdx: number,
  conds: string[]
): { nextIdx: number; needsJoin: boolean } {
  let i = startIdx;
  const tipe = parseMulti(sp, "tipe");
  if (tipe.length) {
    const phs = tipe.map(() => `$${i++}`).join(", ");
    conds.push(`k.tipe IN (${phs})`);
    vals.push(...tipe);
    return { nextIdx: i, needsJoin: true };
  }
  return { nextIdx: i, needsJoin: false };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const period = sp.get("period") || "daily";

  const periodExpr =
    period === "monthly" ? "DATE_TRUNC('month', d.sale_date)::DATE" :
    period === "weekly"  ? "DATE_TRUNC('week',  d.sale_date)::DATE" :
                           "d.sale_date";

  try {
    const dailyVals: unknown[] = [];
    const { conds: dailyConds, nextIdx: dailyNext } = buildDailyFilters(sp, dailyVals, 1, "d");
    const { needsJoin: dailyNeedsJoin } = addTipeFilter(sp, dailyVals, dailyNext, dailyConds);

    const dailyJoin = dailyNeedsJoin
      ? "JOIN portal.kodemix k ON d.kode_besar = k.kode_besar"
      : "";
    const dailyWhere = dailyConds.length ? `WHERE ${dailyConds.join(" AND ")}` : "";

    const txnVals: unknown[] = [];
    const { conds: txnConds } = buildBaseFilters(sp, txnVals, 1, "t");
    const txnWhere = txnConds.length ? `WHERE ${txnConds.join(" AND ")}` : "";

    const [kpiDaily, kpiTxn, lastUpdateRes] = await Promise.all([
      pool.query(
        `SELECT SUM(d.revenue) AS revenue, SUM(d.pairs) AS pairs
         FROM mart.iseller_daily d ${dailyJoin} ${dailyWhere}`,
        dailyVals
      ),
      pool.query(
        `SELECT COUNT(*) AS transactions FROM mart.iseller_txn t ${txnWhere}`,
        txnVals
      ),
      pool.query(`SELECT MAX(sale_date) AS last_date FROM mart.iseller_daily`),
    ]);

    const revenue = Number(kpiDaily.rows[0].revenue || 0);
    const pairs = Number(kpiDaily.rows[0].pairs || 0);
    const transactions = Number(kpiTxn.rows[0].transactions || 0);
    const lastUpdate = lastUpdateRes.rows[0].last_date
      ? String(lastUpdateRes.rows[0].last_date).substring(0, 10)
      : null;
    const kpis = {
      revenue,
      pairs,
      transactions,
      atu: transactions > 0 ? pairs / transactions : 0,
      asp: pairs > 0 ? revenue / pairs : 0,
      atv: transactions > 0 ? revenue / transactions : 0,
    };

    const tsRes = await pool.query(
      `SELECT ${periodExpr} AS period, SUM(d.revenue) AS revenue, SUM(d.pairs) AS pairs
       FROM mart.iseller_daily d ${dailyJoin} ${dailyWhere}
       GROUP BY 1 ORDER BY 1`,
      dailyVals
    );
    const timeSeries = tsRes.rows.map((r: Record<string, unknown>) => ({
      period: String(r.period).substring(0, 10),
      revenue: Number(r.revenue),
      pairs: Number(r.pairs),
    }));

    const storeVals: unknown[] = [];
    const storeD: string[] = [];
    const storeT: string[] = [];
    let si = 1;

    const from = sp.get("from");
    const to = sp.get("to");
    if (from) { storeD.push(`d.sale_date >= $${si}`); storeT.push(`t.sale_date >= $${si}`); storeVals.push(from); si++; }
    if (to)   { storeD.push(`d.sale_date <= $${si}`); storeT.push(`t.sale_date <= $${si}`); storeVals.push(to);   si++; }

    const branch = parseMulti(sp, "branch");
    if (branch.length) {
      const phs = branch.map(() => `$${si++}`).join(", ");
      storeD.push(`d.branch IN (${phs})`); storeT.push(`t.branch IN (${phs})`);
      storeVals.push(...branch);
    }

    const store = parseMulti(sp, "store");
    if (store.length) {
      const phs = store.map(() => `$${si++}`).join(", ");
      storeD.push(`d.toko IN (${phs})`); storeT.push(`t.toko IN (${phs})`);
      storeVals.push(...store);
    }

    for (const [param, col] of [["series","series"],["gender","gender"],["tier","tier"],["color","color"]] as [string,string][]) {
      const fv = parseMulti(sp, param);
      if (!fv.length) continue;
      const phs = fv.map(() => `$${si++}`).join(", ");
      storeD.push(`d.${col} IN (${phs})`);
      storeVals.push(...fv);
    }

    storeD.push(EXCLUDE_ARTICLE("d"));

    let storeNeedsTipeJoin = false;
    const tipe = parseMulti(sp, "tipe");
    if (tipe.length) {
      const phs = tipe.map(() => `$${si++}`).join(", ");
      storeD.push(`sk.tipe IN (${phs})`);
      storeVals.push(...tipe);
      storeNeedsTipeJoin = true;
    }

    const storeDJoin = storeNeedsTipeJoin
      ? "JOIN portal.kodemix sk ON d.kode_besar = sk.kode_besar"
      : "";
    const storeDWhere = storeD.length ? `WHERE ${storeD.join(" AND ")}` : "";
    const storeTWhere = storeT.length ? `WHERE ${storeT.join(" AND ")}` : "";

    const storeRes = await pool.query(
      `WITH daily_agg AS (
        SELECT d.toko, SUM(d.pairs) AS pairs, SUM(d.revenue) AS revenue, MAX(d.branch) AS branch
        FROM mart.iseller_daily d ${storeDJoin} ${storeDWhere}
        GROUP BY d.toko
      ),
      txn_agg AS (
        SELECT t.toko, COUNT(*) AS transactions
        FROM mart.iseller_txn t ${storeTWhere}
        GROUP BY t.toko
      )
      SELECT a.toko, a.branch, a.pairs, a.revenue,
             COALESCE(x.transactions, 0) AS transactions,
             CASE WHEN COALESCE(x.transactions,0) > 0 THEN a.pairs / x.transactions ELSE 0 END AS atu,
             CASE WHEN a.pairs > 0 THEN a.revenue / a.pairs ELSE 0 END AS asp,
             CASE WHEN COALESCE(x.transactions,0) > 0 THEN a.revenue / x.transactions ELSE 0 END AS atv
      FROM daily_agg a LEFT JOIN txn_agg x ON a.toko = x.toko
      ORDER BY a.revenue DESC`,
      storeVals
    );
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

    const skuJoin = dailyNeedsJoin
      ? "JOIN portal.kodemix k ON d.kode_besar = k.kode_besar"
      : "LEFT JOIN portal.kodemix k ON d.kode_besar = k.kode_besar";

    const [
      branchRes, seriesRes, genderRes, tierRes,
      tipeRes, sizeRes, priceRes, rankRes,
    ] = await Promise.all([
      pool.query(
        `SELECT d.branch, SUM(d.revenue) AS revenue
         FROM mart.iseller_daily d ${dailyJoin} ${dailyWhere}
         GROUP BY d.branch ORDER BY revenue DESC NULLS LAST`,
        dailyVals
      ),
      pool.query(
        `SELECT d.series, SUM(d.pairs) AS pairs
         FROM mart.iseller_daily d ${dailyJoin} ${dailyWhere}
         GROUP BY d.series ORDER BY pairs DESC NULLS LAST`,
        dailyVals
      ),
      pool.query(
        `SELECT d.gender, SUM(d.pairs) AS pairs
         FROM mart.iseller_daily d ${dailyJoin} ${dailyWhere}
         GROUP BY d.gender ORDER BY pairs DESC NULLS LAST`,
        dailyVals
      ),
      pool.query(
        `SELECT d.tier, SUM(d.pairs) AS pairs
         FROM mart.iseller_daily d ${dailyJoin} ${dailyWhere}
         GROUP BY d.tier ORDER BY d.tier ASC NULLS LAST`,
        dailyVals
      ),
      pool.query(
        `SELECT k.tipe, SUM(d.pairs) AS pairs
         FROM mart.iseller_daily d ${skuJoin} ${dailyWhere}
         GROUP BY k.tipe ORDER BY pairs DESC NULLS LAST`,
        dailyVals
      ),
      pool.query(
        `SELECT d.size, SUM(d.pairs) AS pairs
         FROM mart.iseller_daily d ${dailyJoin} ${dailyWhere}
         GROUP BY d.size ORDER BY pairs DESC NULLS LAST`,
        dailyVals
      ),
      pool.query(
        `SELECT
           CASE
             WHEN SUM(d.pairs) > 0 THEN ROUND(SUM(d.revenue) / SUM(d.pairs))
             ELSE 0
           END AS price_bucket,
           SUM(d.pairs) AS pairs
         FROM mart.iseller_daily d ${dailyJoin} ${dailyWhere}
         GROUP BY d.kode
         HAVING SUM(d.pairs) > 0
         ORDER BY price_bucket ASC`,
        dailyVals
      ),
      pool.query(
        `SELECT
           COALESCE(d.article, d.kode_besar) AS article,
           d.kode_mix,
           SUM(d.pairs) AS pairs,
           SUM(d.revenue) AS revenue
         FROM mart.iseller_daily d ${dailyJoin} ${dailyWhere}
         GROUP BY d.article, d.kode_besar, d.kode_mix
         ORDER BY revenue DESC NULLS LAST
         LIMIT 100`,
        dailyVals
      ),
    ]);

    const mapNum = (rows: Record<string, unknown>[], ...keys: string[]) =>
      rows.map((r) => {
        const obj = { ...r };
        for (const k of keys) obj[k] = Number(r[k]);
        return obj;
      });

    const priceBuckets: { label: string; pairs: number }[] = [];
    const bucketRanges = [
      [0, 50000, "0-50K"],
      [50001, 100000, "50-100K"],
      [100001, 150000, "100-150K"],
      [150001, 200000, "150-200K"],
      [200001, 300000, "200-300K"],
      [300001, 500000, "300-500K"],
      [500001, Infinity, "500K+"],
    ] as [number, number, string][];

    for (const [lo, hi, label] of bucketRanges) {
      let sum = 0;
      for (const r of priceRes.rows) {
        const pb = Number(r.price_bucket);
        const p = Number(r.pairs);
        if (pb >= lo && pb <= hi) sum += p;
      }
      if (sum > 0) priceBuckets.push({ label, pairs: sum });
    }

    return NextResponse.json({
      kpis,
      lastUpdate,
      timeSeries,
      stores,
      byBranch:    mapNum(branchRes.rows, "revenue"),
      bySeries:    mapNum(seriesRes.rows, "pairs"),
      byGender:    mapNum(genderRes.rows, "pairs"),
      byTier:      mapNum(tierRes.rows, "pairs"),
      byTipe:      mapNum(tipeRes.rows, "pairs"),
      bySize:      mapNum(sizeRes.rows, "pairs"),
      byPrice:     priceBuckets,
      rankByArticle: mapNum(rankRes.rows, "pairs", "revenue"),
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    console.error("dashboard error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
