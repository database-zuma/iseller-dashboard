# iSeller Metis Dashboard — Test Checklist

> **Project**: `iseller-metis-dashboard` (branch `feature/iseller-metis-ai`)
> **Live**: https://iseller-metis-dashboard.vercel.app
> **Original (no AI)**: https://iseller-dashboard.vercel.app
> **Last verified**: 2026-03-03

---

## How to Use

- `- [ ]` = not tested / failing
- `- [x]` = passing
- Each item has `▸ HOW` with the exact command/step to verify
- Items marked `🔁 REGRESSION` = previously broken, watch closely
- Run `## Quick Smoke Test` first — if those fail, stop and fix before continuing

---

## Quick Smoke Test

> Run these 4 first. If any fail, the rest of the checklist is meaningless.

- [ ] **Site loads** — no 500 / build error
  > ▸ `curl -s -o /dev/null -w '%{http_code}' https://iseller-metis-dashboard.vercel.app`
  > Expected: `200`

- [ ] **Dashboard API returns data** — KPIs are not zero
  > ▸ `curl -s 'https://iseller-metis-dashboard.vercel.app/api/dashboard?v=3&from=2026-01-01&to=2026-03-02' | python3 -c "import sys,json; d=json.load(sys.stdin); print('revenue:', d['kpis']['revenue'], '| pairs:', d['kpis']['pairs'])"`
  > Expected: revenue > 0, pairs > 0

- [ ] **Database is reachable** from Vercel (env var set)
  > ▸ `curl -s 'https://iseller-metis-dashboard.vercel.app/api/filter-options' | python3 -c "import sys,json; d=json.load(sys.stdin); print('branches:', len(d.get('branches',[])))"`
  > Expected: branches > 0

- [ ] **Metis chat API responds** — not 500
  > ▸ `curl -s -o /dev/null -w '%{http_code}' -X POST https://iseller-metis-dashboard.vercel.app/api/metis/chat -H 'Content-Type: application/json' -d '{"messages":[{"parts":[{"type":"text","text":"test"}],"id":"test1","role":"user"}]}'`
  > Expected: `200`

---

## 1. Environment & Config

- [ ] **`DATABASE_URL` set in Vercel** (Production)
  > ▸ `vercel env ls --token=WNWvm9fjTerfhyG9zqiSEzdx` (from project dir)
  > Expected: `DATABASE_URL` listed for Production

- [ ] **`MINIMAX_API_KEY` set in Vercel** (Production)
  > ▸ Same command above
  > Expected: `MINIMAX_API_KEY` listed for Production

- [ ] **`.env.local` exists locally** with both vars
  > ▸ `test -f .env.local && grep -c 'DATABASE_URL\|MINIMAX_API_KEY' .env.local`
  > Expected: `2`

- [ ] **`.vercel/project.json` points to `iseller-metis-dashboard`** (NOT the original)
  > ▸ `cat .vercel/project.json | python3 -c "import sys,json; print(json.load(sys.stdin)['projectName'])"`
  > Expected: `iseller-metis-dashboard`

---

## 2. API Endpoints

### 2.1 Dashboard API (`/api/dashboard`)

- [ ] **Returns 200**
  > ▸ `curl -s -o /dev/null -w '%{http_code}' 'https://iseller-metis-dashboard.vercel.app/api/dashboard?v=3&from=2026-01-01&to=2026-03-02'`

- [ ] **Response has correct shape** — kpis, timeSeries, byBranch, byStore, bySeries, byGender, byTier, byTipe, bySize, byPrice, byArticle, lastUpdate
  > ▸ `curl -s '...url...' | python3 -c "import sys,json; d=json.load(sys.stdin); print(sorted(d.keys()))"`

- [ ] **KPI values are sane** — revenue > 1B, pairs > 10K, transactions > 5K
  > ▸ Check `d['kpis']` from above

- [ ] **lastUpdate is recent** — within 7 days of today
  > ▸ `d['lastUpdate']` should be >= `2026-02-20`

### 2.2 Detail API (`/api/detail`)

- [ ] **Kode mode returns data**
  > ▸ `curl -s 'https://iseller-metis-dashboard.vercel.app/api/detail?from=2026-01-01&to=2026-03-02&page=1&limit=10' | python3 -c "import sys,json; d=json.load(sys.stdin); print('rows:', len(d.get('rows',[])), 'total:', d.get('total'))"`
  > Expected: rows=10, total > 100

- [ ] **Kode Besar mode returns data**
  > ▸ Same URL with `&group=kode_besar`

### 2.3 Filter Options API (`/api/filter-options`)

- [ ] **Returns branches, stores, and other filter values**
  > ▸ `curl -s '.../api/filter-options' | python3 -c "import sys,json; d=json.load(sys.stdin); print({k:len(v) for k,v in d.items()})"`
  > Expected: branches >= 6, stores >= 40

