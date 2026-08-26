"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X, SlidersHorizontal } from "lucide-react";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });

export interface InvoiceRow {
  id: string;
  status: "submitted" | "ops_approved" | "hod_approved" | "returned";
  amount: number | null;
  late: boolean;
  submitted_by_name: string | null;
  submitted_at: string;
  ticket_id: string | null;
  ticket_no: string | null;
  university: string | null;
  state: string | null;
  subject: string | null;
}

const INV_PILL: Record<string, string> = {
  submitted: "pill-info",
  ops_approved: "pill-accent",
  hod_approved: "pill-good",
  returned: "pill-crit",
};
const LABEL: Record<string, string> = {
  submitted: "Submitted",
  ops_approved: "Ops approved",
  hod_approved: "HOD approved",
  returned: "Returned",
};

export function InvoicesView({ invoices }: { invoices: InvoiceRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [stateF, setStateF] = useState("");
  const [uni, setUni] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "amount" | "amount_asc">("newest");

  // Distinct states + universities present in the data (university list narrows to the chosen state).
  const states = useMemo(
    () => [...new Set(invoices.map((i) => i.state).filter(Boolean) as string[])].sort(),
    [invoices],
  );
  const universities = useMemo(
    () =>
      [...new Set(invoices.filter((i) => !stateF || i.state === stateF).map((i) => i.university).filter(Boolean) as string[])].sort(),
    [invoices, stateF],
  );

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = invoices.filter((i) => {
      if (status && i.status !== status) return false;
      if (stateF && i.state !== stateF) return false;
      if (uni && i.university !== uni) return false;
      if (from && i.submitted_at.slice(0, 10) < from) return false;
      if (to && i.submitted_at.slice(0, 10) > to) return false;
      if (needle) {
        const hay = `${i.ticket_no ?? ""} ${i.university ?? ""} ${i.state ?? ""} ${i.subject ?? ""} ${i.submitted_by_name ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "amount") return (b.amount ?? 0) - (a.amount ?? 0);
      if (sort === "amount_asc") return (a.amount ?? 0) - (b.amount ?? 0);
      if (sort === "oldest") return a.submitted_at.localeCompare(b.submitted_at);
      return -a.submitted_at.localeCompare(b.submitted_at);
    });
    return out;
  }, [invoices, q, status, stateF, uni, from, to, sort]);

  const hasFilters = status || stateF || uni || from || to || q;
  const [showFilters, setShowFilters] = useState(false);
  function clearAll() {
    setQ("");
    setStatus("");
    setStateF("");
    setUni("");
    setFrom("");
    setTo("");
  }

  return (
    <div>
      <div className="mb-4 space-y-2.5">
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1 sm:flex-none">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--faint)]" />
          <input className="input !w-full !py-2 !pl-9 !text-[13px] sm:!w-52" placeholder="Search invoices…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`btn btn-sm gap-1.5 sm:hidden ${showFilters || hasFilters ? "btn-primary" : "btn-ghost"}`}
        >
          <SlidersHorizontal size={14} /> Filters
        </button>
        <span className="ml-auto shrink-0 text-xs text-[color:var(--muted)]">
          {view.length} of {invoices.length}
        </span>
      </div>
      <div className={`${showFilters ? "flex" : "hidden"} flex-wrap items-center gap-2.5 sm:flex`}>
        <select className="select !w-auto !py-2 !text-[13px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(LABEL).map((s) => (
            <option key={s} value={s}>
              {LABEL[s]}
            </option>
          ))}
        </select>
        <select
          className="select !w-auto !py-2 !text-[13px]"
          value={stateF}
          onChange={(e) => {
            setStateF(e.target.value);
            setUni(""); // reset university when state changes (dependent)
          }}
        >
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="select !w-auto !max-w-[180px] !py-2 !text-[13px]" value={uni} onChange={(e) => setUni(e.target.value)}>
          <option value="">{stateF ? `All in ${stateF}` : "All universities"}</option>
          {universities.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <input type="date" className="input !w-auto !py-2 !text-[13px]" value={from} onChange={(e) => setFrom(e.target.value)} title="Filed from" />
        <span className="text-xs text-[color:var(--faint)]">→</span>
        <input type="date" className="input !w-auto !py-2 !text-[13px]" value={to} onChange={(e) => setTo(e.target.value)} title="Filed to" />
        <select className="select !w-auto !py-2 !text-[13px]" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount">Highest amount</option>
          <option value="amount_asc">Lowest amount</option>
        </select>
        {hasFilters && (
          <button onClick={clearAll} className="btn btn-ghost btn-sm gap-1">
            <X size={13} /> Clear
          </button>
        )}
      </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>University</th>
                <th>State</th>
                <th>Subject</th>
                <th>Amount</th>
                <th>Filed by</th>
                <th>Filed on</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {view.map((i) => (
                <tr key={i.id}>
                  <td className="font-semibold">{i.ticket_no ?? "—"}</td>
                  <td className="text-[color:var(--muted)]">{i.university ?? "—"}</td>
                  <td className="text-[color:var(--muted)]">{i.state ?? "—"}</td>
                  <td>{i.subject ?? "—"}</td>
                  <td>{i.amount != null ? `₹ ${i.amount.toLocaleString("en-IN")}` : "—"}</td>
                  <td className="text-[color:var(--muted)]">{i.submitted_by_name ?? "—"}</td>
                  <td className="whitespace-nowrap text-xs text-[color:var(--faint)]">{fmtDate(i.submitted_at)}</td>
                  <td>
                    <span className={`pill ${INV_PILL[i.status]}`}>{LABEL[i.status]}</span>
                    {i.late && <span className="pill pill-crit ml-1">Late</span>}
                  </td>
                  <td className="text-right">
                    {i.ticket_id && (
                      <Link href={`/dashboard/tickets/${i.ticket_id}`} className="text-xs font-semibold text-[color:var(--accent)] hover:underline">
                        Review
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {view.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-[color:var(--faint)]">No invoices match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
