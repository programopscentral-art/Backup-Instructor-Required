"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Ticket,
  FolderOpen,
  CheckCircle2,
  MapPin,
  AlertTriangle,
  Timer,
  X,
  ChevronRight,
  Wallet,
  Building2,
  Map as MapIcon,
  User,
  Plane,
  BedDouble,
  Plus,
  Receipt,
} from "lucide-react";
import { STATUS_META, MODE_LABEL, type TicketStatus, type TicketMode } from "@/lib/tickets/status";
import { fmtIST } from "@/lib/format";

export interface ARow {
  id: string;
  ticket_no: string;
  status: TicketStatus;
  mode: TicketMode;
  reason: string | null;
  university: string;
  state: string;
  subject: string;
  absent: string | null;
  backup: string | null;
  created_at: string;
  red_flag: boolean;
  amount: number;
  travel: number;
  accommodation: number;
  other: number;
  daysToClose: number | null;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

interface Kpi {
  label: string;
  value: string;
  rows: ARow[];
  icon: React.ReactNode;
  rgb: string;
  hint?: string;
}

export function AnalyticsInteractive({ rows, view }: { rows: ARow[]; view: "tickets" | "budget" }) {
  const [drill, setDrill] = useState<{ title: string; rows: ARow[] } | null>(null);

  const closedRows = rows.filter((r) => r.status === "closed");
  const openRows = rows.filter((r) => r.status !== "closed" && r.status !== "cancelled");
  const offlineRows = rows.filter((r) => r.mode === "offline");
  const onlineCount = rows.filter((r) => r.mode === "online").length;
  const redRows = rows.filter((r) => r.red_flag);
  const measured = closedRows.filter((r) => r.daysToClose != null);
  const avg = measured.length ? measured.reduce((s, r) => s + (r.daysToClose ?? 0), 0) / measured.length : 0;
  const avgLabel = measured.length ? (avg >= 1 ? `${avg.toFixed(1)}d` : `${Math.round(avg * 24)}h`) : "—";

  // Budget stats
  const spentRows = rows.filter((r) => r.amount > 0);
  const totalSpend = rows.reduce((s, r) => s + r.amount, 0);
  const travelSum = rows.reduce((s, r) => s + r.travel, 0);
  const accomSum = rows.reduce((s, r) => s + r.accommodation, 0);
  const otherSum = rows.reduce((s, r) => s + r.other, 0);
  const avgPerClaim = spentRows.length ? totalSpend / spentRows.length : 0;

  const ticketKpis: Kpi[] = [
    { label: "Total tickets", value: String(rows.length), rows, icon: <Ticket size={20} />, rgb: "180,83,9" },
    { label: "Open", value: String(openRows.length), rows: openRows, icon: <FolderOpen size={20} />, rgb: "37,99,235" },
    { label: "Closed", value: String(closedRows.length), rows: closedRows, icon: <CheckCircle2 size={20} />, rgb: "4,120,87" },
    { label: "Offline", value: String(offlineRows.length), rows: offlineRows, icon: <MapPin size={20} />, rgb: "109,40,217", hint: `${onlineCount} online` },
    { label: "Red flags", value: String(redRows.length), rows: redRows, icon: <AlertTriangle size={20} />, rgb: "225,29,72" },
    { label: "Avg time to close", value: avgLabel, rows: measured, icon: <Timer size={20} />, rgb: "202,138,4", hint: measured.length ? `${measured.length} closed` : undefined },
  ];

  const budgetKpis: Kpi[] = [
    { label: "Total spend", value: inr(totalSpend), rows: spentRows, icon: <Wallet size={20} />, rgb: "180,83,9" },
    { label: "Travel", value: inr(travelSum), rows: spentRows.filter((r) => r.travel > 0), icon: <Plane size={20} />, rgb: "37,99,235" },
    { label: "Accommodation", value: inr(accomSum), rows: spentRows.filter((r) => r.accommodation > 0), icon: <BedDouble size={20} />, rgb: "109,40,217" },
    { label: "Other", value: inr(otherSum), rows: spentRows.filter((r) => r.other > 0), icon: <Plus size={20} />, rgb: "4,120,87" },
    { label: "Claims", value: String(spentRows.length), rows: spentRows, icon: <Receipt size={20} />, rgb: "225,29,72" },
    { label: "Avg / claim", value: inr(avgPerClaim), rows: spentRows, icon: <Timer size={20} />, rgb: "202,138,4" },
  ];

  const kpis = view === "budget" ? budgetKpis : ticketKpis;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {kpis.map((k) => (
          <button
            key={k.label}
            onClick={() => setDrill({ title: k.label, rows: k.rows })}
            className="card card-hover relative overflow-hidden p-5 text-left transition-transform hover:-translate-y-0.5"
            style={{ ["--rgb" as string]: k.rgb }}
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl" style={{ background: `rgba(${k.rgb},0.18)` }} />
            <div className="flex items-start justify-between">
              <div className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `rgba(${k.rgb},0.14)`, color: `rgb(${k.rgb})` }}>
                {k.icon}
              </div>
              {k.hint && <span className="pill pill-muted">{k.hint}</span>}
            </div>
            <div className="mt-4">
              <div className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[color:var(--ink)]">{k.value}</div>
              <div className="mt-1 flex items-center gap-1 text-sm text-[color:var(--muted)]">
                {k.label} <ChevronRight size={13} className="text-[color:var(--faint)]" />
              </div>
            </div>
          </button>
        ))}
      </div>

      {view === "budget" ? (
        <BudgetExplorer rows={rows} totalSpend={totalSpend} onDrill={(title, rs) => setDrill({ title, rows: rs })} />
      ) : (
        <AbsenceExplorer rows={rows} onDrill={(title, rs) => setDrill({ title, rows: rs })} />
      )}

      {drill && <DrillTable title={drill.title} rows={drill.rows} onClose={() => setDrill(null)} />}
    </>
  );
}

