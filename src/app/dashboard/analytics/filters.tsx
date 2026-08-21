"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { X, Download } from "lucide-react";

const GRANS: [string, string][] = [
  ["day", "Day"],
  ["week", "Week"],
  ["month", "Month"],
  ["year", "Year"],
];

export function AnalyticsFilters({
  universities,
  isAdmin,
  current,
}: {
  universities: { value: string; label: string }[];
  isAdmin: boolean;
  current: { granularity: string; from: string; to: string; university: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(sp.toString());
      if (value) p.set(key, value);
      else p.delete(key);
      router.push(`${pathname}?${p.toString()}`);
    },
    [sp, pathname, router],
  );

  const hasFilters = current.from || current.to || current.university;

  // CSV export honours the current date/university filters (not granularity).
  const exportParams = new URLSearchParams();
  if (current.from) exportParams.set("from", current.from);
  if (current.to) exportParams.set("to", current.to);
  if (current.university) exportParams.set("university", current.university);
  const exportHref = `/dashboard/analytics/export${exportParams.toString() ? `?${exportParams}` : ""}`;

  return (
    <div className="card mb-6 flex flex-wrap items-end gap-4 p-4">
      {/* Granularity */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--faint)]">
          Group by
        </label>
        <div className="inline-flex rounded-xl border border-[color:var(--line-2)] bg-[color:var(--cream)] p-1">
          {GRANS.map(([v, label]) => {
            const active = current.granularity === v;
            return (
              <button
                key={v}
                onClick={() => setParam("granularity", v)}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--muted)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date range */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--faint)]">
          From
        </label>
        <input
          type="date"
          value={current.from}
          onChange={(e) => setParam("from", e.target.value)}
          className="input h-10"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--faint)]">
          To
        </label>
        <input
          type="date"
          value={current.to}
          onChange={(e) => setParam("to", e.target.value)}
          className="input h-10"
        />
      </div>

      {/* University (admin only) */}
      {isAdmin && (
        <div className="min-w-[200px]">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--faint)]">
            University
          </label>
          <select
            value={current.university}
            onChange={(e) => setParam("university", e.target.value)}
            className="input h-10"
          >
            <option value="">All universities</option>
            {universities.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {hasFilters && (
        <button
          onClick={() => router.push(pathname)}
          className="btn btn-ghost btn-sm mb-0.5 gap-1.5"
        >
          <X size={14} /> Clear
        </button>
      )}

      <a href={exportHref} className="btn btn-primary btn-sm mb-0.5 ml-auto gap-1.5" download>
        <Download size={14} /> Export CSV
      </a>
    </div>
  );
}
