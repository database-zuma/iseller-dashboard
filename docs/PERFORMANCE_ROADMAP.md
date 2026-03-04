# iSeller Metis Dashboard — Performance Optimization Roadmap

> **Created:** 2026-03-04
> **Status:** Planning (explore phase complete, implementation pending)
> **Scope:** API routes, DB layer, frontend data fetching, bundle size

---

## Executive Summary

Performance exploration identified **14 optimization opportunities** across 4 layers:
backend API routes, PostgreSQL database, frontend SWR/rendering, and bundle size.

The single biggest bottleneck is `/api/promo` running **13 sequential queries** on a single
DB connection — parallelizing this alone could yield a 10-20x speed improvement on the
Promo Monitor tab. The second critical issue is a connection pool capped at **3 connections**
while dashboard routes fire up to 12 parallel queries simultaneously.

### Current State (Measured)

| Metric | Value | Issue |
|--------|-------|-------|
| DB pool `max` | 3 | Pool exhaustion under concurrent requests |
| `/api/promo` queries | 13 sequential | ~13x slower than parallel |
| `/api/dashboard` queries | 12 parallel | Good pattern, but starves pool |
| `portal.promo_campaign` seq scans | 5,031,131 | Missing indexes |
| `mv_iseller_summary` seq tuple reads | 1.3 billion | Heavy full-table scans |
| `xlsx` bundle impact | ~150 KB | Loaded eagerly for export-only feature |
| `DetailTable` SWR dedup | 0 ms | Refetches on every filter change |

---

## Architecture Overview

```
Browser (SWR)
  |
  ├── /api/dashboard     → 12 parallel queries → mart.mv_iseller_summary
  │                                             → mart.mv_iseller_txn_agg
  ├── /api/filter-options → 8 parallel queries  → mart.mv_iseller_summary
  ├── /api/promo         → 13 SEQUENTIAL queries → mart.mv_iseller_promo
  │                                               → mart.mv_iseller_summary
  │                                               → mart.mv_iseller_txn_agg
  │                                               → portal.promo_campaign
  ├── /api/hourly        → 4 parallel queries   → mart.iseller_hourly
  ├── /api/detail        → 2 parallel queries   → mart.mv_iseller_summary
  └── /api/achievement   → 2 parallel queries   → mart.mv_iseller_summary
                                                 → portal.store_monthly_target
All routes → lib/db.ts (Pool max=3) → PostgreSQL 76.13.194.120
             lib/cache.ts (in-memory, 5min TTL)
```

---

## P0 — Critical (Largest Impact)

### OPT-01: Parallelize `/api/promo` Queries

**File:** `app/api/promo/route.ts`
**Current:** 13 queries executed sequentially via `await client.query()` on a single
`pool.connect()` connection.
**Target:** Group independent queries into `Promise.all()` using `pool.query()` (auto
checkout/return).

```
Current flow:
  pool.connect() → q1 → q2 → q3 → ... → q13 → client.release()
  Total: sum of all 13 query times (~1-3s)

Target flow:
  Promise.all([
    pool.query(q1),   // promo KPIs
    pool.query(q2),   // promo time series
    pool.query(q3),   // by campaign
    pool.query(q4),   // by store
    pool.query(q5),   // SPG leaderboard
    pool.query(q6),   // campaign options
    pool.query(q7),   // overall pairs
    pool.query(q8),   // overall txn
    pool.query(q9),   // overall time series (pairs)
    pool.query(q10),  // overall time series (txn)
    pool.query(q11),  // overall stores (pairs)
    pool.query(q12),  // overall stores (txn)
  ])
  Total: max of slowest single query (~100-300ms)
```

**Risk:** Low — all 13 queries are independent reads, no transaction needed.
**Impact:** ~10-20x faster Promo Monitor tab.

---

### OPT-02: Increase DB Connection Pool

**File:** `lib/db.ts`
**Current:**
```typescript
const pool = new Pool({
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});
```

**Target:**
```typescript
const pool = new Pool({
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  query_timeout: 15000,
  maxUses: 7500,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});
```