### 2.4 Promo API (`/api/promo`)

- [ ] **Returns 200** (may have permission issues with `mv_iseller_promo`)
  > ▸ `curl -s -o /dev/null -w '%{http_code}' 'https://iseller-metis-dashboard.vercel.app/api/promo?from=2026-01-01&to=2026-03-02'`
  > Known issue: `mv_iseller_promo` and `mv_iseller_txn_agg` may have permission errors

### 2.5 Metis Chat API (`/api/metis/chat`)

- [ ] **Accepts POST and streams response**
  > ▸ `curl -s -X POST .../api/metis/chat -H 'Content-Type: application/json' -d '{"messages":[{"parts":[{"type":"text","text":"Berapa total revenue?"}],"id":"t1","role":"user"}],"dashboardContext":{"filters":{"from":"2026-01-01","to":"2026-03-02"},"activeTab":"summary"}}' | head -5`
  > Expected: SSE stream starting with `data: {"type":"start"}`

- [ ] **Response header has model name**
  > ▸ Check `X-Metis-Model` header in response
  > Expected: `MiniMax M2.5`

### 2.6 Metis Sessions API (`/api/metis/sessions`)

- [ ] **GET returns 200** (session list)
  > ▸ `curl -s -o /dev/null -w '%{http_code}' 'https://iseller-metis-dashboard.vercel.app/api/metis/sessions?dashboard=iseller-sales&uid=test'`

- [ ] **POST creates session**
  > ▸ `curl -s -X POST .../api/metis/sessions -H 'Content-Type: application/json' -d '{"dashboard":"iseller-sales","uid":"test","title":"test session"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','FAIL'))"`

---

## 3. Database Health

- [ ] **`mart.mv_iseller_summary` exists and is queryable**
  > ▸ `PGPASSWORD='Zuma-0psCl4w-2026!' psql -h 76.13.194.120 -p 5432 -U openclaw_app -d openclaw_ops -c "SELECT COUNT(*) FROM mart.mv_iseller_summary;"`
  > Expected: > 500,000 rows

- [ ] **Data freshness** — max date within last 7 days
  > ▸ `... -c "SELECT MAX(sale_date) FROM mart.mv_iseller_summary;"`
  > Expected: >= `2026-02-25`

- [ ] **`public.metis_sessions` table exists**
  > ▸ `... -c "SELECT COUNT(*) FROM public.metis_sessions;"`
  > Expected: no error (count >= 0)

- [ ] **`mart.mv_iseller_txn_agg` accessible** ⚠️ Known permission issue
  > ▸ `... -c "SELECT COUNT(*) FROM mart.mv_iseller_txn_agg;"`

- [ ] **`mart.mv_iseller_promo` accessible** ⚠️ Known permission issue
  > ▸ `... -c "SELECT COUNT(*) FROM mart.mv_iseller_promo;"`

---

## 4. Metis AI — Functional Tests

> These require browser testing (Playwright or manual).

### 4.1 Chat Widget

- [ ] **Floating bubble visible** — bottom-right corner, 56px
  > ▸ Playwright: `page.locator('button:has-text("Open Metis AI Chat")').isVisible()`

- [ ] **Intro banner shows** on first visit — "FITUR BARU! Metis 🔮"
  > ▸ Playwright: `page.locator('text=FITUR BARU').isVisible()`

- [ ] **Panel opens on click** — 380×600px chat panel
  > ▸ Click bubble → wait for `text=Metis AI` in panel header

- [ ] **Session loads** — not stuck on "Memuat sesi..."
  > ▸ Wait for text input `placeholder="Tanya tentang data penjualan..."` to appear

- [ ] **Welcome message renders** — "Halo! Saya Metis 🔮"
  > ▸ Playwright: `page.locator('text=Halo! Saya Metis').isVisible()`

- [ ] **3 suggestion buttons visible** — quick prompts
  > ▸ Playwright: `page.locator('button:has-text("Top 5 artikel")').isVisible()`

- [ ] **Context banner shows date range** — "Viewing: 2026-01-01 → ..."
  > ▸ Playwright: `page.locator('text=Viewing:').isVisible()`

### 4.2 Chat Interaction

- [ ] **Simple question gets text response** (not blank) 🔁 REGRESSION
  > ▸ Type "Toko mana revenue tertinggi?" → Send → wait for response text
  > Previously broke when: `stepCountIs(3)` was too low, AI used all steps on tool retries
  > Fixed by: increasing to `stepCountIs(6)`

- [ ] **AI runs SQL query via tool call** — "Menganalisis..." indicator shows
  > ▸ After sending, look for "Menganalisis..." text during processing

