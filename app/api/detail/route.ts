import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function parseMulti(sp: URLSearchParams, key: string): string[] {
  const val = sp.get(key);
  if (!val) return [];
  return val.split(",").map((v) => v.trim()).filter(Boolean);
}

const ALLOWED_SORT_KODE = new Set(["kode", "article", "series", "gender", "tier", "pairs", "revenue", "avg_price"]);
const ALLOWED_SORT_KB = new Set(["kode_besar", "kode", "article", "size", "color", "tier", "pairs", "revenue", "avg_price"]);

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

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") === "kode_besar" ? "kode_besar" : "kode";
  const isExport = sp.get("export") === "all";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") || "50", 10)));
  const offset = (page - 1) * limit;

  const allowedSort = mode === "kode_besar" ? ALLOWED_SORT_KB : ALLOWED_SORT_KODE;
  const sortRaw = sp.get("sort") || "revenue";
  const sort = allowedSort.has(sortRaw) ? sortRaw : "revenue";
  const dir = sp.get("dir") === "asc" ? "ASC" : "DESC";

  try {
    const vals: unknown[] = [];
    const conds: string[] = [];
    let i = 1;
    let needsTipeJoin = false;

    const from = sp.get("from");
    const to = sp.get("to");
    if (from) { conds.push(`d.sale_date >= $${i++}`); vals.push(from); }
    if (to)   { conds.push(`d.sale_date <= $${i++}`); vals.push(to); }

    for (const [param, col] of [
      ["branch",  "d.branch"],
      ["store",   "d.toko"],
      ["series",  "d.series"],
      ["gender",  "d.gender"],
      ["tier",    "d.tier"],
      ["color",   "d.color"],
    ] as [string, string][]) {
      const fv = parseMulti(sp, param);
      if (!fv.length) continue;
      const phs = fv.map(() => `$${i++}`).join(", ");
      conds.push(`${col} IN (${phs})`);
      vals.push(...fv);
    }

    const tipe = parseMulti(sp, "tipe");
    if (tipe.length) {
      const phs = tipe.map(() => `$${i++}`).join(", ");
      conds.push(`k.tipe IN (${phs})`);
      vals.push(...tipe);
      needsTipeJoin = true;
    }

    const q = sp.get("q");
    if (q) {
      if (mode === "kode_besar") {
        conds.push(`(d.kode_besar ILIKE $${i} OR d.article ILIKE $${i})`);
      } else {
        conds.push(`(d.kode ILIKE $${i} OR d.article ILIKE $${i})`);
      }
      vals.push(`%${q}%`);
      i++;
    }

    conds.push(EXCLUDE_ARTICLE("d"));

    const join = needsTipeJoin
      ? "JOIN portal.kodemix k ON d.kode_besar = k.kode_besar"
      : "";
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    let groupBy: string;
    let selectCols: string;
    if (mode === "kode_besar") {
      groupBy = "d.kode_besar, d.kode, d.article, d.size, d.color, d.tier";
      selectCols = "d.kode_besar, d.kode, d.article, d.size, d.color, d.tier";
    } else {
      groupBy = "d.kode, d.article, d.series, d.gender, d.tier";
      selectCols = "d.kode, d.article, d.series, d.gender, d.tier";
    }

    if (isExport) {
      const dataSql = `
        SELECT ${selectCols},
               SUM(d.pairs) AS pairs,
               SUM(d.revenue) AS revenue,
               CASE WHEN SUM(d.pairs) > 0 THEN SUM(d.revenue) / SUM(d.pairs) ELSE 0 END AS avg_price
        FROM mart.iseller_daily d ${join}
        ${where}
        GROUP BY ${groupBy}
        ORDER BY ${sort === "pairs" || sort === "revenue" || sort === "avg_price" ? sort : `d.${sort}`} ${dir} NULLS LAST
      `;
      const dataRes = await pool.query(dataSql, vals);
      const rows = dataRes.rows.map((r: Record<string, unknown>) => ({
        ...r,
        pairs: Number(r.pairs),
        revenue: Number(r.revenue),
        avg_price: Number(r.avg_price),
      }));

      return NextResponse.json({ rows }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const countSql = `
      SELECT COUNT(*) AS total FROM (
        SELECT ${groupBy}
        FROM mart.iseller_daily d ${join}
        ${where}
        GROUP BY ${groupBy}
      ) sub
    `;
    const dataSql = `
      SELECT ${selectCols},
             SUM(d.pairs) AS pairs,
             SUM(d.revenue) AS revenue,
             CASE WHEN SUM(d.pairs) > 0 THEN SUM(d.revenue) / SUM(d.pairs) ELSE 0 END AS avg_price
      FROM mart.iseller_daily d ${join}
      ${where}
      GROUP BY ${groupBy}
      ORDER BY ${sort === "pairs" || sort === "revenue" || sort === "avg_price" ? sort : `d.${sort}`} ${dir} NULLS LAST
      LIMIT $${i} OFFSET $${i + 1}
    `;

    const [countRes, dataRes] = await Promise.all([
      pool.query(countSql, vals),
      pool.query(dataSql, [...vals, limit, offset]),
    ]);

    const total = Number(countRes.rows[0].total);
    const rows = dataRes.rows.map((r: Record<string, unknown>) => ({
      ...r,
      pairs: Number(r.pairs),
      revenue: Number(r.revenue),
      avg_price: Number(r.avg_price),
    }));

    return NextResponse.json({
      rows,
      total,
      page,
      pages: Math.ceil(total / limit),
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    console.error("detail error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