**Why max=20:** `/api/dashboard` (12 queries) + `/api/filter-options` (8 queries) fire
simultaneously on page load = 20 concurrent connections needed. Current max=3 causes
queueing and potential timeouts.

**Risk:** Low — PostgreSQL default `max_connections` is 100; 20 per instance is safe.
**Impact:** Eliminates connection pool exhaustion under normal load.

---

### OPT-03: Add Indexes on `portal.promo_campaign`

**Current:** 5,031,131 sequential scans reading 100M+ tuples. Only 20 index scans.

**Queries hitting this table:**
```sql
-- From /api/promo query 6
SELECT pc.campaign_code, pc.campaign_name
FROM portal.promo_campaign pc
WHERE EXISTS (
  SELECT 1 FROM mart.mv_iseller_promo m
  WHERE m.campaign_code = pc.campaign_code
)
ORDER BY pc.campaign_name
```

**Target indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_promo_campaign_code
  ON portal.promo_campaign (campaign_code);

CREATE INDEX IF NOT EXISTS idx_promo_campaign_name
  ON portal.promo_campaign (campaign_name);
```

**Risk:** Low — read-only indexes on reference table.
**Impact:** Drops 5M+ seq scans to index scans.

---

## P1 — High Priority (Quick Wins)

### OPT-04: Add `dedupingInterval` to DetailTable SWR

**File:** `components/DetailTable.tsx`
**Current:** No `dedupingInterval` — every filter change triggers a new API call.
**Target:** Add `dedupingInterval: 60000` to match other components.

```typescript
const { data, isLoading } = useSWR<DetailResponse>(
  url,
  fetcher,
  {
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 60000,  // ADD THIS
  }
);
```

**Risk:** None.
**Impact:** Prevents redundant DB hits when filters haven't changed.

---

### OPT-05: Add App-Level Caching to `/api/promo`

**File:** `app/api/promo/route.ts`
**Current:** HTTP-only caching (`s-maxage=300`). No `getCached`/`setCache`.
**Target:** Add `getCached`/`setCache` with filter-based cache key (same pattern as
`/api/dashboard` and `/api/achievement`).

```typescript
const cacheKey = `promo:${sp.toString()}`;
const cached = getCached(cacheKey);
if (cached) return NextResponse.json(cached);

// ... run queries ...

