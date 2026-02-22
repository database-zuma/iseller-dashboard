"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import useSWR from "swr";
import { ChevronUp, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fetcher } from "@/lib/fetcher";

type Mode = "kode" | "kode_besar";

interface KodeRow {
  kode: string;
  article: string;
  series: string;
  gender: string;
  tier: string;
  pairs: number;
  revenue: number;
  avg_price: number;
}

interface KodeBesarRow {
  kode_besar: string;
  kode: string;
  article: string;
  size: string;
  color: string;
  tier: string;
  pairs: number;
  revenue: number;
  avg_price: number;
}

interface DetailResponse {
  rows: (KodeRow | KodeBesarRow)[];
  total: number;
  page: number;
  pages: number;
}

function fmtRp(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

function SortIcon({ col, sort, dir }: { col: string; sort: string; dir: string }) {
  if (sort !== col) return <ChevronUp className="size-3 text-muted-foreground/40" />;
  return dir === "asc" ? <ChevronUp className="size-3 text-[#00E273]" /> : <ChevronDown className="size-3 text-[#00E273]" />;
}

export default function DetailTable({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");

  const page = parseInt(searchParams.get("page") || "1", 10);
  const sort = searchParams.get("sort") || "revenue";
  const dir = searchParams.get("dir") || "desc";

  useEffect(() => {
    setSearch(searchParams.get("q") || "");
  }, [searchParams]);

  const qs = searchParams.toString();
  const apiUrl = `/api/detail?mode=${mode}&${qs}`;

  const { data, isLoading } = useSWR<DetailResponse>(apiUrl, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const push = useCallback(
    (params: URLSearchParams) => router.push(`/?${params.toString()}`),
    [router]
  );

  const setSort = useCallback(
    (col: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (params.get("sort") === col) {
        params.set("dir", params.get("dir") === "asc" ? "desc" : "asc");
      } else {
        params.set("sort", col);
        params.set("dir", "desc");
      }
      params.set("page", "1");
      push(params);
    },
    [searchParams, push]
  );

  const setPage = useCallback(
    (p: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", String(p));
      push(params);
    },
    [searchParams, push]
  );

  const applySearch = useCallback(
    (val: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (val.trim()) params.set("q", val.trim());
      else params.delete("q");
      params.set("page", "1");
      push(params);
    },
    [searchParams, push]
  );

  const Th = ({ col, label, right }: { col: string; label: string; right?: boolean }) => (
    <th
      className={`px-3 py-2 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${right ? "text-right" : "text-left"}`}
      onClick={() => setSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <SortIcon col={col} sort={sort} dir={dir} />
      </span>
    </th>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-3.5 pointer-events-none z-10" />
        <Input
          type="text"
          placeholder={mode === "kode_besar" ? "Search kode besar / article..." : "Search kode / article..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applySearch(e.currentTarget.value);
          }}
          className="pl-9 h-8 text-xs bg-card"
        />
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); applySearch(""); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {mode === "kode" ? (
                  <>
                    <Th col="kode" label="Kode" />
                    <Th col="article" label="Article" />
                    <Th col="series" label="Series" />
                    <Th col="gender" label="Gender" />
                    <Th col="tier" label="Tier" />
                    <Th col="pairs" label="Qty" right />
                    <Th col="revenue" label="Revenue" right />
                    <Th col="avg_price" label="ASP" right />
                  </>
                ) : (
                  <>
                    <Th col="kode_besar" label="Kode Besar" />
                    <Th col="kode" label="Kode" />
                    <Th col="article" label="Article" />
                    <Th col="size" label="Size" />
                    <Th col="color" label="Color" />
                    <Th col="tier" label="Tier" />
                    <Th col="pairs" label="Qty" right />
                    <Th col="revenue" label="Revenue" right />
                    <Th col="avg_price" label="ASP" right />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                ["a","b","c","d","e","f","g","h","i","j"].map((k) => (
                  <tr key={`skel-row-${k}`} className="border-b border-border">
                    {["c1","c2","c3","c4","c5","c6","c7","c8"].slice(0, mode === "kode" ? 8 : 9).map((cj) => (
                      <td key={`skel-${k}-${cj}`} className="px-3 py-2">
                        <div className="h-3 bg-muted animate-pulse rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : mode === "kode" ? (
                (data?.rows as KodeRow[] | undefined)?.map((r) => (
                  <tr key={r.kode} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono text-[10px] font-medium">{r.kode || "—"}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{r.article || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.series || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.gender || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.tier ? `T${r.tier}` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.pairs.toLocaleString("id-ID")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtRp(r.revenue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtRp(r.avg_price)}</td>
                  </tr>
                ))
              ) : (
                (data?.rows as KodeBesarRow[] | undefined)?.map((r) => (
                  <tr key={r.kode_besar} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono text-[10px] font-medium">{r.kode_besar || "—"}</td>
                    <td className="px-3 py-2 font-mono text-[10px]">{r.kode || "—"}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{r.article || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.size || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">{r.color || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.tier ? `T${r.tier}` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.pairs.toLocaleString("id-ID")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtRp(r.revenue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtRp(r.avg_price)}</td>
                  </tr>
                ))
              )}
              {!isLoading && !data?.rows?.length && (
                <tr>
                  <td colSpan={mode === "kode" ? 8 : 9} className="px-3 py-6 text-center text-muted-foreground">No data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{data.total.toLocaleString("id-ID")} items · Page {page} of {data.pages}</span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-2.5 py-1 rounded border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= data.pages}
              onClick={() => setPage(page + 1)}
              className="px-2.5 py-1 rounded border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
