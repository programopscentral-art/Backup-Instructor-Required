"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Search, Pencil, Trash2, Check, X, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable, type Row } from "@/lib/directory/useRealtimeTable";

export interface Column {
  key: string;
  label: string;
  type?: "text" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  pill?: boolean;
}

interface Props {
  table: string;
  columns: Column[];
  initial: Row[];
  canWrite: boolean;
  defaults?: Record<string, unknown>;
  labelMaps?: Record<string, Record<string, string>>;
  searchKeys?: string[];
}

function emptyDraft(columns: Column[]): Record<string, string> {
  return Object.fromEntries(columns.map((c) => [c.key, ""]));
}

export function DirectoryTable({
  table,
  columns,
  initial,
  canWrite,
  defaults = {},
  labelMaps = {},
  searchKeys,
}: Props) {
  const { rows } = useRealtimeTable(table, initial);
  const supabase = createClient();

  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(emptyDraft(columns));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keys = searchKeys ?? columns.map((c) => c.key);

  // The user-visible string for a cell (resolves FK label maps + select labels).
  function displayString(col: Column, row: Row): string {
    const raw = row[col.key];
    if (raw == null || raw === "") return "";
    const map = labelMaps[col.key];
    if (map && map[raw as string]) return map[raw as string];
    if (col.type === "select") return col.options?.find((o) => o.value === raw)?.label ?? String(raw);
    return String(raw);
  }

  const filterable = columns.filter((c) => c.type === "select" || labelMaps[c.key]);

  // Distinct display values per filterable column.
  const filterValues = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of filterable) {
      const set = new Set<string>();
      for (const r of rows) {
        const v = displayString(c, r);
        if (v) set.add(v);
      }
      out[c.key] = Array.from(set).sort((a, b) => a.localeCompare(b));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (needle && !keys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle))) return false;
      for (const [key, val] of Object.entries(filters)) {
        if (!val) continue;
        const col = columns.find((c) => c.key === key);
        if (col && displayString(col, r) !== val) return false;
      }
      return true;
    });
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col) {
        out = [...out].sort((a, b) => {
          const av = displayString(col, a);
          const bv = displayString(col, b);
          const an = Number(av);
          const bn = Number(bv);
          const cmp =
            !isNaN(an) && !isNaN(bn) && av !== "" && bv !== ""
              ? an - bn
              : av.localeCompare(bv);
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, filters, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function cleaned(d: Record<string, string>) {
    const out: Record<string, unknown> = {};
    for (const c of columns) {
      const v = (d[c.key] ?? "").trim();
      out[c.key] = v === "" ? null : v;
    }
    return out;
  }
  function missing(d: Record<string, string>) {
    return columns.filter((c) => c.required && !d[c.key]?.trim()).map((c) => c.label);
  }
  async function saveNew() {
    const m = missing(draft);
    if (m.length) return setError(`Required: ${m.join(", ")}`);
    setBusy(true);
    setError(null);
    const { error } = await supabase.from(table).insert({ ...cleaned(draft), ...defaults });
    setBusy(false);
    if (error) return setError(error.message);
    setDraft(emptyDraft(columns));
    setAdding(false);
  }
  function startEdit(row: Row) {
    setEditingId(row.id);
    setEditDraft(Object.fromEntries(columns.map((c) => [c.key, (row[c.key] ?? "").toString()])));
    setError(null);
  }
  async function saveEdit(id: string) {
    const m = missing(editDraft);
    if (m.length) return setError(`Required: ${m.join(", ")}`);
    setBusy(true);
    setError(null);
    const { error } = await supabase.from(table).update(cleaned(editDraft)).eq("id", id);
    setBusy(false);
    if (error) return setError(error.message);
    setEditingId(null);
  }
  async function remove(id: string) {
    if (!confirm("Delete this record?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) setError(error.message);
  }

  function cell(col: Column, row: Row) {
    const raw = row[col.key];
    if (raw == null || raw === "") return <span className="text-[color:var(--faint)]">—</span>;
    const text = displayString(col, row);
    if (col.pill) return <span className="pill pill-muted">{text}</span>;
    return text;
  }

  function field(col: Column, value: string, onChange: (v: string) => void) {
    if (col.type === "select") {
      return (
        <select className="select !py-1.5 !text-[13px]" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {col.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        className="input !py-1.5 !text-[13px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={col.placeholder ?? "Add text here…"}
      />
    );
  }

  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--faint)]" />
          <input
            className="input !w-64 !py-2 !pl-9 !text-[13px]"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Filter dropdowns for FK / select columns */}
        {filterable.map((c) => (
          <select
            key={c.key}
            className="select !w-auto !py-2 !text-[13px]"
            value={filters[c.key] ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
          >
            <option value="">All {c.label}</option>
            {(filterValues[c.key] ?? []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ))}

        <div className="ml-auto flex items-center gap-3">
          {(activeFilters > 0 || q || sortKey) && (
            <button
              onClick={() => {
                setQ("");
                setFilters({});
                setSortKey(null);
              }}
              className="text-xs font-medium text-[color:var(--muted)] hover:text-[color:var(--accent)]"
            >
              Clear
            </button>
          )}
          <span className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
            <span className="dot-live" /> {view.length} of {rows.length}
          </span>
          {canWrite && !adding && (
            <button
              onClick={() => {
                setAdding(true);
                setDraft(emptyDraft(columns));
                setError(null);
              }}
              className="btn btn-primary btn-sm"
            >
              <Plus size={15} /> Add
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">
          {error}
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                {columns.map((c) => {
                  const active = sortKey === c.key;
                  return (
                    <th key={c.key}>
                      <button
                        onClick={() => toggleSort(c.key)}
                        className="inline-flex items-center gap-1 transition-colors hover:text-[color:var(--accent)]"
                        style={{ color: active ? "var(--accent)" : undefined }}
                      >
                        {c.label}
                        {c.required && <span className="text-[color:var(--rose)]">*</span>}
                        {active ? (
                          sortDir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                        ) : (
                          <ChevronsUpDown size={13} className="opacity-40" />
                        )}
                      </button>
                    </th>
                  );
                })}
                {canWrite && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {adding && (
                  <motion.tr
                    initial={{ opacity: 0, backgroundColor: "rgba(153,27,27,0.08)" }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ background: "rgba(153,27,27,0.04)" }}
                  >
                    {columns.map((c) => (
                      <td key={c.key}>
                        {field(c, draft[c.key] ?? "", (v) => setDraft((d) => ({ ...d, [c.key]: v })))}
                      </td>
                    ))}
                    <td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={saveNew} disabled={busy} className="btn btn-primary btn-sm">
                          <Check size={14} /> Save
                        </button>
                        <button onClick={() => setAdding(false)} className="btn btn-ghost btn-sm">
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                )}
              </AnimatePresence>

              {view.map((row) => {
                const editing = editingId === row.id;
                return (
                  <tr key={row.id}>
                    {columns.map((c) => (
                      <td key={c.key}>
                        {editing
                          ? field(c, editDraft[c.key] ?? "", (v) => setEditDraft((d) => ({ ...d, [c.key]: v })))
                          : cell(c, row)}
                      </td>
                    ))}
                    {canWrite && (
                      <td className="text-right">
                        <div className="flex justify-end gap-1.5">
                          {editing ? (
                            <>
                              <button onClick={() => saveEdit(row.id)} disabled={busy} className="btn btn-primary btn-sm">
                                <Check size={14} />
                              </button>
                              <button onClick={() => setEditingId(null)} className="btn btn-ghost btn-sm">
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(row)} className="btn btn-ghost btn-sm" title="Edit">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => remove(row.id)} className="btn btn-danger btn-sm" title="Delete">
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {view.length === 0 && !adding && (
                <tr>
                  <td colSpan={columns.length + (canWrite ? 1 : 0)} className="py-12 text-center text-sm text-[color:var(--faint)]">
                    {q || activeFilters ? "No matches." : "No records yet."}
                    {!q && !activeFilters && canWrite && " Click “Add” to create the first one."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