setCache(cacheKey, result);
return NextResponse.json(result);
```

**Risk:** Low — same pattern used successfully in `/api/dashboard`.
**Impact:** Repeated requests with same filters served from memory (~0ms vs ~1-3s).

---

### OPT-06: Memoize `StoreTable` Totals

**File:** `components/StoreTable.tsx`
**Current:** `reduce()` for totals runs on every render (not wrapped in `useMemo`).

```typescript
// CURRENT — runs every render
const totQty = stores.reduce((s, r) => s + r.pairs, 0);
const totRev = stores.reduce((s, r) => s + r.revenue, 0);
const totTxn = stores.reduce((s, r) => s + r.transactions, 0);
```

**Target:**
```typescript
const { totQty, totRev, totTxn, avgAtu, avgAsp, avgAtv } = useMemo(() => {
  const totQty = stores.reduce((s, r) => s + r.pairs, 0);
  const totRev = stores.reduce((s, r) => s + r.revenue, 0);
  const totTxn = stores.reduce((s, r) => s + r.transactions, 0);
  return {
    totQty, totRev, totTxn,
    avgAtu: totTxn > 0 ? totQty / totTxn : 0,
    avgAsp: totQty > 0 ? totRev / totQty : 0,
    avgAtv: totTxn > 0 ? totRev / totTxn : 0,
  };
}, [stores]);
```

**Risk:** None.
**Impact:** Eliminates unnecessary O(n) computation on re-renders.

---

### OPT-07: Dynamic Import `xlsx`

**Files:** `components/StoreTable.tsx`, `components/DetailTable.tsx`,
`components/SkuCharts.tsx`, `components/PromoTab.tsx`,
`components/StoreAchievement.tsx`
**Current:** `xlsx` (~150 KB) imported statically — loaded on initial page load even
though export is a rare user action.

```typescript
// CURRENT
import * as XLSX from "xlsx";
```

**Target:** Dynamic import on export button click.
```typescript
// TARGET
const handleExport = async () => {
  const XLSX = await import("xlsx");
  // ... export logic ...
};
```

Or if using a shared `lib/export.ts`:
```typescript
export async function downloadXLSX(data: any[], filename: string) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename);
}
```

**Risk:** Low — export still works, just loads on demand.
**Impact:** ~150 KB removed from initial bundle.

---

## P2 — Medium Priority

### OPT-08: Add Error Handling to Fetcher

**File:** `lib/fetcher.ts`
**Current:**
```typescript
export const fetcher = (url: string) => fetch(url).then((r) => r.json());
```

**Target:**
```typescript
export const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error(`API error: ${res.status} ${res.statusText}`);
    (error as any).status = res.status;
    throw error;
  }
  return res.json();
};
```

**Risk:** None — SWR catches thrown errors and exposes via `error` return value.
**Impact:** Failed API calls no longer silently return undefined.

---

### OPT-09: Add Cache-Control to `/api/detail`

**File:** `app/api/detail/route.ts`
**Current:** HTTP cache headers set to `s-maxage=300`, but no app-level caching.
**Target:** Add `getCached`/`setCache` for app-level caching.

**Risk:** Low.
**Impact:** Repeat detail queries with same filters served from memory.

---

### OPT-10: Merge Promo Time Series Queries

**File:** `app/api/promo/route.ts`
**Current:** Separate time series queries for `mv_iseller_summary` (pairs/revenue)
and `mv_iseller_txn_agg` (transactions), plus separate store-level queries.

**Target:** Combine the paired queries using LEFT JOIN:
```sql
-- Instead of 2 separate queries:
SELECT d.sale_date, SUM(d.pairs), SUM(d.revenue) FROM mv_iseller_summary d ...
SELECT t.sale_date, SUM(t.txn_count)             FROM mv_iseller_txn_agg t ...

-- Use 1 joined query:
SELECT d.sale_date,
       SUM(d.pairs), SUM(d.revenue),
       COALESCE(SUM(t.txn_count), 0) AS txn_count
FROM mv_iseller_summary d
LEFT JOIN mv_iseller_txn_agg t ON d.sale_date = t.sale_date AND d.toko = t.toko
WHERE ...
GROUP BY d.sale_date
```

**Risk:** Medium — JOIN correctness must be verified (cardinality differences).
**Impact:** Reduces query count from 13 to ~10.

---

## P3 — Low Priority (Nice to Have)

### OPT-11: Move HourlyGraph Aggregation to Backend

**File:** `components/HourlyGraph.tsx` + `app/api/hourly/route.ts`
**Current:** Backend returns raw hourly data; client computes day-of-week summaries,
hourly averages, and heatmap data with O(24n) loops.
**Target:** Compute aggregations in SQL or in the API route handler.

**Risk:** Medium — changing API response shape requires frontend updates.
**Impact:** Less client-side compute; smaller response payload.

---

### OPT-12: Enable `REFRESH MATERIALIZED VIEW CONCURRENTLY`

**Current:** Materialized views may block reads during refresh.
**Target:** Add unique indexes to enable `CONCURRENTLY` refresh:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_iseller_summary_pk
  ON mart.mv_iseller_summary (sale_date, toko, kode, kode_besar);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_iseller_promo_pk
  ON mart.mv_iseller_promo (sale_date, toko, campaign_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_iseller_txn_agg_pk
  ON mart.mv_iseller_txn_agg (sale_date, toko);
```

Then refresh scripts use:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mart.mv_iseller_summary;
```

**Risk:** Medium — unique index definition must match MV's actual granularity.
**Impact:** Zero-downtime MV refreshes.

---

### OPT-13: SWR Prefetch on Tab Hover

**File:** `app/HomeInner.tsx`
**Current:** Tab content fetches only after user clicks.
**Target:** Prefetch on `onMouseEnter`:

```typescript
import { preload } from "swr";

<button
  onMouseEnter={() => preload(`/api/promo?${apiParams}`, fetcher)}
  onClick={() => setTab("promo")}
