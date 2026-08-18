"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

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
  const [sort, setSort] = useState<"newest" | "amount">("newest");

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = invoices.filter((i) => {
      if (status && i.status !== status) return false;
      if (needle) {
        const hay = `${i.ticket_no ?? ""} ${i.university ?? ""} ${i.subject ?? ""} ${i.submitted_by_name ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) =>
      sort === "amount" ? (b.amount ?? 0) - (a.amount ?? 0) : -a.submitted_at.localeCompare(b.submitted_at),
    );
    return out;
  }, [invoices, q, status, sort]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--faint)]" />
          <input className="input !w-56 !py-2 !pl-9 !text-[13px]" placeholder="Search invoices…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select !w-auto !py-2 !text-[13px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(LABEL).map((s) => (
            <option key={s} value={s}>
              {LABEL[s]}
            </option>
          ))}
        </select>
        <select className="select !w-auto !py-2 !text-[13px]" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="newest">Newest first</option>
          <option value="amount">Highest amount</option>
        </select>
        <span className="ml-auto text-xs text-[color:var(--muted)]">{view.length} of {invoices.length}</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>University</th>
                <th>Subject</th>
                <th>Amount</th>
                <th>Filed by</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {view.map((i) => (
                <tr key={i.id}>
                  <td className="font-semibold">{i.ticket_no ?? "—"}</td>
                  <td className="text-[color:var(--muted)]">{i.university ?? "—"}</td>
                  <td>{i.subject ?? "—"}</td>
                  <td>{i.amount != null ? `₹ ${i.amount.toLocaleString("en-IN")}` : "—"}</td>
                  <td className="text-[color:var(--muted)]">{i.submitted_by_name ?? "—"}</td>
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
                  <td colSpan={7} className="py-12 text-center text-sm text-[color:var(--faint)]">No invoices match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
