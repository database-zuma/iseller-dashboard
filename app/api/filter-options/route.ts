import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function parseMulti(sp: URLSearchParams, key: string): string[] {
  const val = sp.get(key);
  if (!val) return [];
  return val.split(",").map((v) => v.trim()).filter(Boolean);
}

function buildWhereClause(
  sp: URLSearchParams,
  skipParam: string,
  vals: unknown[],
  startIdx: number
): { conds: string[]; nextIdx: number } {
  const conds: string[] = [];
  let i = startIdx;

  const from = sp.get("from");
  const to = sp.get("to");
  if (from) { conds.push(`sale_date >= $${i++}`); vals.push(from); }
  if (to)   { conds.push(`sale_date <= $${i++}`); vals.push(to); }

  for (const [param, col] of [
    ["branch", "branch"],
    ["store",  "toko"],
    ["series", "series"],
    ["gender", "gender"],
    ["tier",   "tier"],
    ["payment","payment_type"],
  ] as [string, string][]) {
    if (param === skipParam) continue;
    const fv = parseMulti(sp, param);
    if (fv.length === 0) continue;
    const phs = fv.map(() => `$${i++}`).join(", ");
    conds.push(`${col} IN (${phs})`);
    vals.push(...fv);
  }

  return { conds, nextIdx: i };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  try {
    const dims = [
      { key: "branches",     col: "branch",       param: "branch",  nullFilter: "branch IS NOT NULL AND branch != ''" },
      { key: "stores",       col: "toko",         param: "store",   nullFilter: "toko IS NOT NULL AND toko != ''" },
      { key: "series",       col: "series",       param: "series",  nullFilter: "series IS NOT NULL AND series != ''" },
      { key: "genders",      col: "gender",       param: "gender",  nullFilter: "gender IS NOT NULL AND gender != ''" },
      { key: "tiers",        col: "tier",         param: "tier",    nullFilter: "tier IS NOT NULL AND tier != ''" },
      { key: "paymentTypes", col: "payment_type", param: "payment", nullFilter: "payment_type IS NOT NULL AND payment_type != ''" },
    ] as const;

    const results = await Promise.all(
      dims.map(async (dim) => {
        const vals: unknown[] = [];
        const { conds } = buildWhereClause(sp, dim.param, vals, 1);
        conds.push(dim.nullFilter);

        const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
        const sql = `SELECT DISTINCT ${dim.col} AS val FROM mart.iseller_daily ${where} ORDER BY val`;
        const res = await pool.query(sql, vals);
        return { key: dim.key, values: res.rows.map((r: Record<string, unknown>) => r.val).filter(Boolean) };
      })
    );

    const body: Record<string, unknown[]> = {};
    for (const r of results) body[r.key] = r.values;

    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (e) {
    console.error("filter-options error:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