- [ ] **Response contains data** — actual store names, revenue numbers
  > ▸ Response should mention "Mataram" or "Tabanan" (known top stores)

- [ ] **Response follows format** — Temuan → Insight → Rekomendasi
  > ▸ Check for heading-like structure in response

- [ ] **No `avg_price` SQL errors** 🔁 REGRESSION
  > ▸ Network tab: check `/api/metis/chat` response body for `"error":"column \"avg_price\" does not exist"`
  > Previously broke when: system prompt listed `avg_price` as a column
  > Fixed by: removing from schema, adding ASP calculation formula

- [ ] **Non-product items excluded** from article queries 🔁 REGRESSION
  > ▸ Ask "Top 5 artikel paling laku?" → response should NOT list SHOPBAG001, PAPERBAG001, INBOX001
  > Fixed by: adding exclusion note in system prompt

### 4.3 Session Management

- [ ] **New chat button works** — clears messages, starts fresh
  > ▸ Click "New chat" → messages clear, welcome message reappears

- [ ] **Chat sessions button works** — shows session list
  > ▸ Click "Chat sessions" → session list panel appears

---

## 5. Dashboard UI — Tab Tests

> Browser testing (Playwright or manual).

### 5.1 Executive Summary (Tab 1)

- [ ] **KPI cards show data** — Revenue, Pairs, TXN, ATU, ASP, ATV all non-zero
- [ ] **Sales Over Time chart renders** — not blank/error
- [ ] **Branch contribution table has rows** — 6+ branches
- [ ] **Store table has rows** — 40+ stores across 6 pages
- [ ] **Store table pagination works** — Next/Prev buttons
- [ ] **CSV export works** — downloads file
- [ ] **XLSX export works** — downloads file

### 5.2 SKU Chart (Tab 2)

- [ ] **Tab renders without error** — charts visible
- [ ] **Series chart has segments** — not "Unknown" only
- [ ] **Gender chart has segments** — Men, Ladies, Baby visible

### 5.3 Detail Kode (Tab 3)

- [ ] **Table renders with data** — 10 rows per page
- [ ] **Search works** — type article code, results filter
- [ ] **Pagination works**

### 5.4 Detail Size / Kode Besar (Tab 4)

- [ ] **Table renders with grouped data**

### 5.5 Promo Monitor (Tab 5)

- [ ] **Tab renders** (depends on `mv_iseller_promo` permission)
- [ ] **Mode toggle works** — switches between Promo Struks / All Struks
- [ ] **Campaign table shows rows**
- [ ] **SPG leaderboard shows names**

### 5.6 Global Filters

- [ ] **Date range filter changes data** — change FROM date → KPI cards update
- [ ] **Branch filter works** — select one branch → data filters
- [ ] **Store filter works** — select one store → data filters
- [ ] **Filters persist across tab switch** — apply filter on Tab 1 → switch to Tab 2 → filter still active

---

## 6. Deployment & Git

- [ ] **Build passes locally** — `npm run build` exits with 0
  > ▸ `cd /Users/database-zuma/iseller-metis-dashboard && npm run build 2>&1 | tail -5`

- [ ] **Branch is `feature/iseller-metis-ai`** — not accidentally on main
  > ▸ `git branch --show-current`
  > Expected: `feature/iseller-metis-ai`

- [ ] **All changes committed and pushed**
  > ▸ `git status` → "nothing to commit, working tree clean"
  > ▸ `git log --oneline -1` → latest commit matches expectations

- [ ] **Original dashboard untouched**
  > ▸ `curl -s https://iseller-dashboard.vercel.app | grep -c 'Metis'`
  > Expected: `0` (no Metis on original)

- [ ] **Vercel project is separate**
  > ▸ `.vercel/project.json` → `projectName: "iseller-metis-dashboard"`

---

## 7. Regression Watch

> Bugs that were previously fixed. Re-test these after ANY code change.

