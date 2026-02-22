"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import useSWR from "swr";
import { X, ChevronDown, Check } from "lucide-react";
import { fetcher } from "@/lib/fetcher";

interface FilterOptions {
  branches: string[];
  stores: string[];
  series: string[];
  genders: string[];
  tiers: string[];
  paymentTypes: string[];
}

const FILTER_KEYS = ["from", "to", "branch", "store", "series", "gender", "tier", "payment"] as const;

function MultiSelect({
  label,
  paramKey,
  options,
}: {
  label: string;
  paramKey: string;
  options: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => {
    const val = searchParams.get(paramKey);
    return val ? val.split(",").map((v) => v.trim()).filter(Boolean) : [];
  }, [searchParams, paramKey]);

  const filteredOptions = useMemo(
    () =>
      dropdownSearch
        ? options.filter((o) => o.toLowerCase().includes(dropdownSearch.toLowerCase()))
        : options,
    [options, dropdownSearch]
  );

  const allSelected =
    filteredOptions.length > 0 && filteredOptions.every((o) => selected.includes(o));

  const push = useCallback(
    (params: URLSearchParams) => {
      params.delete("page");
      router.push(`/?${params.toString()}`);
    },
    [router]
  );

  const toggleSelectAll = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (allSelected) {
      params.delete(paramKey);
    } else {
      const merged = [...new Set([...selected, ...filteredOptions])];
      params.set(paramKey, merged.join(","));
    }
    push(params);
  }, [searchParams, paramKey, selected, filteredOptions, allSelected, push]);

  const toggleOption = useCallback(
    (opt: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const next = selected.includes(opt)
        ? selected.filter((v) => v !== opt)
        : [...selected, opt];
      if (next.length === 0) params.delete(paramKey);
      else params.set(paramKey, next.join(","));
      push(params);
    },
    [searchParams, selected, paramKey, push]
  );

  const clearFilter = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(paramKey);
    push(params);
  }, [searchParams, paramKey, push]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setDropdownSearch("");
    } else {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open]);

  const labelText =
    selected.length === 0
      ? label
      : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border bg-card text-card-foreground hover:bg-muted transition-colors whitespace-nowrap
          ${selected.length > 0 ? "border-[#00E273]" : "border-border"}`}
      >
        <span className="truncate">{labelText}</span>
        <ChevronDown
          className={`size-3.5 flex-shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] w-max max-w-[240px] rounded-md border border-border bg-card shadow-lg">
          <div className="p-1.5 border-b border-border">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search..."
              value={dropdownSearch}
              onChange={(e) => setDropdownSearch(e.target.value)}
              className="w-full text-xs px-2 py-1 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground outline-none focus:border-[#00E273]"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filteredOptions.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors border-b border-border"
              >
                <span
                  className={`size-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors
                    ${allSelected ? "bg-[#00E273] border-[#00E273]" : "border-border bg-background"}`}
                >
                  {allSelected && <Check className="size-2.5 text-black stroke-[3]" />}
                </span>
                <span className="text-muted-foreground">Select All</span>
              </button>
            )}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={clearFilter}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors border-b border-border"
              >
                <X className="size-3" />
                Clear {label}
              </button>
            )}
            {filteredOptions.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No results</p>
            )}
            {filteredOptions.map((opt) => {
              const checked = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleOption(opt)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
                >
                  <span
                    className={`size-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors
                      ${checked ? "bg-[#00E273] border-[#00E273]" : "border-border bg-background"}`}
                  >
                    {checked && <Check className="size-2.5 text-black stroke-[3]" />}
                  </span>
                  <span className="truncate">{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = new Date().toISOString().substring(0, 10);
  const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10);

  const fromVal = searchParams.get("from") || defaultFrom;
  const toVal = searchParams.get("to") || today;

  const filterQs = searchParams.toString();
  const { data: opts } = useSWR<FilterOptions>(
    `/api/filter-options${filterQs ? `?${filterQs}` : ""}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300000, keepPreviousData: true }
  );

  const setDate = useCallback(
    (key: "from" | "to", val: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (val) params.set(key, val);
      else params.delete(key);
      params.delete("page");
      router.push(`/?${params.toString()}`);
    },
    [router, searchParams]
  );

  const resetAll = useCallback(() => {
    router.push("/");
  }, [router]);

  const hasFilters = FILTER_KEYS.some((k) => searchParams.has(k));

  return (
    <div className="flex gap-1.5 items-center w-full flex-wrap">
      <div className="flex items-center gap-1 flex-shrink-0">
        <label htmlFor="filter-from" className="text-xs text-muted-foreground font-medium">From</label>
        <input
          id="filter-from"
          type="date"
          value={fromVal}
          onChange={(e) => setDate("from", e.target.value)}
          className="text-xs px-2 py-1.5 rounded-md border border-border bg-card text-foreground outline-none focus:border-[#00E273] cursor-pointer"
        />
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <label htmlFor="filter-to" className="text-xs text-muted-foreground font-medium">To</label>
        <input
          id="filter-to"
          type="date"
          value={toVal}
          onChange={(e) => setDate("to", e.target.value)}
          className="text-xs px-2 py-1.5 rounded-md border border-border bg-card text-foreground outline-none focus:border-[#00E273] cursor-pointer"
        />
      </div>
      <div className="flex-1 min-w-[90px]">
        <MultiSelect label="BRANCH" paramKey="branch" options={opts?.branches || []} />
      </div>
      <div className="flex-1 min-w-[90px]">
        <MultiSelect label="STORE" paramKey="store" options={opts?.stores || []} />
      </div>
      <div className="flex-1 min-w-[80px]">
        <MultiSelect label="SERIES" paramKey="series" options={opts?.series || []} />
      </div>
      <div className="flex-1 min-w-[80px]">
        <MultiSelect label="GENDER" paramKey="gender" options={opts?.genders || []} />
      </div>
      <div className="flex-1 min-w-[70px]">
        <MultiSelect label="TIER" paramKey="tier" options={opts?.tiers || []} />
      </div>
      <div className="flex-1 min-w-[100px]">
        <MultiSelect label="PAYMENT" paramKey="payment" options={opts?.paymentTypes || []} />
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={resetAll}
          className="flex-shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-md bg-secondary text-secondary-foreground border border-border hover:bg-muted transition-colors cursor-pointer flex items-center gap-1"
        >
          <X className="size-3" />
          Reset
        </button>
      )}
    </div>
  );
}
