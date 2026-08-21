import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Clock3, CheckCircle2, AlertTriangle, ArrowUpRight, CalendarDays } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { FadeIn } from "@/components/ui/motion";
import { STATUS_META, MODE_LABEL, type TicketStatus, type TicketMode } from "@/lib/tickets/status";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  ticket_no: string;
  status: TicketStatus;
  mode: TicketMode;
  requested_mode: TicketMode;
  absent_instructor_name: string | null;
  absent_from: string | null;
  absent_to: string | null;
  time_from: string | null;
  time_to: string | null;
  created_at: string;
  universities: { name: string } | null;
  subjects: { name: string } | null;
  capabilities: { name: string } | null;
}

/** Urgency by the *class date* (backup-needed date), not raise time. */
function urgency(absentFrom: string | null): { label: string; cls: string; order: number } {
  if (!absentFrom) return { label: "No date", cls: "pill-muted", order: 5 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(absentFrom);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { label: `Overdue ${-diff}d`, cls: "pill-crit", order: 0 };
  if (diff === 0) return { label: "Today", cls: "pill-crit", order: 1 };
  if (diff === 1) return { label: "Tomorrow", cls: "pill-warn", order: 2 };
  if (diff <= 3) return { label: `In ${diff}d`, cls: "pill-warn", order: 3 };
  return { label: `In ${diff}d`, cls: "pill-muted", order: 4 };
}

function withinDays(iso: string, days: number) {
  return Date.now() - new Date(iso).getTime() <= days * 86_400_000;
}

export default async function MyCapabilityPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const adminLike = isAdminLike(ctx.roles);
  const capAssigns = ctx.assignments.filter((a) => a.role === "capability_manager" || a.role === "cma");
  const isCM = capAssigns.length > 0;
  if (!adminLike && !isCM) redirect("/dashboard");

  const globalCM = capAssigns.some((a) => a.scope_type === "global");
  const capIds = capAssigns
    .filter((a) => a.scope_type === "capability" && a.scope_id)
    .map((a) => a.scope_id as string);

  const supabase = await createAuthedClient();
  let q = supabase
    .from("tickets")
    .select(
      "id, ticket_no, status, mode, requested_mode, absent_instructor_name, absent_from, absent_to, time_from, time_to, created_at, universities(name), subjects(name), capabilities(name)",
    );
  // Scope to the CM's capabilities (admins & global CMs see all).
  if (!adminLike && !globalCM && capIds.length) q = q.in("capability_id", capIds);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

  const needsBackup = rows
    .filter((r) => r.status === "raised")
    .sort((a, b) => {
      const ua = urgency(a.absent_from).order;
      const ub = urgency(b.absent_from).order;
      if (ua !== ub) return ua - ub;
      return (a.absent_from ?? "9999").localeCompare(b.absent_from ?? "9999");
    });
  const awaitingOps = rows.filter((r) => r.status === "backup_assigned");
  const inProgress = rows.filter((r) =>
    ["confirmed", "session_done", "invoice_pending", "ops_approved", "hod_approved"].includes(r.status),
  );
  const closedThisWeek = rows.filter((r) => r.status === "closed" && withinDays(r.created_at, 7)).length;
  const overdue = needsBackup.filter((r) => urgency(r.absent_from).order === 0).length;

  return (
    <div>
      <PageHeader
        eyebrow="Capability Manager"
        title="My capability"
        subtitle="Backup requests in your subject vertical — most urgent first (by class date)."
      />

      <FadeIn>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Needs a backup" value={needsBackup.length} icon={<Inbox size={20} />} accent="accent" hint={overdue ? `${overdue} overdue` : undefined} />
          <StatCard label="Awaiting Ops" value={awaitingOps.length} icon={<Clock3 size={20} />} accent="amber" />
          <StatCard label="In progress" value={inProgress.length} icon={<CalendarDays size={20} />} accent="blue" />
          <StatCard label="Closed this week" value={closedThisWeek} icon={<CheckCircle2 size={20} />} accent="emerald" />
        </div>
      </FadeIn>

      {/* Needs a backup — the action queue */}
      <FadeIn delay={0.1} className="mt-6">
        <div className="card p-6">
          <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold">
            <Inbox size={17} className="text-[color:var(--accent)]" /> Needs a backup
            <span className="pill pill-accent">{needsBackup.length}</span>
          </h2>
          {needsBackup.length === 0 ? (
            <p className="text-sm text-[color:var(--faint)]">Nothing waiting — you&apos;re all caught up. 🎉</p>
          ) : (
            <ul className="divide-y divide-[color:var(--line-2)]">
              {needsBackup.map((r) => {
                const u = urgency(r.absent_from);
                return (
                  <li key={r.id}>
                    <Link href={`/dashboard/tickets/${r.id}`} className="flex items-center gap-3 py-3 transition-colors hover:bg-[color:var(--cream)]">
                      <span className={`pill ${u.cls} shrink-0`}>{u.label}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[color:var(--ink)]">
                          {r.subjects?.name ?? "—"} · {r.universities?.name ?? "—"}
                        </p>
                        <p className="truncate text-xs text-[color:var(--muted)]">
                          {r.ticket_no} · absent: {r.absent_instructor_name ?? "—"}
                          {r.absent_from ? ` · ${r.absent_from}${r.absent_to && r.absent_to !== r.absent_from ? `→${r.absent_to}` : ""}` : ""}
                          {r.time_from ? ` · ${r.time_from}${r.time_to ? `–${r.time_to}` : ""}` : ""}
                          {` · wants ${MODE_LABEL[r.requested_mode]}`}
                        </p>
                      </div>
                      <span className="btn btn-primary btn-sm shrink-0 gap-1">
                        Assign <ArrowUpRight size={14} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </FadeIn>

      {/* Awaiting Ops confirmation */}
      <FadeIn delay={0.15} className="mt-6">
        <div className="card p-6">
          <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold">
            <Clock3 size={17} className="text-[color:var(--amber,#b45309)]" /> Awaiting Ops confirmation
            <span className="pill pill-muted">{awaitingOps.length}</span>
          </h2>
          {awaitingOps.length === 0 ? (
            <p className="text-sm text-[color:var(--faint)]">None awaiting confirmation.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--line-2)]">
              {awaitingOps.map((r) => (
                <li key={r.id}>
                  <Link href={`/dashboard/tickets/${r.id}`} className="flex items-center gap-3 py-3 transition-colors hover:bg-[color:var(--cream)]">
                    <span className={`pill ${STATUS_META[r.status].pill} shrink-0`}>{STATUS_META[r.status].label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[color:var(--ink)]">
                        {r.subjects?.name ?? "—"} · {r.universities?.name ?? "—"}
                      </p>
                      <p className="truncate text-xs text-[color:var(--muted)]">{r.ticket_no} · {MODE_LABEL[r.mode]}</p>
                    </div>
                    <ArrowUpRight size={15} className="shrink-0 text-[color:var(--faint)]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </FadeIn>
    </div>
  );
}
