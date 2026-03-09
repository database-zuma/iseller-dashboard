import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { clearAllCache } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // refresh can take a while

/**
 * GET /api/refresh?check=1  → staleness check only (fast)
 * POST /api/refresh          → execute full mart + MV refresh
 */

export async function GET() {
  try {
    const [rawRes, martRes] = await Promise.all([
      pool.query(`SELECT MAX(tanggal_pesanan::date)::text AS latest FROM raw.iseller_2026`),
      pool.query(`SELECT MAX(sale_date)::text AS latest FROM mart.mv_iseller_summary`),
    ]);

    const rawLatest = rawRes.rows[0]?.latest ?? null;
    const martLatest = martRes.rows[0]?.latest ?? null;
    const isStale = rawLatest && martLatest && rawLatest > martLatest;

    return NextResponse.json({
      rawLatest,
      martLatest,
      isStale,
    });
  } catch (e) {
    console.error("refresh check error:", e);
    return NextResponse.json({ error: "Failed to check freshness" }, { status: 500 });
  }
}

export async function POST() {
  const started = Date.now();

  try {
    // Step 1: Check if refresh is actually needed
    const [rawRes, martRes] = await Promise.all([
      pool.query(`SELECT MAX(tanggal_pesanan::date)::text AS latest FROM raw.iseller_2026`),
      pool.query(`SELECT MAX(sale_date)::text AS latest FROM mart.mv_iseller_summary`),
    ]);

    const rawLatest = rawRes.rows[0]?.latest ?? null;
    const martLatest = martRes.rows[0]?.latest ?? null;

    if (!rawLatest) {
      return NextResponse.json({ error: "No raw data found" }, { status: 400 });
    }

    const wasStale = rawLatest > (martLatest ?? "");

    // Step 2: Refresh mart tables (truncate + re-insert from raw)
    await pool.query(`SELECT mart.refresh_iseller_marts()`);

    // Step 3: Refresh materialized views (only the ones openclaw_app owns)
    await pool.query(`REFRESH MATERIALIZED VIEW mart.mv_iseller_summary`);
    await pool.query(`REFRESH MATERIALIZED VIEW mart.mv_iseller_txn_agg`);
    // Note: mart.mv_iseller_promo is owned by postgres — cannot refresh from here

    // Step 4: Clear in-memory cache so next dashboard request gets fresh data
    clearAllCache();

    // Step 5: Get the new mart latest date to confirm
    const newMartRes = await pool.query(
      `SELECT MAX(sale_date)::text AS latest FROM mart.mv_iseller_summary`
    );
    const newMartLatest = newMartRes.rows[0]?.latest ?? null;

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    return NextResponse.json({
      success: true,
      wasStale,
      rawLatest,
      previousMartLatest: martLatest,
      newMartLatest,
      elapsedSeconds: elapsed,
    });
  } catch (e) {
    console.error("refresh error:", e);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    return NextResponse.json(
      { error: "Refresh failed", detail: String(e), elapsedSeconds: elapsed },
      { status: 500 }
    );
  }
}
