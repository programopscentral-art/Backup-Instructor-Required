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
  states,
  isAdmin,
  current,
}: {
  universities: { value: string; label: string; state: string }[];
  states: string[];
  isAdmin: boolean;
  current: { granularity: string; from: string; to: string; university: string; state: string };
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

  // Picking a state also drops a university that doesn't belong to it.
  const setState = useCallback(
    (value: string) => {
      const p = new URLSearchParams(sp.toString());
      if (value) p.set("state", value);
      else p.delete("state");
      const selectedUni = universities.find((u) => u.value === current.university);
      if (value && selectedUni && selectedUni.state !== value) p.delete("university");
      router.push(`${pathname}?${p.toString()}`);
    },
    [sp, pathname, router, universities, current.university],
  );

  // University list narrows to the chosen state (dependent dropdown).
  const uniOptions = current.state ? universities.filter((u) => u.state === current.state) : universities;

  const hasFilters = current.from || current.to || current.university || current.state;

  // CSV export honours the current date/university/state filters (not granularity).
  const exportParams = new URLSearchParams();
  if (current.from) exportParams.set("from", current.from);
  if (current.to) exportParams.set("to", current.to);
  if (current.university) exportParams.set("university", current.university);
  if (current.state) exportParams.set("state", current.state);
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

      {/* State (admin only) */}
      {isAdmin && (
        <div className="min-w-[150px]">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--faint)]">
            State
          </label>
          <select value={current.state} onChange={(e) => setState(e.target.value)} className="input h-10">
            <option value="">All states</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* University (admin only) */}
      {isAdmin && (
        <div className="min-w-[200px]">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--faint)]">
            University {current.state && <span className="text-[color:var(--accent)]">· {current.state}</span>}
          </label>
          <select
            value={current.university}
            onChange={(e) => setParam("university", e.target.value)}
            className="input h-10"
          >
            <option value="">{current.state ? `All in ${current.state}` : "All universities"}</option>
            {uniOptions.map((u) => (
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
