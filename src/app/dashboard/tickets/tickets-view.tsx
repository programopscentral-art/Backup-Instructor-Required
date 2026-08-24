"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ticket as TicketIcon, ArrowUpRight, Search } from "lucide-react";
import { STATUS_META, MODE_LABEL, STEPPER, type TicketStatus, type TicketMode } from "@/lib/tickets/status";
import { Stagger, StaggerItem } from "@/components/ui/motion";

export interface TicketRow {
  id: string;
  ticket_no: string;
  status: TicketStatus;
  mode: TicketMode;
  absent_instructor_name: string | null;
  absent_from: string | null;
  absent_to: string | null;
  created_at: string;
  universities: { name: string } | null;
  subjects: { name: string } | null;
  capabilities: { name: string; manager_name: string | null } | null;
}

export function TicketsView({ tickets }: { tickets: TicketRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [uni, setUni] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "stage">("newest");
  const [needsOnly, setNeedsOnly] = useState(false);

  // Unresolved intake (university didn't match) — an admin must resolve it.
  const needsAdmin = (t: TicketRow) => !t.universities && t.status === "raised";
  const needsCount = tickets.filter(needsAdmin).length;

  const universities = useMemo(
    () => Array.from(new Set(tickets.map((t) => t.universities?.name).filter(Boolean) as string[])).sort(),
    [tickets],
  );
  const statuses = useMemo(
    () => Array.from(new Set(tickets.map((t) => t.status))),
    [tickets],
  );

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = tickets.filter((t) => {
      if (needsOnly && !needsAdmin(t)) return false;
      if (status && t.status !== status) return false;
      if (uni && t.universities?.name !== uni) return false;
      if (needle) {
        const hay = `${t.ticket_no} ${t.subjects?.name ?? ""} ${t.universities?.name ?? ""} ${t.absent_instructor_name ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "stage") return STEPPER.indexOf(a.status) - STEPPER.indexOf(b.status);
      const cmp = a.created_at.localeCompare(b.created_at);
      return sort === "newest" ? -cmp : cmp;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, q, status, uni, sort, needsOnly]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--faint)]" />
          <input className="input !w-56 !py-2 !pl-9 !text-[13px]" placeholder="Search tickets…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select !w-auto !py-2 !text-[13px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        {universities.length > 1 && (
          <select className="select !w-auto !py-2 !text-[13px]" value={uni} onChange={(e) => setUni(e.target.value)}>
            <option value="">All universities</option>
            {universities.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}
        <select className="select !w-auto !py-2 !text-[13px]" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="stage">By stage</option>
        </select>
        {needsCount > 0 && (
          <button
            onClick={() => setNeedsOnly((v) => !v)}
            className="rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors"
            style={{
              background: needsOnly ? "var(--rose)" : "#fdeef1",
              color: needsOnly ? "#fff" : "var(--rose)",
            }}
          >
            ⚠ Needs admin · {needsCount}
          </button>
        )}
        <span className="ml-auto text-xs text-[color:var(--muted)]">{view.length} of {tickets.length}</span>
      </div>

      {view.length === 0 ? (
        <div className="card p-12 text-center text-sm text-[color:var(--faint)]">No tickets match.</div>
      ) : (
        <Stagger className="flex flex-col gap-3">
          {view.map((t) => {
            const meta = STATUS_META[t.status];
            return (
              <StaggerItem key={t.id}>
                <Link href={`/dashboard/tickets/${t.id}`} className="group block">
                  <div className="card card-hover flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                      <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                        <TicketIcon size={19} />
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-[family-name:var(--font-display)] text-sm font-bold text-[color:var(--ink)]">{t.ticket_no}</span>
                          <span className={`pill ${meta.pill}`}>{meta.label}</span>
                          {t.mode !== "undecided" && <span className="pill pill-muted">{MODE_LABEL[t.mode]}</span>}
                          {needsAdmin(t) && <span className="pill pill-crit">⚠ Needs admin</span>}
                        </div>
                        <p className="mt-1 text-sm text-[color:var(--ink)]">
                          {t.subjects?.name ?? "—"} · <span className="text-[color:var(--muted)]">{t.universities?.name ?? "—"}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-[color:var(--faint)]">
                          Absent: {t.absent_instructor_name ?? "—"}
                          {t.absent_from && ` · ${t.absent_from}`}
                          {t.capabilities?.manager_name && ` · CM: ${t.capabilities.manager_name}`}
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight size={18} className="hidden text-[color:var(--faint)] transition-colors group-hover:text-[color:var(--accent)] sm:block" />
                  </div>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}