/* ---------------- Budget explorer ---------------- */

type Tab = "university" | "state" | "backup";

interface Group {
  key: string;
  amount: number;
  travel: number;
  accommodation: number;
  other: number;
  count: number;
  rows: ARow[];
}

function group(rows: ARow[], keyOf: (r: ARow) => string): Group[] {
  const m = new Map<string, Group>();
  for (const r of rows) {
    const key = keyOf(r) || "—";
    let g = m.get(key);
    if (!g) {
      g = { key, amount: 0, travel: 0, accommodation: 0, other: 0, count: 0, rows: [] };
      m.set(key, g);
    }
    g.amount += r.amount;
    g.travel += r.travel;
    g.accommodation += r.accommodation;
    g.other += r.other;
    g.count += 1;
    g.rows.push(r);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

function BudgetExplorer({
  rows,
  totalSpend,
  onDrill,
}: {
  rows: ARow[];
  totalSpend: number;
  onDrill: (title: string, rows: ARow[]) => void;
}) {
  const [tab, setTab] = useState<Tab>("university");
  const [open, setOpen] = useState<string | null>(null);

  // Only tickets with an actual claim contribute to budget.
  const spent = useMemo(() => rows.filter((r) => r.amount > 0), [rows]);
  const groups = useMemo(() => {
    const keyOf =
      tab === "university" ? (r: ARow) => r.university : tab === "state" ? (r: ARow) => r.state : (r: ARow) => r.backup ?? "Unassigned";
    return group(spent, keyOf);
  }, [spent, tab]);
  const maxAmt = Math.max(...groups.map((g) => g.amount), 1);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "university", label: "By University", icon: <Building2 size={14} /> },
    { id: "state", label: "By State", icon: <MapIcon size={14} /> },
    { id: "backup", label: "By Backup", icon: <User size={14} /> },
  ];

  const totals = spent.reduce(
    (s, r) => ({ travel: s.travel + r.travel, accommodation: s.accommodation + r.accommodation, other: s.other + r.other }),
    { travel: 0, accommodation: 0, other: 0 },
  );

  return (
    <div className="card mt-6 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold">
          <Wallet size={17} className="text-[color:var(--accent)]" /> Budget spend
        </h2>
        <div className="text-right">
          <p className="font-[family-name:var(--font-display)] text-lg font-bold">{inr(totalSpend)}</p>
          <p className="text-[11px] text-[color:var(--faint)]">
            ✈️ {inr(totals.travel)} · 🏨 {inr(totals.accommodation)} · ➕ {inr(totals.other)}
          </p>
        </div>
      </div>

      <div className="mb-4 -mx-1 overflow-x-auto px-1">
        <div className="inline-flex w-max rounded-full border border-[color:var(--line-2)] bg-[color:var(--cream)] p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setOpen(null);
              }}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                tab === t.id ? "bg-white text-[color:var(--accent)] shadow-sm" : "text-[color:var(--muted)]"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-[color:var(--faint)]">No spend recorded in this range yet.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => {
            const expanded = open === g.key;
            // Sub-level: University → its backups; State → its universities; Backup → (none, drills straight to tickets).
            const sub =
              tab === "university"
                ? group(g.rows, (r) => r.backup ?? "Unassigned")
                : tab === "state"
                  ? group(g.rows, (r) => r.university)
                  : null;
            return (
              <li key={g.key} className="rounded-xl border border-[color:var(--line-2)]">
                <button
                  onClick={() => (tab === "backup" ? onDrill(`${g.key} · backup`, g.rows) : setOpen(expanded ? null : g.key))}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-[color:var(--ink)]">{g.key}</span>
                      <span className="shrink-0 text-sm font-bold text-[color:var(--ink)]">{inr(g.amount)}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[color:var(--cream-2)]">
                      <div className="h-full rounded-full" style={{ width: `${(g.amount / maxAmt) * 100}%`, background: "var(--accent)" }} />
                    </div>
                    <p className="mt-1 text-[11px] text-[color:var(--faint)]">
                      {g.count} ticket{g.count > 1 ? "s" : ""} · ✈️ {inr(g.travel)} · 🏨 {inr(g.accommodation)} · ➕ {inr(g.other)}
                    </p>
                  </div>
                  {tab !== "backup" && (
                    <ChevronRight size={16} className="shrink-0 text-[color:var(--faint)] transition-transform" style={{ transform: expanded ? "rotate(90deg)" : "none" }} />
                  )}
                </button>
                {expanded && sub && (
                  <ul className="border-t border-[color:var(--line-2)] bg-[color:var(--cream)] p-1.5">
                    {sub.map((s) => (
                      <li key={s.key}>
                        <button
                          onClick={() => onDrill(`${g.key} → ${s.key}`, s.rows)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-white"
                        >
                          <span className="flex items-center gap-2 truncate">
                            {tab === "university" ? <User size={13} className="text-[color:var(--faint)]" /> : <Building2 size={13} className="text-[color:var(--faint)]" />}
                            <span className="truncate">{s.key}</span>
                          </span>
                          <span className="shrink-0 font-semibold">{inr(s.amount)} <span className="text-xs font-normal text-[color:var(--faint)]">· {s.count}</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Absence & coverage explorer (tickets tab) ---------------- */
// State → University → Absent instructor. Shows who's absent most, who covered
// them, and the budget spent — the end-to-end absence view.

function AbsenceExplorer({ rows, onDrill }: { rows: ARow[]; onDrill: (title: string, rows: ARow[]) => void }) {
  const [mode, setMode] = useState<"tree" | "top">("tree");
  const [openState, setOpenState] = useState<string | null>(null);
  const [openUni, setOpenUni] = useState<string | null>(null);

  const states = useMemo(() => group(rows, (r) => r.state).sort((a, b) => b.count - a.count), [rows]);
  const maxCount = Math.max(...states.map((g) => g.count), 1);

  // Flat ranking of absent instructors across all states/universities (top 30).
  const topAbsentees = useMemo(
    () =>
      group(rows.filter((r) => r.absent), (r) => `${r.absent}||${r.university}`)
        .sort((a, b) => b.count - a.count)
        .slice(0, 30),
    [rows],
  );
  const maxTop = Math.max(...topAbsentees.map((g) => g.count), 1);

  if (rows.length === 0) {
    return (
      <div className="card mt-6 p-6">
        <p className="text-sm text-[color:var(--faint)]">No tickets in this range.</p>
      </div>
    );
  }

  return (
    <div className="card mt-6 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold">
            <MapIcon size={17} className="text-[color:var(--accent)]" /> Absence &amp; coverage
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">Who&apos;s absent most, who covered, and the spend.</p>
        </div>
        <div className="-mx-1 max-w-full overflow-x-auto px-1">
          <div className="inline-flex w-max rounded-full border border-[color:var(--line-2)] bg-[color:var(--cream)] p-1">
            <button onClick={() => setMode("tree")} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${mode === "tree" ? "bg-white text-[color:var(--accent)] shadow-sm" : "text-[color:var(--muted)]"}`}>
              State → Uni → Instructor
            </button>
            <button onClick={() => setMode("top")} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${mode === "top" ? "bg-white text-[color:var(--accent)] shadow-sm" : "text-[color:var(--muted)]"}`}>
              Top absentees
            </button>
          </div>
        </div>
      </div>

      {mode === "top" ? (
        <ol className="space-y-1.5">
          {topAbsentees.length === 0 ? (
            <p className="text-sm text-[color:var(--faint)]">No absences recorded in this range.</p>
          ) : (
            topAbsentees.map((g, i) => {
              const r0 = g.rows[0];
              const backups = [...new Set(g.rows.map((r) => r.backup).filter(Boolean))] as string[];
              return (
                <li key={g.key}>
                  <button
                    onClick={() => onDrill(`${r0.absent} · ${r0.university}`, g.rows)}
                    className="flex w-full items-center gap-3 rounded-xl border border-[color:var(--line-2)] px-3.5 py-2.5 text-left transition-colors hover:bg-[color:var(--cream)]"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[color:var(--accent-soft)] text-xs font-bold text-[color:var(--accent)]">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-[color:var(--ink)]">{r0.absent}</span>
                        <span className="shrink-0 text-sm font-bold">
                          {g.count} <span className="text-xs font-normal text-[color:var(--faint)]">absent</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--cream-2)]">
                        <div className="h-full rounded-full" style={{ width: `${(g.count / maxTop) * 100}%`, background: "var(--accent)" }} />
                      </div>
                      <p className="mt-1 truncate text-[11px] text-[color:var(--faint)]">
                        {r0.university} · {r0.state}
                        {backups.length ? ` · covered by ${backups.join(", ")}` : ""}
                        {g.amount > 0 ? ` · ${inr(g.amount)}` : ""}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ol>
      ) : (
      <ul className="space-y-2">
        {states.map((st) => {
          const stOpen = openState === st.key;
          const unis = group(st.rows, (r) => r.university).sort((a, b) => b.count - a.count);
          return (
            <li key={st.key} className="rounded-xl border border-[color:var(--line-2)]">
              <button
                onClick={() => {
                  setOpenState(stOpen ? null : st.key);
                  setOpenUni(null);
                }}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
              >
                <ChevronRight size={16} className="shrink-0 text-[color:var(--faint)] transition-transform" style={{ transform: stOpen ? "rotate(90deg)" : "none" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold text-[color:var(--ink)]">{st.key}</span>
                    <span className="shrink-0 text-sm font-semibold text-[color:var(--ink)]">
                      {st.count} <span className="text-xs font-normal text-[color:var(--faint)]">absences</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[color:var(--cream-2)]">
                    <div className="h-full rounded-full" style={{ width: `${(st.count / maxCount) * 100}%`, background: "var(--accent)" }} />
                  </div>
                  <p className="mt-1 text-[11px] text-[color:var(--faint)]">{unis.length} universities · {inr(st.amount)} spend</p>
                </div>
              </button>

              {stOpen && (
                <ul className="border-t border-[color:var(--line-2)] bg-[color:var(--cream)] p-1.5">
                  {unis.map((u) => {
                    const uKey = `${st.key}||${u.key}`;
                    const uOpen = openUni === uKey;
                    const instrs = group(u.rows, (r) => r.absent ?? "Unknown").sort((a, b) => b.count - a.count);
                    return (
                      <li key={uKey} className="rounded-lg">
                        <button
                          onClick={() => setOpenUni(uOpen ? null : uKey)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white"
                        >
                          <ChevronRight size={14} className="shrink-0 text-[color:var(--faint)] transition-transform" style={{ transform: uOpen ? "rotate(90deg)" : "none" }} />
                          <Building2 size={13} className="shrink-0 text-[color:var(--faint)]" />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{u.key}</span>
                          <span className="shrink-0 text-xs text-[color:var(--muted)]">
                            {u.count} · {inr(u.amount)}
                          </span>
                        </button>
                        {uOpen && (
                          <ul className="ml-4 border-l border-[color:var(--line-2)] pl-2">
                            {instrs.map((ins) => {
                              const backups = [...new Set(ins.rows.map((r) => r.backup).filter(Boolean))] as string[];
                              return (
                                <li key={ins.key}>
                                  <button
                                    onClick={() => onDrill(`${u.key} → ${ins.key}`, ins.rows)}
                                    className="flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white"
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="flex items-center gap-1.5">
                                        <User size={12} className="shrink-0 text-[color:var(--faint)]" />
                                        <span className="truncate text-sm font-medium">{ins.key}</span>
                                        <span className="pill pill-muted shrink-0 !py-0 !text-[10px]">{ins.count} absent</span>
                                      </span>
                                      <span className="mt-0.5 block truncate text-[11px] text-[color:var(--faint)]">
                                        {backups.length ? `Covered by: ${backups.join(", ")}` : "No backup assigned yet"}
                                      </span>
                                    </span>
                                    {ins.amount > 0 && <span className="shrink-0 text-xs font-semibold text-[color:var(--ink)]">{inr(ins.amount)}</span>}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}

/* ---------------- Drill-down table ---------------- */

function DrillTable({ title, rows, onClose }: { title: string; rows: ARow[]; onClose: () => void }) {
  const spend = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color:var(--line)] bg-white shadow-[var(--shadow)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] bg-[color:var(--cream)] px-5 py-3.5">
          <div className="min-w-0">
            <p className="truncate font-[family-name:var(--font-display)] text-base font-bold">{title}</p>
            <p className="text-xs text-[color:var(--faint)]">
              {rows.length} ticket{rows.length !== 1 ? "s" : ""}
              {spend > 0 ? ` · ${inr(spend)} spend` : ""}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--faint)] hover:bg-[color:var(--cream-2)] hover:text-[color:var(--ink)]">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[color:var(--faint)]">No tickets.</p>
          ) : (
            <table className="w-full min-w-[680px] text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[color:var(--line-2)] text-left text-[11px] uppercase tracking-wide text-[color:var(--faint)]">
                  <th className="px-4 py-2.5 font-semibold">Ticket</th>
                  <th className="px-2 py-2.5 font-semibold">Subject · University</th>
                  <th className="px-2 py-2.5 font-semibold">Absent</th>
                  <th className="px-2 py-2.5 font-semibold">Status</th>
                  <th className="px-2 py-2.5 font-semibold">Mode</th>
                  <th className="px-2 py-2.5 font-semibold">Backup</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-4 py-2.5 font-semibold">Raised</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[color:var(--line-2)] hover:bg-[color:var(--cream)]">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/tickets/${r.id}`} className="font-semibold text-[color:var(--accent)] hover:underline">
                        {r.ticket_no}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="block truncate">{r.subject}</span>
                      <span className="block truncate text-xs text-[color:var(--faint)]">{r.university}</span>
                    </td>
                    <td className="px-2 py-2.5 text-[color:var(--muted)]">{r.absent ?? "—"}</td>
                    <td className="px-2 py-2.5">
                      <span className={`pill ${STATUS_META[r.status]?.pill ?? "pill-muted"}`}>{STATUS_META[r.status]?.label ?? r.status}</span>
                    </td>
                    <td className="px-2 py-2.5 text-[color:var(--muted)]">{MODE_LABEL[r.mode]}</td>
                    <td className="px-2 py-2.5 text-[color:var(--muted)]">{r.backup ?? "—"}</td>
                    <td className="px-2 py-2.5 text-right font-semibold">{r.amount > 0 ? inr(r.amount) : "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-[color:var(--faint)]">{fmtIST(r.created_at, { dateStyle: "medium" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
