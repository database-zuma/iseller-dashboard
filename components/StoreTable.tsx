"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface StoreRow {
  toko: string;
  branch: string;
  pairs: number;
  revenue: number;
  transactions: number;
  atu: number;
  asp: number;
  atv: number;
}

function fmtRp(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

const ROWS_PER_PAGE = 10;

export default function StoreTable({ stores, loading }: { stores?: StoreRow[]; loading?: boolean }) {
  const [page, setPage] = useState(1);
  
  const totalRows = stores?.length ?? 0;
  const totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);
  
  const currentRows = stores?.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE) ?? [];

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Store Performance</h3>
        {!loading && totalRows > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {totalRows} stores · Page {page} of {totalPages}
          </span>
        )}
      </div>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Store</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Branch</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qty</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Revenue</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Txn</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">ATU</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">ASP</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">ATV</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              ["r1","r2","r3","r4","r5","r6","r7","r8"].map((rk) => (
                <tr key={rk} className="border-b border-border">
                  {["a","b","c","d","e","f","g","h"].map((col) => (
                    <td key={col} className="px-3 py-2">
                      <div className="h-3 bg-muted animate-pulse rounded w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : currentRows.length ? (
              currentRows.map((s) => (
                <tr key={s.toko} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-medium text-foreground max-w-[180px] truncate">{s.toko}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.branch || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Math.round(s.pairs).toLocaleString("id-ID")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtRp(s.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.transactions.toLocaleString("id-ID")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.atu.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtRp(s.asp)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtRp(s.atv)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No data</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="px-4 py-2 border-t border-border flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="size-3" />
            Prev
          </button>
          <span className="text-[10px] text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ChevronRight className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}
