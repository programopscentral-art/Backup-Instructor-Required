import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  GraduationCap,
  ReceiptText,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  MapPin,
  AlertTriangle,
  Inbox,
  Send,
  Ticket as TicketIcon,
  Loader,
} from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";
import { STATUS_META, MODE_LABEL, type TicketStatus, type TicketMode } from "@/lib/tickets/status";

export const dynamic = "force-dynamic";

/** Shared ticket shape across every role view. */
interface WRow {
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
  assigned_backup_name: string | null;
  universities: { name: string } | null;
  subjects: { name: string } | null;
}

const SEL =
  "id, ticket_no, status, mode, absent_instructor_name, absent_from, absent_to, time_from, time_to, invoice_due_at, assigned_backup_name, created_at, universities(name), subjects(name)";

const CLOSED_LIKE: TicketStatus[] = ["closed", "cancelled"];

const STEPS = [
  ["Assigned", "A Capability Manager picks you for a backup and Ops sets online/offline."],
  ["Dispatched", "Ops confirms — you're on. For offline, head to the campus and take the session."],
  ["Invoice (offline)", "Within 24 hours of the session, upload your NxtClaim link + charge slip. Late = red flag."],
  ["Approvals", "Ops approves, then HOD gives final sign-off."],
  ["Closed", "Settled. Done!"],
];

function metaLine(r: WRow, extra?: string) {
  const bits = [r.ticket_no, MODE_LABEL[r.mode]];
  if (extra) bits.push(extra);
  if (r.absent_from) bits.push(r.absent_from);
  return bits.filter(Boolean).join(" · ");
}

