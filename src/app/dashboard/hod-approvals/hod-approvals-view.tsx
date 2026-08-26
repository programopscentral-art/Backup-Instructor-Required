"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Stamp,
  ExternalLink,
  FileText,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Building2,
  BookOpen,
  Search,
  ArrowUpRight,
} from "lucide-react";
import { reviewInvoice } from "@/app/dashboard/invoices/actions";

export interface PendingClaim {
  invoiceId: string;
  ticketId: string;
  ticketNo: string;
  university: string;
  subject: string;
  capability: string | null;
  cm: string | null;
  amount: number | null;
  travel: number | null;
  accommodation: number | null;
  other: number | null;
  late: boolean;
  nxtclaimLink: string;
  description: string | null;
  sessionDate: string | null;
  submittedByName: string | null;
  opsApprovedAt: string | null;
  files: { name: string; url: string }[];
}

export interface DoneClaim {
  ticketId: string;
  ticketNo: string;
  university: string;
  subject: string;
  amount: number | null;
  approvedAt: string | null;
}

const inr = (n: number | null) =>
  n == null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function ago(iso: string | null) {
  if (!iso) return "";
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function HodApprovalsView({ pending, done }: { pending: PendingClaim[]; done: DoneClaim[] }) {
  const [claims, setClaims] = useState(pending);
  const total = claims.reduce((s, c) => s + (c.amount ?? 0), 0);

  function removeClaim(id: string) {
    setClaims((cur) => cur.filter((c) => c.invoiceId !== id));
  }

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
            <Stamp size={22} />
          </span>
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-bold leading-tight">
              {claims.length} awaiting your final sign-off
            </p>
            <p className="text-sm text-[color:var(--muted)]">Ops-approved claims — verify and give HOD approval.</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--faint)]">Total pending</p>
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[color:var(--ink)]">{inr(total)}</p>
        </div>
      </div>

      {claims.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
            <CheckCircle2 size={26} />
          </span>
          <h3 className="font-[family-name:var(--font-display)] text-lg font-bold">All caught up</h3>
          <p className="max-w-sm text-sm text-[color:var(--muted)]">
            No claims are waiting for your approval. When Ops approves an offline claim, it lands here for your final sign-off.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {claims.map((c) => (
            <ClaimCard key={c.invoiceId} claim={c} onDone={() => removeClaim(c.invoiceId)} />
          ))}
        </ul>
      )}

      {/* Recently signed off — sortable, searchable, click-through */}
      {done.length > 0 && <RecentlyApproved done={done} />}
    </div>
  );
}

