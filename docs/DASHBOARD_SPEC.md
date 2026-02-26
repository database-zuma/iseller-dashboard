# iSeller Dashboard — Specification & Knowledge Base

> **Live**: https://iseller-dashboard.vercel.app  
> **Repo**: https://github.com/database-zuma/iseller-dashboard  
> **Stack**: Next.js 16 + Tailwind + Chart.js + SWR  
> **DB**: PostgreSQL on VPS `76.13.194.120:5432` — database `openclaw_ops`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Vercel)                                  │
│  Next.js App Router + React                         │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │  FilterBar    │  │  Tab Content │                 │
│  │  (global)     │  │  (per tab)   │                 │
│  └──────────────┘  └──────────────┘                 │
│         │                  │                        │
│         ▼                  ▼                        │
│  /api/filter-options   /api/dashboard               │
│                        /api/detail                  │
│                        /api/promo                   │
└────────────────────────┬────────────────────────────┘
                         │ pg pool (max:3)
                         ▼
┌─────────────────────────────────────────────────────┐
│  PostgreSQL (VPS 76.13.194.120)                     │
│  openclaw_ops                                       │
│                                                     │
│  raw.iseller_2025 / raw.iseller_2026                │
│       ▼ (ETL views)                                 │
│  mart.iseller_daily → mart.mv_iseller_summary       │
│                     → mart.mv_iseller_txn_agg       │
│                     → mart.mv_iseller_promo         │
│  portal.promo_campaign (mapping table)              │
│  core.classify_promo() (classification function)    │
└─────────────────────────────────────────────────────┘
```

### Key Files

| File | Role |
|---|---|
| `app/HomeInner.tsx` | Tab container, tab routing, global filter state |
| `app/api/dashboard/route.ts` | API for Executive Summary + SKU Chart tabs |
| `app/api/detail/route.ts` | API for Detail (Kode) + Detail Size tabs |
| `app/api/promo/route.ts` | API for Promo Monitor tab |
| `app/api/filter-options/route.ts` | Distinct branch/store/spg lists for FilterBar |
| `components/FilterBar.tsx` | Global filters: date range, branch, store (shared across tabs) |
| `components/KpiCards.tsx` | Score cards for Executive Summary |
| `components/PeriodChart.tsx` | Time series chart for Executive Summary |
| `components/BranchPieChart.tsx` | Branch revenue pie chart |
| `components/StoreTable.tsx` | Store performance table for Executive Summary |
| `components/SkuCharts.tsx` | SKU breakdown charts (series, gender, tier, tipe, size, price, article) |
| `components/DetailTable.tsx` | Per-kode detail table with pagination |
| `components/PromoTab.tsx` | Full Promo Monitor tab (self-contained) |
| `lib/db.ts` | PostgreSQL pool (max:3, idle:10s) |
| `lib/export.ts` | CSV + XLSX export utilities |

---

## Tabs

| # | Tab ID | Label | API Route | Component(s) |
|---|---|---|---|---|
| 1 | `summary` | Executive Summary | `/api/dashboard` | KpiCards, PeriodChart, BranchPieChart, StoreTable |
| 2 | `sku` | SKU Chart | `/api/dashboard` | SkuCharts |
| 3 | `detail` | Detail (Kode) | `/api/detail` | DetailTable |
| 4 | `detail-size` | Detail Size (Kode Besar) | `/api/detail` | DetailTable (grouped by kode_besar) |
| 5 | `promo` | Promo Monitor | `/api/promo` | PromoTab |

### Global Filters (FilterBar)

Shared across ALL tabs via URL search params:
- `from` / `to` — date range
- `branch` — multi-select branch filter
- `store` — multi-select store filter

> **Campaign filter is NOT global** — it lives exclusively inside PromoTab.

---

## Tab 1: Executive Summary

> **TODO**: Document sections in detail when ready.

### Sections:
1. **KPI Cards** — Revenue, Pairs, TXN, ATU, ASP, ATV
2. **Period Chart** — Daily revenue + pairs time series
3. **Branch Pie Chart** — Revenue distribution by branch
4. **Store Table** — Per-store performance, sortable, paginated, CSV/XLSX export

### Data Source:
- `mart.mv_iseller_summary` (pairs, revenue by date × toko × branch)
- `mart.mv_iseller_txn_agg` (transaction counts by date × toko × branch)

---

## Tab 2: SKU Chart

> **TODO**: Document sections in detail when ready.

### Sections:
7 pie/donut charts showing pairs distribution by:
1. Series (e.g. Axel, Benton, Chester)
2. Gender (Male, Female, Unisex)
3. Tier (T1–T7)
4. Tipe (Sneakers, Sandals, etc.)
5. Size distribution
6. Price range buckets
7. Top articles ranked by pairs

### Data Source:
- Same `/api/dashboard` response, different fields

---

## Tab 3: Detail (Kode)

> **TODO**: Document sections in detail when ready.

### Sections:
- Paginated table of individual article codes with pairs, revenue, etc.
- Search/filter by kode

### Data Source:
- `/api/detail` querying detailed article-level data

---

## Tab 4: Detail Size (Kode Besar)

> **TODO**: Document sections in detail when ready.

### Sections:
- Same as Detail tab but grouped by `kode_besar` (parent article code)

### Data Source:
- `/api/detail` with `group=kode_besar` param

---

## Tab 5: Promo Monitor

### Overview

Tracks promo campaign performance. Has its own **campaign filter** (not in global FilterBar) and a **mode toggle** (Promo Struks vs All Struks) that affects multiple sections.

### Campaign Classification

Transactions are classified into promo campaigns via:
- **`portal.promo_campaign`** table — 20 campaigns with `match_patterns TEXT[]`, date ranges, priorities
- **`core.classify_promo(kode_diskon, catatan_pesanan, catatan_per_item, sale_date)`** — scans 3 columns against campaign regex patterns, returns `campaign_code` or `NULL`
- Promo codes are scattered across 3 raw columns: `kode_diskon`, `catatan_pesanan`, `catatan_per_item`

### Mode Toggle

Two modes affect KPI Row 2, chart, and store table:

| | Promo Struks (Mode A) | All Struks (Mode B) |
|---|---|---|
| **Scope** | Only transactions containing a matched promo | ALL transactions in the period |
| **Data source** | `mart.mv_iseller_promo` | `mart.mv_iseller_summary` + `mart.mv_iseller_txn_agg` |

### API

**Route**: `/api/promo`  
**Method**: GET  
**Params**: `from`, `to`, `branch` (multi), `store` (multi), `campaign` (multi)

**Response shape**:
```typescript
{
  promoKpis:          { qtyAll, qtyPromo, revenue, discountTotal, txnCount, promoShare, atu, asp, atv }
  overallKpis:        { pairs, revenue, txnCount, atu, asp, atv }
  timeSeries:         [{ period, qtyAll, qtyPromo, revenue, discountTotal, txnCount }]
  overallTimeSeries:  [{ period, pairs, revenue, txnCount }]
  byCampaign:         [{ campaign, qtyAll, qtyPromo, revenue, discountTotal, txnCount }]
  stores:             [{ toko, branch, qtyAll, qtyPromo, revenue, discountTotal, txnCount }]
  overallStores:      [{ toko, branch, pairs, revenue, txnCount }]
  spgLeaderboard:     [{ spg, qtyPromo, qtyAll, revenue, txnCount }]
  campaignOptions:    [{ code, name }]
}
```

### Section 5.1: KPI Row 1 — Promo Scorecards

**Always shows promo data** regardless of mode toggle.

| Card | Description | Formula | Source |
|---|---|---|---|
| QTY All | Total qty of ALL items in promo-containing transactions | `SUM(qty_all)` | `mv_iseller_promo` |
| QTY Promo | Total qty of items that matched a promo code | `SUM(qty_promo)` | `mv_iseller_promo` |
| % Promo Share | Percentage of promo items vs total items in promo transactions | `qty_promo / qty_all` | Calculated |
| Revenue | Total net revenue from promo-containing transactions | `SUM(revenue)` | `mv_iseller_promo` |
| Discount Total | Total discount amount given in promo transactions | `SUM(discount_total)` | `mv_iseller_promo` |
| TXN | Number of unique transactions (struks) containing promo items | `SUM(txn_count)` | `mv_iseller_promo` |

> "Promo-containing transaction" = a struk where at least 1 item matched a campaign pattern in `portal.promo_campaign`.

### Section 5.2: KPI Row 2 — ATU / ASP / ATV

**Changes based on mode toggle.** Shows `(promo)` or `(all)` label.

| Card | Full Name | Mode A (Promo) | Mode B (All) |
|---|---|---|---|
| ATU | Avg Transaction Unit | `qty_all_promo / txn_count_promo` | `pairs_overall / txn_count_overall` |
| ASP | Avg Selling Price | `revenue_promo / qty_all_promo` | `revenue_overall / pairs_overall` |
| ATV | Avg Transaction Value | `revenue_promo / txn_count_promo` | `revenue_overall / txn_count_overall` |

- **Mode A**: Denominator/numerator from promo transactions only.
- **Mode B**: Denominator/numerator from ALL transactions in the filtered period (incl. non-promo).

### Section 5.3: Time Series Chart

**Changes based on mode toggle.** Dual Y-axis bar chart.

| | Mode A (Promo) | Mode B (All) |
|---|---|---|
| Title | "Promo Sales Over Time" | "Overall Sales Over Time" |
| Bar 1 (green, Y-left) | Revenue in Rp juta | Revenue in Rp juta |
| Bar 2 (black, Y-right) | QTY Promo | Pairs (All) |
| Tooltip Bar 2 | "QTY Promo: X" | "Pairs: X" |
| Granularity | Daily (`sale_date`) | Daily (`sale_date`) |
| Source | `mv_iseller_promo` grouped by date | `mv_iseller_summary` + `mv_iseller_txn_agg` grouped by date |

### Section 5.4: Campaign Breakdown Table

**Always shows promo data** — not affected by mode toggle.

| Column | Description |
|---|---|
| Campaign | Campaign code (e.g. NATARU25, RK40, CNY25) |
| QTY Promo | Total qty of promo items for this campaign |
| Revenue | Total revenue from this campaign's transactions |
| TXN | Transaction count |
| Revenue Share | Visual bar — proportion vs highest-revenue campaign |

- Sorted by revenue DESC
- **Clickable rows**: clicking a campaign row filters the entire tab to that campaign only (via URL param)
- Source: `mv_iseller_promo` grouped by `campaign_code`

### Section 5.5: Store Performance Table

**Changes based on mode toggle.** Sortable, paginated (10/page), with CSV/XLSX export.

| | Mode A (Promo) | Mode B (All) |
|---|---|---|
| Title | "Store Performance (Promo)" | "Store Performance (All)" |
| Columns | #, Store, Branch, QTY All, QTY Promo, Revenue, Discount, TXN (8 cols) | #, Store, Branch, Pairs, Revenue, TXN (6 cols) |
| Footer | Totals for all 8 columns | Totals for 6 columns |
| Export filename | `promo_store_performance.csv/.xlsx` | `overall_store_performance.csv/.xlsx` |
| Source | `mv_iseller_promo` grouped by toko | `mv_iseller_summary` + `mv_iseller_txn_agg` grouped by toko |

**Sort behavior on mode switch**: If current sort key is promo-only (`qtyAll`, `qtyPromo`, `discountTotal`) and user switches to Mode B, sort auto-resets to `revenue DESC`.

### Section 5.6: SPG Leaderboard

**Always shows promo data** — not affected by mode toggle.

| Column | Description |
|---|---|
| # | Rank (by QTY Promo) |
| SPG Name | Sales person name |
| QTY Promo | Total promo items sold by this SPG |
| QTY All | Total items in this SPG's promo transactions |
| Revenue | Total revenue from this SPG's promo transactions |
| TXN | Transaction count |

- Top 50 only, sorted by QTY Promo DESC
- Excludes `spg = 'Unknown'`
- Source: `mv_iseller_promo` grouped by `spg`

### Section Summary: Mode Toggle Impact

| Section | Promo Struks (A) | All Struks (B) | Changes? |
|---|---|---|---|
| KPI Row 1 (6 cards) | Promo data | Promo data | No |
| KPI Row 2 (ATU/ASP/ATV) | From promo struks | From ALL struks | **Yes** |
| Time Series Chart | Revenue + QTY Promo | Revenue + Pairs overall | **Yes** |
| Campaign Breakdown | Promo data | Promo data | No |
| Store Table | 8 cols, promo data | 6 cols, overall data | **Yes** |
| SPG Leaderboard | Promo data | Promo data | No |

---

## Database Objects Reference

### Materialized Views

| View | Grain | Key Columns | Used By |
|---|---|---|---|
| `mart.mv_iseller_summary` | date × toko × branch | pairs, revenue | Exec Summary, Promo Mode B |
| `mart.mv_iseller_txn_agg` | date × toko × branch | txn_count | Exec Summary, Promo Mode B |
| `mart.mv_iseller_promo` | date × toko × branch × spg × campaign_code | qty_all, qty_promo, revenue, discount_total, txn_count | Promo Mode A |

### Raw Data Key Columns

From `raw.iseller_2025` / `raw.iseller_2026`:

| Column | Type | Note |
|---|---|---|
| `jumlah` | text (cast to int) | Quantity per line item |
| `jumlah_subtotal_per_item` | text (cast to numeric) | Subtotal **per unit** after discount (NOT line total) |
| `jumlah_diskon_per_item` | text (cast to numeric) | Discount **per unit** |
| `kode_diskon` | text | Discount code (e.g. RK40, NATARU25) |
| `catatan_pesanan` | text | Order notes — sometimes contains promo codes |
| `catatan_per_item` | text | Per-item notes — sometimes contains promo codes |

**Critical formulas**:
- Line revenue = `jumlah_subtotal_per_item × jumlah`
- Line discount = `jumlah_diskon_per_item × jumlah`
- Full unit price = `jumlah_subtotal_per_item + jumlah_diskon_per_item`

### Campaign Classification

| Object | Description |
|---|---|
| `portal.promo_campaign` | 20 campaigns with `campaign_code`, `campaign_name`, `match_patterns TEXT[]`, `start_date`, `end_date`, `priority` |
| `core.classify_promo(kode_diskon, catatan_pesanan, catatan_per_item, sale_date)` | STABLE function. Scans 3 text columns against campaign patterns. Returns highest-priority matching `campaign_code` or `NULL`. |

---

## Deployment

```bash
cd /Users/database-zuma/iseller-dashboard
npm run build                    # Must pass with 0 errors
git add -A && git commit -m "..."
git push origin main
npx vercel --prod --yes --token=WNWvm9fjTerfhyG9zqiSEzdx
```

---

## Changelog

| Date | Commit | Change |
|---|---|---|
| 2026-02-27 | `dc74233` | Wire mode toggle to chart, store table, exports (Promo Monitor) |
| 2026-02-27 | `9ffd6e7` | Fix promo share display (ratio 0-1 → percentage) |
| 2026-02-27 | `82c4a38` | Reduce pool max:20→3, idle:30s→10s |
| 2026-02-27 | `8438fe7` | Fix connection pool exhaustion (single client pattern) |
| 2026-02-27 | — | Fix MV revenue bug (subtotal_per_item must × jumlah) |
| 2026-02-26 | — | Initial Promo Monitor tab, campaign classification, MV creation |
