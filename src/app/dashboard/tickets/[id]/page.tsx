import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import {
  STATUS_META,
  STEPPER,
  MODE_LABEL,
  type TicketStatus,
  type TicketMode,
} from "@/lib/tickets/status";
import { AlertTriangle } from "lucide-react";
import { FadeIn } from "@/components/ui/motion";
import { TicketActions } from "./ticket-actions";
import { InvoicePanel, type InvoiceView } from "./invoice-panel";
import { CapabilitySetup } from "./capability-setup";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const supabase = await createAuthedClient();
  const { data: ticket } = await supabase
    .from("tickets")
    .select(
      "*, universities(name), subjects(name), capabilities(name, manager_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!ticket) notFound();

  const [{ data: events }, { data: pool }, { data: allCaps }, { data: cmUsers }] = await Promise.all([
    supabase.from("ticket_events").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
    ticket.capability_id
      ? supabase
          .from("backup_instructor_pool")
          .select("id, instructor_name, emp_id, availability_mode, current_status")
          .eq("capability_id", ticket.capability_id)
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("capabilities").select("id, name, manager_name").order("name"),
    supabase.rpc("list_capability_managers"),
  ]);

  const status = ticket.status as TicketStatus;
  const mode = ticket.mode as TicketMode;
  const meta = STATUS_META[status];
  const stepIdx = STEPPER.indexOf(status);

  // Invoice (offline claim) + signed file URLs.
  const { data: invoiceRow } = await supabase
    .from("invoices")
    .select("*")
    .eq("ticket_id", id)
    .maybeSingle();

  let invoiceView: InvoiceView | null = null;
  if (invoiceRow) {
    const { data: files } = await supabase
      .from("invoice_files")
      .select("path, name")
      .eq("invoice_id", invoiceRow.id);
    const signed = await Promise.all(
      (files ?? []).map(async (f) => {
        const { data } = await supabase.storage.from("invoices").createSignedUrl(f.path, 3600);
        return { name: f.name ?? "file", url: data?.signedUrl ?? "#" };
      }),
    );
    invoiceView = {
      id: invoiceRow.id,
      status: invoiceRow.status,
      description: invoiceRow.description,
      amount: invoiceRow.amount,
      nxtclaim_link: invoiceRow.nxtclaim_link,
      late: invoiceRow.late,
      submitted_by_name: invoiceRow.submitted_by_name,
      session_date: invoiceRow.session_date,
      return_reason: invoiceRow.return_reason,
      files: signed,
    };
  }

  const overdue =
    (ticket.red_flag === true && !invoiceRow) ||
    (status === "invoice_pending" &&
      !invoiceRow &&
      !!ticket.invoice_due_at &&
      new Date() > new Date(ticket.invoice_due_at));

  const invoiceStage = ["invoice_pending", "ops_approved", "hod_approved"].includes(status);
  const showInvoice = mode === "offline" && (invoiceStage || !!invoiceRow);

  const adminLike = isAdminLike(ctx.roles);
  const isCMhere = ctx.assignments.some(
    (a) =>
      (a.role === "capability_manager" || a.role === "cma") &&
      (a.scope_type === "global" || (a.scope_type === "capability" && a.scope_id === ticket.capability_id)),
  );
  const perms = {
    canAssign: adminLike || isCMhere,
    canConfirm: adminLike,
    canApprove: adminLike,
    isHod: ctx.roles.includes("hod") || adminLike,
    isAdmin: adminLike,
  };

  const cap = ticket.capabilities as { name: string; manager_name: string | null } | null;

  const details: [string, string | null][] = [
    ["University", (ticket.universities as { name: string } | null)?.name ?? "—"],
    ["Subject", (ticket.subjects as { name: string } | null)?.name ?? "—"],
    ["Capability", cap?.name ?? "— (no CM yet)"],
    ["Capability Manager", cap?.manager_name ?? "—"],
    ["Absent instructor", ticket.absent_instructor_name],
    ["Reason", ticket.reason_category],
    ["Notes", ticket.reason],
    [
      "Absent dates",
      ticket.absent_from
        ? `${ticket.absent_from}${ticket.absent_to && ticket.absent_to !== ticket.absent_from ? ` → ${ticket.absent_to}` : ""}`
        : "—",
    ],
    [
      "Time",
      ticket.time_from ? `${ticket.time_from}${ticket.time_to ? ` – ${ticket.time_to}` : ""}` : "—",
    ],
    ["Requested mode", MODE_LABEL[ticket.requested_mode as TicketMode]],
    ["Delivery mode", MODE_LABEL[mode]],
    ["Assigned backup", ticket.assigned_backup_name],
  ];

  return (
    <div>
      <Link
        href="/dashboard/tickets"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--accent)]"
      >
        <ArrowLeft size={15} /> Back to tickets
      </Link>

      <FadeIn className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">
          {ticket.ticket_no}
        </h1>
        <span className={`pill ${meta.pill}`}>{meta.label}</span>
        {mode !== "undecided" && <span className="pill pill-muted">{MODE_LABEL[mode]}</span>}
        {overdue && (
          <span className="pill pill-crit">
            <AlertTriangle size={12} /> Red flag · invoice overdue
          </span>
        )}
      </FadeIn>

      {/* Stepper */}
      <FadeIn delay={0.05} className="mb-6">
        <div className="card overflow-x-auto p-5">
          <div className="flex min-w-max items-center gap-1">
            {STEPPER.map((s, i) => {
              const done = stepIdx >= 0 && i < stepIdx;
              const current = i === stepIdx;
              return (
                <div key={s} className="flex items-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <span
                      className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition-colors"
                      style={{
                        background: done
                          ? "var(--accent)"
                          : current
                            ? "var(--accent-soft)"
                            : "var(--cream-2)",
                        color: done ? "#fff" : current ? "var(--accent)" : "var(--faint)",
                        border: current ? "1.5px solid var(--accent)" : "1.5px solid transparent",
                      }}
                    >
                      {done ? <Check size={14} /> : i + 1}
                    </span>
                    <span
                      className="whitespace-nowrap text-[10px] font-semibold"
                      style={{ color: done || current ? "var(--ink)" : "var(--faint)" }}
                    >
                      {STATUS_META[s].label}
                    </span>
                  </div>
                  {i < STEPPER.length - 1 && (
                    <span
                      className="mx-1 mb-4 h-0.5 w-8 rounded"
                      style={{ background: done ? "var(--accent)" : "var(--line-2)" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {status === "cancelled" && (
            <p className="mt-3 text-sm font-semibold text-[color:var(--rose)]">This ticket was cancelled.</p>
          )}
        </div>
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Details + timeline */}
        <div className="space-y-6">
          <FadeIn delay={0.1}>
            <div className="card p-6">
              <h2 className="mb-4 font-[family-name:var(--font-display)] text-base font-bold">Details</h2>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {details.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[color:var(--faint)]">
                      {k}
                    </dt>
                    <dd className="mt-0.5 text-sm text-[color:var(--ink)]">
                      {v || <span className="text-[color:var(--faint)]">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div className="card p-6">
              <h2 className="mb-4 font-[family-name:var(--font-display)] text-base font-bold">Activity</h2>
              <ol className="relative space-y-4 border-l border-[color:var(--line-2)] pl-5">
                {(events ?? []).map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[26px] top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-[color:var(--accent)] ring-4 ring-[color:var(--surface)]" />
                    <p className="text-sm text-[color:var(--ink)]">
                      {e.from_status !== e.to_status ? (
                        <>
                          <span className="font-semibold">{STATUS_META[e.to_status as TicketStatus]?.label}</span>
                          {e.note && <span className="text-[color:var(--muted)]"> — {e.note}</span>}
                        </>
                      ) : (
                        e.note || "Update"
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-[color:var(--faint)]">
                      {e.actor_name ?? "System"} · {new Date(e.created_at).toLocaleString("en-IN")}
                    </p>
                  </li>
                ))}
                {(events ?? []).length === 0 && (
                  <li className="text-sm text-[color:var(--faint)]">No activity yet.</li>
                )}
              </ol>
            </div>
          </FadeIn>
        </div>

        {/* Actions */}
        <FadeIn delay={0.2}>
          <div className="card sticky top-24 p-6">
            <h2 className="mb-4 font-[family-name:var(--font-display)] text-base font-bold">
              {showInvoice
                ? "Invoice & approvals"
                : !ticket.capability_id && status === "raised" && perms.canAssign
                  ? "Assign Capability Manager"
                  : "Next action"}
            </h2>
            {showInvoice ? (
              <InvoicePanel
                ticketId={ticket.id}
                ticketStatus={status}
                overdue={overdue}
                invoice={invoiceView}
                perms={{ isAdmin: perms.isAdmin, isHod: perms.isHod }}
              />
            ) : !ticket.capability_id && status === "raised" && perms.canAssign ? (
              <CapabilitySetup
                ticketId={ticket.id}
                subjectId={ticket.subject_id}
                capabilities={(allCaps ?? []) as never}
                cmUsers={(cmUsers ?? []) as never}
              />
            ) : (
              <TicketActions
                ticketId={ticket.id}
                status={status}
                mode={mode}
                pool={(pool ?? []) as never}
                perms={perms}
                capabilityId={ticket.capability_id ?? null}
              />
            )}
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