function RecentlyApproved({ done }: { done: DoneClaim[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "amount" | "amount_asc">("newest");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = done.filter((d) =>
      !needle ? true : `${d.ticketNo} ${d.subject} ${d.university}`.toLowerCase().includes(needle),
    );
    out = [...out].sort((a, b) => {
      if (sort === "amount") return (b.amount ?? 0) - (a.amount ?? 0);
      if (sort === "amount_asc") return (a.amount ?? 0) - (b.amount ?? 0);
      const at = a.approvedAt ?? "";
      const bt = b.approvedAt ?? "";
      return sort === "oldest" ? at.localeCompare(bt) : -at.localeCompare(bt);
    });
    return out;
  }, [done, q, sort]);

  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold">
          <CheckCircle2 size={17} className="text-[color:var(--emerald,#047857)]" /> Recently approved by HOD
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--faint)]" />
            <input
              className="input !w-44 !py-1.5 !pl-8 !text-[13px]"
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="select !w-auto !py-1.5 !text-[13px]" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amount">Highest amount</option>
            <option value="amount_asc">Lowest amount</option>
          </select>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-[color:var(--faint)]">No matches.</p>
      ) : (
        <ul className="divide-y divide-[color:var(--line-2)]">
          {rows.map((d) => (
            <li key={d.ticketId}>
              <Link
                href={`/dashboard/tickets/${d.ticketId}`}
                className="group flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-[color:var(--cream)]"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-[color:var(--accent)] group-hover:underline">{d.ticketNo}</span> ·{" "}
                  {d.subject} · <span className="text-[color:var(--muted)]">{d.university}</span>
                </span>
                <span className="pill pill-muted shrink-0">{inr(d.amount)}</span>
                <span className="w-16 shrink-0 text-right text-xs text-[color:var(--faint)]">{ago(d.approvedAt)}</span>
                <ArrowUpRight size={15} className="shrink-0 text-[color:var(--faint)] group-hover:text-[color:var(--accent)]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClaimCard({ claim: c, onDone }: { claim: PendingClaim; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");

  async function run(action: "hod" | "return") {
    setBusy(action);
    setError(null);
    const fd = new FormData();
    fd.set("invoice_id", c.invoiceId);
    fd.set("ticket_id", c.ticketId);
    fd.set("action", action);
    if (action === "return") fd.set("reason", reason);
    const res = await reviewInvoice({}, fd);
    if (res.error) {
      setError(res.error);
      setBusy(null);
      return;
    }
    onDone(); // optimistic remove from the queue
    router.refresh();
  }

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-[family-name:var(--font-display)] text-base font-bold">{c.ticketNo}</span>
            <span className="pill pill-accent">Awaiting HOD</span>
            {c.late && (
              <span className="pill pill-crit">
                <AlertTriangle size={11} /> Late
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[color:var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <BookOpen size={14} className="text-[color:var(--faint)]" /> {c.subject}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Building2 size={14} className="text-[color:var(--faint)]" /> {c.university}
            </span>
            {c.opsApprovedAt && (
              <span className="inline-flex items-center gap-1.5 text-[color:var(--faint)]">
                <Clock size={13} /> Ops approved {ago(c.opsApprovedAt)}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--faint)]">Amount</p>
          <p className="font-[family-name:var(--font-display)] text-xl font-bold">{inr(c.amount)}</p>
          {(c.travel != null || c.accommodation != null || c.other != null) && (
            <p className="mt-0.5 text-[11px] text-[color:var(--faint)]">
              ✈️ {inr(c.travel ?? 0)} · 🏨 {inr(c.accommodation ?? 0)} · ➕ {inr(c.other ?? 0)}
            </p>
          )}
        </div>
      </div>

      {/* Verify block */}
      <div className="mt-4 grid gap-3 rounded-xl border border-[color:var(--line-2)] bg-[color:var(--cream)] p-3.5 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--faint)]">Filed by</p>
          <p className="text-sm text-[color:var(--ink)]">{c.submittedByName ?? "—"}</p>
          {c.sessionDate && <p className="mt-0.5 text-xs text-[color:var(--faint)]">Session {c.sessionDate}</p>}
          {c.capability && (
            <p className="mt-0.5 text-xs text-[color:var(--faint)]">
              {c.capability}
              {c.cm ? ` · CM ${c.cm}` : ""}
            </p>
          )}
        </div>
        <div className="sm:text-right">
          <a
            href={c.nxtclaimLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--accent)] hover:underline"
          >
            <ExternalLink size={14} /> Open NxtClaim
          </a>
        </div>
        {c.description && (
          <p className="text-sm text-[color:var(--ink)] sm:col-span-2">{c.description}</p>
        )}
        {c.files.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {c.files.map((f, i) => (
              <a
                key={i}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--line)] bg-white px-2.5 py-1.5 text-xs text-[color:var(--ink)] hover:border-[color:var(--accent)]"
              >
                <FileText size={13} className="text-[color:var(--muted)]" />
                <span className="max-w-[160px] truncate">{f.name}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">{error}</p>
      )}

      {/* Actions */}
      {returning ? (
        <div className="mt-4 space-y-2">
          <input
            className="input"
            placeholder="Reason to return (the backup will see this)…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={() => run("return")} disabled={busy !== null || !reason.trim()} className="btn btn-danger btn-sm">
              Confirm return
            </button>
            <button onClick={() => setReturning(false)} disabled={busy !== null} className="btn btn-ghost btn-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => run("hod")} disabled={busy !== null} className="btn btn-primary">
            <Check size={15} /> {busy === "hod" ? "Approving…" : "Approve (final sign-off)"}
          </button>
          <button onClick={() => setReturning(true)} disabled={busy !== null} className="btn btn-ghost">
            Return for fix
          </button>
        </div>
      )}
    </li>
  );
}
