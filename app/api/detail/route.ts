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

// Exclude non-product items like shopbag, paperbag, GWP, etc.
const EXCLUDE_ARTICLE_CONDITION = `
  (article IS NULL OR (
    article NOT ILIKE '%shopbag%' 
    AND article NOT ILIKE '%paperbag%'
    AND article NOT ILIKE '%gwp%'
    AND article NOT ILIKE '%gift%'
    AND article NOT ILIKE '%voucher%'
    AND article NOT ILIKE '%membership%'
    AND article NOT ILIKE '%paper bag%'
    AND article NOT ILIKE '%shopping bag%'
    AND kode_besar NOT ILIKE '%shopbag%'
    AND kode_besar NOT ILIKE '%paperbag%'
    AND kode_besar NOT ILIKE '%gwp%'
    AND kode_besar NOT ILIKE '%gift%'
    AND kode_besar NOT ILIKE '%voucher%'
    AND kode_besar NOT ILIKE '%membership%'
    AND kode NOT ILIKE '%shopbag%'
    AND kode NOT ILIKE '%paperbag%'
    AND kode NOT ILIKE '%gwp%'
  ))
`;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") === "kode_besar" ? "kode_besar" : "kode";
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

    const from = sp.get("from");
    const to = sp.get("to");
    if (from) { conds.push(`sale_date >= $${i++}`); vals.push(from); }
    if (to)   { conds.push(`sale_date <= $${i++}`); vals.push(to); }

    for (const [param, col] of [
      ["branch",  "branch"],
      ["store",   "toko"],
      ["series",  "series"],
      ["gender",  "gender"],
      ["tier",    "tier"],
      ["payment", "payment_type"],
    ] as [string, string][]) {
      const fv = parseMulti(sp, param);
      if (!fv.length) continue;
      const phs = fv.map(() => `$${i++}`).join(", ");
      conds.push(`${col} IN (${phs})`);
      vals.push(...fv);
    }

    const q = sp.get("q");
    if (q) {
      if (mode === "kode_besar") {
        conds.push(`(kode_besar ILIKE $${i} OR article ILIKE $${i})`);
      } else {
        conds.push(`(kode ILIKE $${i} OR article ILIKE $${i})`);
      }
      vals.push(`%${q}%`);
      i++;
    }

    // Add exclusion for non-product items
    conds.push(EXCLUDE_ARTICLE_CONDITION);

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    let groupBy: string;
    let selectCols: string;
    if (mode === "kode_besar") {
      groupBy = "kode_besar, kode, article, size, color, tier";
      selectCols = "kode_besar, kode, article, size, color, tier";
    } else {
      groupBy = "kode, article, series, gender, tier";
      selectCols = "kode, article, series, gender, tier";
    }

    const countSql = `
      SELECT COUNT(*) AS total FROM (
        SELECT ${groupBy}
        FROM mart.iseller_daily
        ${where}
        GROUP BY ${groupBy}
      ) sub
    `;
    const dataSql = `
      SELECT ${selectCols},
             SUM(pairs)   AS pairs,
             SUM(revenue) AS revenue,
             CASE WHEN SUM(pairs) > 0 THEN SUM(revenue) / SUM(pairs) ELSE 0 END AS avg_price
      FROM mart.iseller_daily
      ${where}
      GROUP BY ${groupBy}
      ORDER BY ${sort} ${dir} NULLS LAST
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