/** A clickable list of tickets — the same row style everywhere. */
function TicketList({ rows, sub }: { rows: WRow[]; sub?: (r: WRow) => string | undefined }) {
  return (
    <ul className="divide-y divide-[color:var(--line-2)]">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={`/dashboard/tickets/${r.id}`}
            className="flex items-center gap-3 py-3 transition-colors hover:bg-[color:var(--cream)]"
          >
            <span className={`pill ${STATUS_META[r.status].pill} shrink-0`}>{STATUS_META[r.status].label}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {r.subjects?.name ?? "—"} · {r.universities?.name ?? "—"}
              </p>
              <p className="truncate text-xs text-[color:var(--muted)]">{metaLine(r, sub?.(r))}</p>
            </div>
            <ArrowUpRight size={15} className="shrink-0 text-[color:var(--faint)]" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Section({
  icon,
  title,
  count,
  pill = "pill-accent",
  empty,
  children,
  delay = 0,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  pill?: string;
  empty: string;
  children?: ReactNode;
  delay?: number;
}) {
  return (
    <FadeIn delay={delay} className="mb-6">
      <div className="card p-6">
        <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold">
          {icon} {title}
          <span className={`pill ${pill}`}>{count}</span>
        </h2>
        {count === 0 ? <p className="text-sm text-[color:var(--faint)]">{empty}</p> : children}
      </div>
    </FadeIn>
  );
}

function StatRow({ items }: { items: { label: string; value: number; tone?: string }[] }) {
  return (
    <FadeIn className="mb-6">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {items.map((s) => (
          <div key={s.label} className="card p-4 sm:p-5">
            <p className="font-[family-name:var(--font-display)] text-2xl font-bold" style={{ color: s.tone }}>
              {s.value}
            </p>
            <p className="mt-0.5 text-xs font-medium text-[color:var(--muted)]">{s.label}</p>
          </div>
        ))}
      </div>
    </FadeIn>
  );
}

export default async function MyAssignmentsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const roles = ctx.roles;
  const adminLike = isAdminLike(roles);
  const isCM = roles.includes("capability_manager") || roles.includes("cma");
  const isStaff = roles.includes("university_staff");

  const supabase = await createAuthedClient();

  // ---------- Backup identity (by email) — for instructors/backups ----------
  const { data: pools } = await supabase
    .from("backup_instructor_pool")
    .select("id, red_flags, upload_blocked")
    .ilike("email", ctx.email);
  const poolIds = (pools ?? []).map((p) => (p as { id: string }).id);
  const isBackup = poolIds.length > 0;
  const locked = (pools ?? []).some((p) => (p as { upload_blocked: boolean }).upload_blocked);
  const flags = Math.max(0, ...(pools ?? []).map((p) => (p as { red_flags: number }).red_flags ?? 0), 0);

  let backupRows: WRow[] = [];
  let invoicedIds = new Set<string>();
  if (isBackup) {
    const { data } = await supabase
      .from("tickets")
      .select(SEL)
      .in("assigned_backup_id", poolIds)
      .order("created_at", { ascending: false });
    backupRows = (data ?? []) as unknown as WRow[];
    const ids = backupRows.map((r) => r.id);
    if (ids.length) {
      const { data: inv } = await supabase.from("invoices").select("ticket_id").in("ticket_id", ids);
      invoicedIds = new Set((inv ?? []).map((x) => (x as { ticket_id: string }).ticket_id));
    }
  }
  const needsInvoice = backupRows.filter(
    (r) => r.mode === "offline" && r.status === "invoice_pending" && !invoicedIds.has(r.id),
  );
  const backupActive = backupRows.filter((r) => !CLOSED_LIKE.includes(r.status) && !needsInvoice.includes(r));
  const backupDone = backupRows.filter((r) => r.status === "closed");

  // ---------- Raised tickets — for University Staff (and Ops footprint) ----------
  let raisedRows: WRow[] = [];
  if (isStaff || adminLike) {
    const { data } = await supabase
      .from("tickets")
      .select(SEL)
      .eq("raised_by", ctx.userId)
      .order("created_at", { ascending: false });
    raisedRows = (data ?? []) as unknown as WRow[];
  }
  const raisedOpen = raisedRows.filter((r) => !CLOSED_LIKE.includes(r.status));
  const raisedClosed = raisedRows.filter((r) => r.status === "closed");
  const raisedCancelled = raisedRows.filter((r) => r.status === "cancelled");

  // ---------- Capability Manager work — what they assigned + what's waiting ----------
  let cmAssigned: WRow[] = [];
  let cmAwaiting: WRow[] = [];
  if (isCM || adminLike) {
    const { data: a } = await supabase
      .from("tickets")
      .select(SEL)
      .eq("assigned_cm", ctx.userId)
      .order("created_at", { ascending: false });
    cmAssigned = (a ?? []) as unknown as WRow[];
  }
  if (isCM) {
    // RLS scopes this to the CM's own capability. Raised + no backup = their to-do.
    const { data: w } = await supabase
      .from("tickets")
      .select(SEL)
      .eq("status", "raised")
      .is("assigned_backup_id", null)
      .order("created_at", { ascending: false });
    cmAwaiting = (w ?? []) as unknown as WRow[];
  }
  const cmInProgress = cmAssigned.filter((r) => !CLOSED_LIKE.includes(r.status));
  const cmCompleted = cmAssigned.filter((r) => r.status === "closed");

  // ---------- Role-aware header ----------
  const header = isCM
    ? { eyebrow: "Capability Manager", title: "My work", subtitle: "Backups you've assigned — in progress and completed — plus tickets awaiting your assignment." }
    : isStaff
      ? { eyebrow: "Campus Desk", title: "My tickets", subtitle: "The absence tickets you've raised, and where each one stands." }
      : isBackup
        ? { eyebrow: "Backup Instructor", title: "My assignments", subtitle: "Your backup sessions — status, what to do next, and invoice upload." }
        : { eyebrow: "Program Ops", title: "My work", subtitle: "Tickets you've raised or assigned across the platform." };

  function dueBadge(due: string | null) {
    if (!due) return null;
    const ms = new Date(due).getTime() - Date.now();
    if (ms < 0)
      return (
        <span className="pill pill-crit">
          <AlertTriangle size={11} /> Overdue
        </span>
      );
    const h = Math.round(ms / 3_600_000);
    return (
      <span className={`pill ${h <= 6 ? "pill-warn" : "pill-muted"}`}>
        <Clock size={11} /> {h}h left
      </span>
    );
  }

  // Only a pure, un-pooled instructor sees the "link me to a pool" empty state.
  const pureInstructorNoPool = !isBackup && !isCM && !isStaff && !adminLike;

  return (
    <div>
      <PageHeader eyebrow={header.eyebrow} title={header.title} subtitle={header.subtitle} />

      {/* ============ BACKUP INSTRUCTOR ============ */}
      {isBackup && (flags > 0 || locked) && (
        <FadeIn className="mb-6">
          <div
            className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
              locked
                ? "border-[#f6cdd6] bg-[#fdeef1] text-[color:var(--rose)]"
                : "border-amber-300 bg-amber-50 text-[color:var(--amber,#b45309)]"
            }`}
          >
            <AlertTriangle size={17} className="mt-0.5 flex-none" />
            {locked ? (
              <span>
                <strong>Invoice upload locked.</strong> You&apos;ve hit 3 red flags (missed 24h invoice windows). An Admin must reset your flags before you can upload again.
              </span>
            ) : (
              <span>
                <strong>
                  {flags} red flag{flags > 1 ? "s" : ""}.
                </strong>{" "}
                Submit invoices within 24h of each offline session — at 3 flags your upload is locked until an Admin resets it.
              </span>
            )}
          </div>
        </FadeIn>
      )}

      {pureInstructorNoPool ? (
        <FadeIn>
          <div className="card flex flex-col items-center gap-3 p-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
              <GraduationCap size={26} />
            </span>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-bold">No backup profile linked</h3>
            <p className="max-w-md text-sm text-[color:var(--muted)]">
              Your email <span className="font-semibold text-[color:var(--ink)]">{ctx.email}</span> isn&apos;t on any capability&apos;s backup pool yet. Ask your Capability Manager to add you (Directories → Backup Pool) with this email, and your assignments will appear here.
            </p>
          </div>
        </FadeIn>
      ) : (
        <>
          {isBackup && (
            <>
              <StatRow
                items={[
                  { label: "Active", value: backupActive.length, tone: "var(--accent)" },
                  { label: "Needs invoice", value: needsInvoice.length, tone: "var(--rose)" },
                  { label: "Completed", value: backupDone.length, tone: "var(--emerald,#047857)" },
                ]}
              />
              {needsInvoice.length > 0 && (
                <FadeIn className="mb-6">
                  <div className="card border-2 border-[color:var(--rose)]/30 p-6">
                    <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold text-[color:var(--rose)]">
                      <ReceiptText size={18} /> Upload your invoice — within 24h
                    </h2>
                    <ul className="space-y-3">
                      {needsInvoice.map((r) => (
                        <li key={r.id}>
                          <Link
                            href={`/dashboard/tickets/${r.id}`}
                            className="flex items-center gap-3 rounded-xl border border-[color:var(--line-2)] p-3 transition-colors hover:bg-[color:var(--cream)]"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">
                                {r.subjects?.name ?? "—"} · {r.universities?.name ?? "—"}
                              </p>
                              <p className="truncate text-xs text-[color:var(--muted)]">{r.ticket_no} · offline session</p>
                            </div>
                            {dueBadge(r.invoice_due_at)}
                            <span className="btn btn-primary btn-sm gap-1">
                              Upload <ArrowUpRight size={14} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </FadeIn>
              )}
              <Section
                icon={<MapPin size={17} className="text-[color:var(--accent)]" />}
                title="Active assignments"
                count={backupActive.length}
                empty="No active assignments right now."
                delay={0.05}
              >
                <TicketList rows={backupActive} sub={(r) => (r.time_from ? `${r.time_from}${r.time_to ? `–${r.time_to}` : ""}` : undefined)} />
              </Section>
              {backupDone.length > 0 && (
                <Section
                  icon={<CheckCircle2 size={17} className="text-[color:var(--emerald,#047857)]" />}
                  title="Completed"
                  count={backupDone.length}
                  pill="pill-good"
                  empty="Nothing completed yet."
                  delay={0.1}
                >
                  <TicketList rows={backupDone} />
                </Section>
              )}
            </>
          )}

          {/* ============ CAPABILITY MANAGER ============ */}
          {isCM && (
            <>
              <StatRow
                items={[
                  { label: "Awaiting you", value: cmAwaiting.length, tone: "var(--amber,#b45309)" },
                  { label: "In progress", value: cmInProgress.length, tone: "var(--accent)" },
                  { label: "Completed", value: cmCompleted.length, tone: "var(--emerald,#047857)" },
                ]}
              />
              <Section
                icon={<Inbox size={17} className="text-[color:var(--amber,#b45309)]" />}
                title="Awaiting your assignment"
                count={cmAwaiting.length}
                pill="pill-warn"
                empty="Nothing waiting — every ticket in your capability has a backup. 🎉"
                delay={0.05}
              >
                <TicketList rows={cmAwaiting} sub={(r) => (r.absent_instructor_name ? `absent: ${r.absent_instructor_name}` : undefined)} />
              </Section>
              <Section
                icon={<Loader size={17} className="text-[color:var(--accent)]" />}
                title="Assigned by you — in progress"
                count={cmInProgress.length}
                empty="No open assignments right now."
                delay={0.1}
              >
                <TicketList rows={cmInProgress} sub={(r) => (r.assigned_backup_name ? `backup: ${r.assigned_backup_name}` : undefined)} />
              </Section>
              {cmCompleted.length > 0 && (
                <Section
                  icon={<CheckCircle2 size={17} className="text-[color:var(--emerald,#047857)]" />}
                  title="Assigned by you — completed"
                  count={cmCompleted.length}
                  pill="pill-good"
                  empty="Nothing completed yet."
                  delay={0.15}
                >
                  <TicketList rows={cmCompleted} sub={(r) => (r.assigned_backup_name ? `backup: ${r.assigned_backup_name}` : undefined)} />
                </Section>
              )}
            </>
          )}

          {/* ============ UNIVERSITY STAFF ============ */}
          {isStaff && (
            <>
              <StatRow
                items={[
                  { label: "Raised", value: raisedRows.length, tone: "var(--accent)" },
                  { label: "Open", value: raisedOpen.length, tone: "var(--amber,#b45309)" },
                  { label: "Closed", value: raisedClosed.length, tone: "var(--emerald,#047857)" },
                ]}
              />
              <Section
                icon={<Send size={17} className="text-[color:var(--accent)]" />}
                title="Open — being worked"
                count={raisedOpen.length}
                empty="No open tickets. Raise one from Operations → Tickets when an instructor is absent."
                delay={0.05}
              >
                <TicketList rows={raisedOpen} sub={(r) => (r.absent_instructor_name ? `absent: ${r.absent_instructor_name}` : undefined)} />
              </Section>
              {raisedClosed.length > 0 && (
                <Section
                  icon={<CheckCircle2 size={17} className="text-[color:var(--emerald,#047857)]" />}
                  title="Closed — settled"
                  count={raisedClosed.length}
                  pill="pill-good"
                  empty="Nothing closed yet."
                  delay={0.1}
                >
                  <TicketList rows={raisedClosed} sub={(r) => (r.absent_instructor_name ? `absent: ${r.absent_instructor_name}` : undefined)} />
                </Section>
              )}
              {raisedCancelled.length > 0 && (
                <Section
                  icon={<TicketIcon size={17} className="text-[color:var(--faint)]" />}
                  title="Cancelled"
                  count={raisedCancelled.length}
                  pill="pill-muted"
                  empty=""
                  delay={0.15}
                >
                  <TicketList rows={raisedCancelled} />
                </Section>
              )}
            </>
          )}

          {/* ============ OPS (admin/HOD) footprint ============ */}
          {adminLike && !isCM && !isStaff && (
            <>
              <StatRow
                items={[
                  { label: "Assigned by you", value: cmAssigned.length, tone: "var(--accent)" },
                  { label: "In progress", value: cmInProgress.length, tone: "var(--amber,#b45309)" },
                  { label: "Raised by you", value: raisedRows.length, tone: "var(--emerald,#047857)" },
                ]}
              />
              <Section
                icon={<Loader size={17} className="text-[color:var(--accent)]" />}
                title="Assigned by you — in progress"
                count={cmInProgress.length}
                empty="You have no open assignments."
                delay={0.05}
              >
                <TicketList rows={cmInProgress} sub={(r) => (r.assigned_backup_name ? `backup: ${r.assigned_backup_name}` : undefined)} />
              </Section>
              {raisedRows.length > 0 && (
                <Section
                  icon={<Send size={17} className="text-[color:var(--accent)]" />}
                  title="Raised by you"
                  count={raisedRows.length}
                  empty="You haven't raised any tickets."
                  delay={0.1}
                >
                  <TicketList rows={raisedRows} />
                </Section>
              )}
            </>
          )}
        </>
      )}

      {/* How it works — backup lifecycle (only meaningful for backups) */}
      {isBackup && (
        <FadeIn delay={0.2} className="mt-6">
          <div className="card p-6">
            <h2 className="mb-4 font-[family-name:var(--font-display)] text-base font-bold">How it works</h2>
            <ol className="space-y-3">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[color:var(--accent-soft)] text-xs font-bold text-[color:var(--accent)]">
                    {i + 1}
                  </span>
                  <p className="text-sm text-[color:var(--ink)]">
                    <span className="font-semibold">{t}</span> — <span className="text-[color:var(--muted)]">{d}</span>
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
