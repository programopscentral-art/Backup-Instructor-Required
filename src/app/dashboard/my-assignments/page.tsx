import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, ReceiptText, ArrowUpRight, Clock, CheckCircle2, MapPin, AlertTriangle } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";
import { STATUS_META, MODE_LABEL, type TicketStatus, type TicketMode } from "@/lib/tickets/status";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  ticket_no: string;
  status: TicketStatus;
  mode: TicketMode;
  absent_instructor_name: string | null;
  absent_from: string | null;
  absent_to: string | null;
  time_from: string | null;
  time_to: string | null;
  invoice_due_at: string | null;
  universities: { name: string } | null;
  subjects: { name: string } | null;
}

const STEPS = [
  ["Assigned", "A Capability Manager picks you for a backup and Ops sets online/offline."],
  ["Dispatched", "Ops confirms — you're on. For offline, head to the campus and take the session."],
  ["Invoice (offline)", "Within 24 hours of the session, upload your NxtClaim link + charge slip. Late = red flag."],
  ["Approvals", "Ops approves, then HOD gives final sign-off."],
  ["Closed", "Settled. Done!"],
];

export default async function MyAssignmentsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const supabase = await createAuthedClient();
  // Which backup-pool identities belong to this login (by email)?
  const { data: pools } = await supabase.from("backup_instructor_pool").select("id, red_flags, upload_blocked").ilike("email", ctx.email);
  const poolIds = (pools ?? []).map((p) => (p as { id: string }).id);
  const locked = (pools ?? []).some((p) => (p as { upload_blocked: boolean }).upload_blocked);
  const flags = Math.max(0, ...(pools ?? []).map((p) => (p as { red_flags: number }).red_flags ?? 0), 0);

  let rows: Row[] = [];
  let invoicedIds = new Set<string>();
  if (poolIds.length) {
    const { data } = await supabase
      .from("tickets")
      .select("id, ticket_no, status, mode, absent_instructor_name, absent_from, absent_to, time_from, time_to, invoice_due_at, universities(name), subjects(name)")
      .in("assigned_backup_id", poolIds)
      .order("created_at", { ascending: false });
    rows = (data ?? []) as unknown as Row[];
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: inv } = await supabase.from("invoices").select("ticket_id").in("ticket_id", ids);
      invoicedIds = new Set((inv ?? []).map((x) => (x as { ticket_id: string }).ticket_id));
    }
  }

  const needsInvoice = rows.filter(
    (r) => r.mode === "offline" && ["invoice_pending"].includes(r.status) && !invoicedIds.has(r.id),
  );
  const active = rows.filter((r) => !["closed", "cancelled"].includes(r.status) && !needsInvoice.includes(r));
  const done = rows.filter((r) => r.status === "closed");

  function dueBadge(due: string | null) {
    if (!due) return null;
    const ms = new Date(due).getTime() - Date.now();
    if (ms < 0) return <span className="pill pill-crit"><AlertTriangle size={11} /> Overdue</span>;
    const h = Math.round(ms / 3_600_000);
    return <span className={`pill ${h <= 6 ? "pill-warn" : "pill-muted"}`}><Clock size={11} /> {h}h left</span>;
  }

  const notRegistered = poolIds.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow="Backup Instructor"
        title="My assignments"
        subtitle="Your backup sessions — status, what to do next, and invoice upload."
      />

      {!notRegistered && (flags > 0 || locked) && (
        <FadeIn className="mb-6">
          <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${locked ? "border-[#f6cdd6] bg-[#fdeef1] text-[color:var(--rose)]" : "border-amber-300 bg-amber-50 text-[color:var(--amber,#b45309)]"}`}>
            <AlertTriangle size={17} className="mt-0.5 flex-none" />
            {locked ? (
              <span><strong>Invoice upload locked.</strong> You&apos;ve hit 3 red flags (missed 24h invoice windows). An Admin must reset your flags before you can upload again.</span>
            ) : (
              <span><strong>{flags} red flag{flags > 1 ? "s" : ""}.</strong> Submit invoices within 24h of each offline session — at 3 flags your upload is locked until an Admin resets it.</span>
            )}
          </div>
        </FadeIn>
      )}

      {notRegistered ? (
        <FadeIn>
          <div className="card flex flex-col items-center gap-3 p-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]"><GraduationCap size={26} /></span>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-bold">No backup profile linked</h3>
            <p className="max-w-md text-sm text-[color:var(--muted)]">
              Your email <span className="font-semibold text-[color:var(--ink)]">{ctx.email}</span> isn&apos;t on any capability&apos;s backup pool yet.
              Ask your Capability Manager to add you (Directories → Backup Pool) with this email, and your assignments will appear here.
            </p>
          </div>
        </FadeIn>
      ) : (
        <>
          {/* Action needed — upload invoice */}
          {needsInvoice.length > 0 && (
            <FadeIn className="mb-6">
              <div className="card border-2 border-[color:var(--rose)]/30 p-6">
                <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold text-[color:var(--rose)]">
                  <ReceiptText size={18} /> Upload your invoice — within 24h
                </h2>
                <ul className="space-y-3">
                  {needsInvoice.map((r) => (
                    <li key={r.id}>
                      <Link href={`/dashboard/tickets/${r.id}`} className="flex items-center gap-3 rounded-xl border border-[color:var(--line-2)] p-3 transition-colors hover:bg-[color:var(--cream)]">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{r.subjects?.name ?? "—"} · {r.universities?.name ?? "—"}</p>
                          <p className="truncate text-xs text-[color:var(--muted)]">{r.ticket_no} · offline session</p>
                        </div>
                        {dueBadge(r.invoice_due_at)}
                        <span className="btn btn-primary btn-sm gap-1">Upload <ArrowUpRight size={14} /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          )}

          {/* Active assignments */}
          <FadeIn delay={0.05}>
            <div className="card p-6">
              <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold">
                <MapPin size={17} className="text-[color:var(--accent)]" /> Active assignments
                <span className="pill pill-accent">{active.length}</span>
              </h2>
              {active.length === 0 ? (
                <p className="text-sm text-[color:var(--faint)]">No active assignments right now.</p>
              ) : (
                <ul className="divide-y divide-[color:var(--line-2)]">
                  {active.map((r) => (
                    <li key={r.id}>
                      <Link href={`/dashboard/tickets/${r.id}`} className="flex items-center gap-3 py-3 transition-colors hover:bg-[color:var(--cream)]">
                        <span className={`pill ${STATUS_META[r.status].pill} shrink-0`}>{STATUS_META[r.status].label}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{r.subjects?.name ?? "—"} · {r.universities?.name ?? "—"}</p>
                          <p className="truncate text-xs text-[color:var(--muted)]">
                            {r.ticket_no} · {MODE_LABEL[r.mode]}
                            {r.absent_from ? ` · ${r.absent_from}` : ""}
                            {r.time_from ? ` · ${r.time_from}${r.time_to ? `–${r.time_to}` : ""}` : ""}
                          </p>
                        </div>
                        <ArrowUpRight size={15} className="shrink-0 text-[color:var(--faint)]" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </FadeIn>

          {/* Completed */}
          {done.length > 0 && (
            <FadeIn delay={0.1} className="mt-6">
              <div className="card p-6">
                <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold">
                  <CheckCircle2 size={17} className="text-[color:var(--emerald,#047857)]" /> Completed
                  <span className="pill pill-good">{done.length}</span>
                </h2>
                <ul className="divide-y divide-[color:var(--line-2)]">
                  {done.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{r.subjects?.name ?? "—"} · {r.universities?.name ?? "—"}</span>
                      <span className="text-xs text-[color:var(--faint)]">{r.ticket_no}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          )}
        </>
      )}

      {/* How it works */}
      <FadeIn delay={0.15} className="mt-6">
        <div className="card p-6">
          <h2 className="mb-4 font-[family-name:var(--font-display)] text-base font-bold">How it works</h2>
          <ol className="space-y-3">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[color:var(--accent-soft)] text-xs font-bold text-[color:var(--accent)]">{i + 1}</span>
                <p className="text-sm text-[color:var(--ink)]"><span className="font-semibold">{t}</span> — <span className="text-[color:var(--muted)]">{d}</span></p>
              </li>
            ))}
          </ol>
        </div>
      </FadeIn>
    </div>
  );
}
