"use client";

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

export default function StoreTable({ stores, loading }: { stores?: StoreRow[]; loading?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Store Performance</h3>
      </div>
      <div className="overflow-x-auto">
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
              Array.from({ length: 8 }, (_, i) => (
                <tr key={`skel-row-${i}`} className="border-b border-border">
                  {["a","b","c","d","e","f","g","h"].map((col) => (
                    <td key={col} className="px-3 py-2">
                      <div className="h-3 bg-muted animate-pulse rounded w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : stores?.length ? (
              stores.map((s) => (
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
    </div>
  );
}