>
  Promo Monitor
</button>
```

**Risk:** Low — just pre-populates SWR cache.
**Impact:** Eliminates loading spinner on tab switch (~200-500ms perceived).

---

### OPT-14: Remove Unused `framer-motion`

**File:** `package.json`
**Current:** `framer-motion` (~40 KB) listed as dependency but not imported
anywhere in components.
**Target:** `npm uninstall framer-motion`

**Risk:** None if truly unused (verify with grep first).
**Impact:** ~40 KB bundle reduction.

---

## Database Reference

### Table Sizes

| Table | Size | Rows |
|-------|------|------|
| `mart.iseller_daily` | 171 MB | 737,270 |
| `mart.iseller_hourly` | 156 MB | — |
| `mart.iseller_txn` | 83 MB | — |
| `mart.mv_iseller_summary` | — | 737,270 |
| `mart.mv_iseller_promo` | — | 9,882 |
| `mart.mv_iseller_txn_agg` | — | 32,689 |
| `iseller_2025` | — | 628,134 |
| `iseller_2026` | — | 98,811 |

### Sequential Scan Hotspots

| Table | Seq Scans | Tuples Read | Index Scans |
|-------|-----------|-------------|-------------|
| `portal.promo_campaign` | 5,031,131 | 100,622,580 | 20 |
| `portal.kodemix` | 20,861 | 113,686,580 | 28,731 |
| `portal.hpprsp` | 16,591 | 15,506,981 | 0 |
| `mart.mv_accurate_summary` | 10,074 | 6,799,367,774 | 26,561 |
| `mart.mv_iseller_summary` | 4,621 | 1,310,706,527 | 29,079 |
| `mart.iseller_daily` | 1,537 | 455,788,857 | 95,731 |

### Existing Indexes (Key Tables)

- **`mv_iseller_summary`** (5 indexes): date, branch+date, toko+date, kode, kode_besar
- **`mv_iseller_promo`** (4 indexes): branch, toko, campaign_code, date
- **`mv_iseller_txn_agg`** (3 indexes): toko, date, branch
- **`iseller_hourly`** (4 indexes): toko, branch, date, hour_wib

---

## Implementation Order

Safe execution sequence — each step independently verifiable:

```
Phase 1: Zero-Risk Backend (no behavior change)
  OPT-02  lib/db.ts pool config
  OPT-08  lib/fetcher.ts error handling

Phase 2: Biggest Single Win
  OPT-01  Parallelize /api/promo
  OPT-05  Add app-level cache to /api/promo

Phase 3: Frontend Quick Wins
  OPT-04  DetailTable dedupingInterval
  OPT-06  StoreTable useMemo
  OPT-07  Dynamic import xlsx (5 files)

Phase 4: Database Indexes
  OPT-03  portal.promo_campaign indexes

Phase 5: Nice-to-Have
  OPT-09  /api/detail cache
  OPT-10  Merge promo time series queries
  OPT-13  Tab prefetch on hover
  OPT-14  Remove framer-motion

Phase 6: Future (requires deeper testing)
  OPT-11  Move hourly aggregation to backend
  OPT-12  CONCURRENTLY refresh for MVs
```

---

## Constraints

- **Do not break existing dashboard data or tarikan** — verify in browser before deploying
- **Auto-update must keep working** — raw iSeller data ingestion unaffected
- **Commit + push after each verified phase**
- **Verify on live link** (https://iseller-metis-dashboard.vercel.app) before delivering

---

## Methodology

This roadmap was generated from 4 parallel exploration agents:

1. **API Routes Agent** — read all route files, cataloged every SQL query, connection
   pattern, caching strategy, and parallelization status
2. **Frontend Agent** — analyzed SWR configs, fetch waterfalls, client-side computation
   costs, and bundle size across all components
3. **Database Agent** — queried `pg_indexes`, `pg_stat_user_tables`, table sizes, row
   counts, materialized view status, and sequential scan patterns
4. **Oracle Agent** — researched production best practices for Next.js + PostgreSQL
   connection pooling, caching, indexing, and SWR optimization