| # | Bug | Root Cause | Fix | How to Detect |
|---|-----|-----------|-----|---------------|
| R1 | AI response blank / empty | `stepCountIs(3)` too low — AI used all steps on SQL retries, none left for answer | Changed to `stepCountIs(6)` in `app/api/metis/chat/route.ts` | Send any question → response area stays empty |
| R2 | SQL error `column "avg_price" does not exist` | System prompt listed `avg_price` as a table column | Removed from schema in `lib/metis/system-prompt.ts`, added ASP calc formula | Network tab: check chat SSE for `avg_price` error |
| R3 | SHOPBAG/PAPERBAG in top articles | AI didn't know these are non-product packaging items | Added exclusion note in system prompt | Ask "top artikel" → result includes SHOPBAG001 |
| R4 | Branch name "Batman" instead of "Batam" | Typo in system prompt | Fixed in `lib/metis/system-prompt.ts` | Grep system-prompt.ts for "Batman" |
| R5 | Revenue = 0 on live site | `DATABASE_URL` env var not set in Vercel | Added env var via `vercel env add` | KPI cards show Rp 0 |
| R6 | Deploy overwrites original dashboard | `.vercel` folder linked to wrong project | Deleted `.vercel` folder, re-linked to new project | Check `iseller-dashboard.vercel.app` has no Metis |
| R7 | ETL revenue calculation wrong | Used `jumlah_pembayaran` (always NULL) instead of `jumlah_subtotal_per_item` | Fixed in `mart.refresh_iseller_marts()` | Revenue is Rp 0 despite having pairs |
| R8 | DB connection pool exhaustion | Pool max was 20, idle was 30s | Reduced to max:3, idle:10s in `lib/db.ts` | API calls hang or timeout after ~20 requests |

---

## 8. Automation Notes

> For future Playwright/script automation.

### Quick Script Skeleton (curl-based)

```bash
#!/bin/bash
# smoke-test.sh — Run from project root
BASE="https://iseller-metis-dashboard.vercel.app"
PASS=0; FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    echo "  ✅ $name"; ((PASS++))
  else
    echo "  ❌ $name (expected: $expected, got: $actual)"; ((FAIL++))
  fi
}

echo "=== Smoke Test ==="
check "Site loads" "200" "$(curl -s -o /dev/null -w '%{http_code}' $BASE)"
check "Dashboard API" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dashboard?v=3&from=2026-01-01&to=2026-03-02")"
check "Filter API" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/filter-options")"
check "Metis Chat API" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/metis/chat" -H 'Content-Type: application/json' -d '{"messages":[{"parts":[{"type":"text","text":"test"}],"id":"t1","role":"user"}]}')"
check "Sessions API" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/metis/sessions?dashboard=iseller-sales&uid=test")"

echo ""
echo "=== Revenue Sanity ==="
REV=$(curl -s "$BASE/api/dashboard?v=3&from=2026-01-01&to=2026-03-02" | python3 -c "import sys,json; print(int(json.load(sys.stdin)['kpis']['revenue']))" 2>/dev/null)
if [[ "$REV" -gt 1000000000 ]]; then
  echo "  ✅ Revenue = Rp $REV (> 1B)"; ((PASS++))
else
  echo "  ❌ Revenue = Rp $REV (expected > 1B)"; ((FAIL++))
fi

echo ""
echo "=== No Metis on Original ==="
METIS_COUNT=$(curl -s https://iseller-dashboard.vercel.app | grep -c 'Metis' || true)
check "Original has no Metis" "0" "$METIS_COUNT"

echo ""
echo "=== Regression: System Prompt ==="
check "No avg_price in prompt" "0" "$(grep -c 'avg_price' lib/metis/system-prompt.ts)"
check "No Batman typo" "0" "$(grep -c 'Batman' lib/metis/system-prompt.ts)"
check "stepCountIs >= 5" "0" "$(grep -c 'stepCountIs(3)' app/api/metis/chat/route.ts)"

echo ""
echo "============================="
echo "PASS: $PASS | FAIL: $FAIL"
[[ $FAIL -eq 0 ]] && echo "🎉 ALL PASSED" || echo "⚠️  FAILURES DETECTED"
```

### Playwright Skeleton (for UI tests)

```typescript
// tests/metis-chat.spec.ts — future implementation
import { test, expect } from '@playwright/test';

const BASE = 'https://iseller-metis-dashboard.vercel.app';

test('dashboard loads with data', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.locator('text=REVENUE')).toBeVisible();
  await expect(page.locator('text=Rp 0')).not.toBeVisible();
});

test('metis chat opens and responds', async ({ page }) => {
  await page.goto(BASE);
  // Dismiss intro if present
  const intro = page.locator('button:has-text("Coba Sekarang")');
  if (await intro.isVisible()) await intro.click();
  // Open chat
  await page.locator('button:has-text("Open Metis AI Chat")').click();
  await expect(page.locator('text=Halo! Saya Metis')).toBeVisible({ timeout: 10000 });
  // Send message
  await page.fill('textarea', 'Toko mana revenue tertinggi?');
  await page.locator('button:has-text("Send message")').click();
  // Wait for response (not blank)
  await expect(page.locator('text=Mataram').or(page.locator('text=Tabanan'))).toBeVisible({ timeout: 60000 });
});

test('original dashboard has no metis', async ({ page }) => {
  await page.goto('https://iseller-dashboard.vercel.app');
  await expect(page.locator('text=Metis')).not.toBeVisible();
});
```

---

## Revision Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-03 | Claude + Wayan | Initial checklist — 50+ items, 8 regressions tracked |
