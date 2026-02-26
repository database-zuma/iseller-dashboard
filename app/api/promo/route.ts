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

  /* ───── grab a SINGLE connection to avoid pool exhaustion ───── */
  const client = await pool.connect();

  try {
    /* ───── shared filter building ───── */
    const vals: unknown[] = [];
    const conds: string[] = [];
    let i = 1;

    const from = sp.get("from");
    const to = sp.get("to");
    if (from) { conds.push(`p.sale_date >= $${i++}`); vals.push(from); }
    if (to)   { conds.push(`p.sale_date <= $${i++}`); vals.push(to); }

    const branch = parseMulti(sp, "branch");
    if (branch.length) {
      const phs = branch.map(() => `$${i++}`).join(", ");
      conds.push(`p.branch IN (${phs})`);
      vals.push(...branch);
    }

    const store = parseMulti(sp, "store");
    if (store.length) {
      const phs = store.map(() => `$${i++}`).join(", ");
      conds.push(`p.toko IN (${phs})`);
      vals.push(...store);
    }

    const campaign = parseMulti(sp, "campaign");
    if (campaign.length) {
      const phs = campaign.map(() => `$${i++}`).join(", ");
      conds.push(`p.campaign_code IN (${phs})`);
      vals.push(...campaign);
    }

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    /* ───── Mode B: overall filters (no campaign filter — we want ALL struks) ───── */
    const mvVals: unknown[] = [];
    const mvConds: string[] = [];
    let mi = 1;
    if (from) { mvConds.push(`d.sale_date >= $${mi++}`); mvVals.push(from); }
    if (to)   { mvConds.push(`d.sale_date <= $${mi++}`); mvVals.push(to); }
    if (branch.length) {
      const phs = branch.map(() => `$${mi++}`).join(", ");
      mvConds.push(`d.branch IN (${phs})`);
      mvVals.push(...branch);
    }
    if (store.length) {
      const phs = store.map(() => `$${mi++}`).join(", ");
      mvConds.push(`d.toko IN (${phs})`);
      mvVals.push(...store);
    }
    const mvWhere = mvConds.length ? `WHERE ${mvConds.join(" AND ")}` : "";

    const txnVals: unknown[] = [];
    const txnConds: string[] = [];
    let ti = 1;
    if (from) { txnConds.push(`t.sale_date >= $${ti++}`); txnVals.push(from); }
    if (to)   { txnConds.push(`t.sale_date <= $${ti++}`); txnVals.push(to); }
    if (branch.length) {
      const phs = branch.map(() => `$${ti++}`).join(", ");
      txnConds.push(`t.branch IN (${phs})`);
      txnVals.push(...branch);
    }
    if (store.length) {
      const phs = store.map(() => `$${ti++}`).join(", ");
      txnConds.push(`t.toko IN (${phs})`);
      txnVals.push(...store);
    }
    const txnWhere = txnConds.length ? `WHERE ${txnConds.join(" AND ")}` : "";

    /* ───── SPG where clause ───── */
    const spgWhere = conds.length
      ? `WHERE ${conds.join(" AND ")} AND p.spg != 'Unknown'`
      : "WHERE p.spg != 'Unknown'";

    /* ═══════ Mode A queries (promo MV) ═══════ */

    const kpiRes = await client.query(
      `SELECT SUM(p.qty_all) AS qty_all,
              SUM(p.qty_promo) AS qty_promo,
              SUM(p.revenue) AS revenue,
              SUM(p.discount_total) AS discount_total,
              SUM(p.txn_count) AS txn_count
       FROM mart.mv_iseller_promo p ${where}`,
      vals
    );

    const timeSeriesRes = await client.query(
      `SELECT p.sale_date AS period,
              SUM(p.qty_all) AS qty_all,
              SUM(p.qty_promo) AS qty_promo,
              SUM(p.revenue) AS revenue,
              SUM(p.discount_total) AS discount_total,
              SUM(p.txn_count) AS txn_count
       FROM mart.mv_iseller_promo p ${where}
       GROUP BY p.sale_date ORDER BY p.sale_date`,
      vals
    );

    const byCampaignRes = await client.query(
      `SELECT p.campaign_code,
              SUM(p.qty_all) AS qty_all,
              SUM(p.qty_promo) AS qty_promo,
              SUM(p.revenue) AS revenue,
              SUM(p.discount_total) AS discount_total,
              SUM(p.txn_count) AS txn_count
       FROM mart.mv_iseller_promo p ${where}
       GROUP BY p.campaign_code ORDER BY revenue DESC`,
      vals
    );

    const storeRes = await client.query(
      `SELECT p.toko, p.branch,
              SUM(p.qty_all) AS qty_all,
              SUM(p.qty_promo) AS qty_promo,
              SUM(p.revenue) AS revenue,
              SUM(p.discount_total) AS discount_total,
              SUM(p.txn_count) AS txn_count
       FROM mart.mv_iseller_promo p ${where}
       GROUP BY p.toko, p.branch ORDER BY revenue DESC`,
      vals
    );

    const spgRes = await client.query(
      `SELECT p.spg,
              SUM(p.qty_promo) AS qty_promo,
              SUM(p.qty_all) AS qty_all,
              SUM(p.revenue) AS revenue,
              SUM(p.txn_count) AS txn_count
       FROM mart.mv_iseller_promo p ${spgWhere}
       GROUP BY p.spg ORDER BY qty_promo DESC
       LIMIT 50`,
      vals
    );

    const campaignOptionsRes = await client.query(
      `SELECT pc.campaign_code, pc.campaign_name
       FROM portal.promo_campaign pc
       WHERE EXISTS (SELECT 1 FROM mart.mv_iseller_promo m WHERE m.campaign_code = pc.campaign_code)
       ORDER BY pc.campaign_name`
    );

    /* ═══════ Mode B queries (overall from summary + txn_agg) ═══════ */

    const overallPairsRes = await client.query(
      `SELECT SUM(d.pairs) AS pairs, SUM(d.revenue) AS revenue
       FROM mart.mv_iseller_summary d ${mvWhere}`,
      mvVals
    );

    const overallTxnRes = await client.query(
      `SELECT SUM(t.txn_count) AS txn_count
       FROM mart.mv_iseller_txn_agg t ${txnWhere}`,
      txnVals
    );

    /* Mode B time series: daily pairs + revenue */
    const overallTsByDayRes = await client.query(
      `SELECT d.sale_date AS period, SUM(d.pairs) AS pairs, SUM(d.revenue) AS revenue
       FROM mart.mv_iseller_summary d ${mvWhere}
       GROUP BY d.sale_date ORDER BY d.sale_date`,
      mvVals
    );

    /* Mode B time series: daily txn count */
    const overallTsTxnRes = await client.query(
      `SELECT t.sale_date AS period, SUM(t.txn_count) AS txn_count
       FROM mart.mv_iseller_txn_agg t ${txnWhere}
       GROUP BY t.sale_date ORDER BY t.sale_date`,
      txnVals
    );

    /* Mode B stores: store pairs + revenue */
    const overallStoreRes = await client.query(
      `SELECT d.toko, d.branch, SUM(d.pairs) AS pairs, SUM(d.revenue) AS revenue
       FROM mart.mv_iseller_summary d ${mvWhere}
       GROUP BY d.toko, d.branch ORDER BY revenue DESC`,
      mvVals
    );

    /* Mode B stores: store txn count */
    const overallStoreTxnRes = await client.query(
      `SELECT t.toko, t.branch, SUM(t.txn_count) AS txn_count
       FROM mart.mv_iseller_txn_agg t ${txnWhere}
       GROUP BY t.toko, t.branch`,
      txnVals
    );

    /* ═══════ Build KPIs ═══════ */

    const k = kpiRes.rows[0] ?? {};
    const qtyAll = Number(k.qty_all || 0);
    const qtyPromo = Number(k.qty_promo || 0);
    const revenue = Number(k.revenue || 0);
    const discountTotal = Number(k.discount_total || 0);
    const txnCount = Number(k.txn_count || 0);

    const promoKpis = {
      qtyAll,
      qtyPromo,
      revenue,
      discountTotal,
      txnCount,
      promoShare: qtyAll > 0 ? qtyPromo / qtyAll : 0,
      atu: txnCount > 0 ? qtyAll / txnCount : 0,
      asp: qtyAll > 0 ? revenue / qtyAll : 0,
      atv: txnCount > 0 ? revenue / txnCount : 0,
    };

    const ovP = overallPairsRes.rows[0] ?? {};
    const ovT = overallTxnRes.rows[0] ?? {};
    const overallPairs = Number(ovP.pairs || 0);
    const overallRevenue = Number(ovP.revenue || 0);
    const overallTxn = Number(ovT.txn_count || 0);

    const overallKpis = {
      pairs: overallPairs,
      revenue: overallRevenue,
      txnCount: overallTxn,
      atu: overallTxn > 0 ? overallPairs / overallTxn : 0,
      asp: overallPairs > 0 ? overallRevenue / overallPairs : 0,
      atv: overallTxn > 0 ? overallRevenue / overallTxn : 0,
    };

    /* ═══════ Merge Mode B time series (join summary + txn by date) ═══════ */

    const txnByDate = new Map<string, number>();
    for (const r of overallTsTxnRes.rows) {
      txnByDate.set(String(r.period).substring(0, 10), Number(r.txn_count));
    }

    const overallTimeSeries = overallTsByDayRes.rows.map((r: Record<string, unknown>) => {
      const period = String(r.period).substring(0, 10);
      return {
        period,
        pairs: Number(r.pairs),
        revenue: Number(r.revenue),
        txnCount: txnByDate.get(period) ?? 0,
      };
    });

    /* ═══════ Merge Mode B stores (join summary + txn by store) ═══════ */

    const txnByStore = new Map<string, number>();
    for (const r of overallStoreTxnRes.rows) {
      txnByStore.set(String(r.toko), Number(r.txn_count));
    }

    const overallStores = overallStoreRes.rows.map((r: Record<string, unknown>) => ({
      toko: r.toko,
      branch: r.branch,
      pairs: Number(r.pairs),
      revenue: Number(r.revenue),
      txnCount: txnByStore.get(String(r.toko)) ?? 0,
    }));

    /* ═══════ Response ═══════ */
    const body = {
      promoKpis,
      overallKpis,
      timeSeries: timeSeriesRes.rows.map((r: Record<string, unknown>) => ({
        period: String(r.period).substring(0, 10),
        qtyAll: Number(r.qty_all),
        qtyPromo: Number(r.qty_promo),
        revenue: Number(r.revenue),
        discountTotal: Number(r.discount_total),
        txnCount: Number(r.txn_count),
      })),
      overallTimeSeries,
      byCampaign: byCampaignRes.rows.map((r: Record<string, unknown>) => ({
        campaign: String(r.campaign_code),
        qtyAll: Number(r.qty_all),
        qtyPromo: Number(r.qty_promo),
        revenue: Number(r.revenue),
        discountTotal: Number(r.discount_total),
        txnCount: Number(r.txn_count),
      })),
      stores: storeRes.rows.map((r: Record<string, unknown>) => ({
        toko: r.toko,
        branch: r.branch,
        qtyAll: Number(r.qty_all),
        qtyPromo: Number(r.qty_promo),
        revenue: Number(r.revenue),
        discountTotal: Number(r.discount_total),
        txnCount: Number(r.txn_count),
      })),
      overallStores,
      spgLeaderboard: spgRes.rows.map((r: Record<string, unknown>) => ({
        spg: r.spg,
        qtyPromo: Number(r.qty_promo),
        qtyAll: Number(r.qty_all),
        revenue: Number(r.revenue),
        txnCount: Number(r.txn_count),
      })),
      campaignOptions: campaignOptionsRes.rows.map((r: Record<string, unknown>) => ({
        code: r.campaign_code,
        name: r.campaign_name,
      })),
    };

    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    console.error("promo error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  } finally {
    client.release();
  }
}
