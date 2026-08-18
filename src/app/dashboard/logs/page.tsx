import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { STATUS_META, type TicketStatus } from "@/lib/tickets/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { LogsView, type LogEvent, type AuditEvent } from "./logs-view";

const ENTITY_LABEL: Record<string, string> = {
  university_staff: "staff",
  instructors: "instructor",
};
const ACTION_VERB: Record<string, string> = { create: "Added", update: "Updated", delete: "Deleted" };

export default async function LogsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const adminLike = isAdminLike(ctx.roles);
  const supabase = await createAuthedClient();

  // All RLS-scoped: admin/hod see everything; university staff see only their campus.
  const [{ data: rawEvents }, { data: rawActivity }, auditRes] = await Promise.all([
    supabase
      .from("ticket_events")
      .select("id, actor_name, to_status, note, created_at, tickets(ticket_no, universities(name), subjects(name))")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("activity_log")
      .select("id, actor_name, action, entity, entity_name, created_at, universities(name)")
      .order("created_at", { ascending: false })
      .limit(300),
    adminLike
      ? supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
  ]);

  const ticketEvents: LogEvent[] = ((rawEvents ?? []) as unknown as Array<{
    id: string;
    actor_name: string | null;
    to_status: TicketStatus | null;
    note: string | null;
    created_at: string;
    tickets: { ticket_no: string; universities: { name: string } | null; subjects: { name: string } | null } | null;
  }>).map((e) => ({
    id: `t-${e.id}`,
    time: e.created_at,
    actor: e.actor_name ?? "System",
    university: e.tickets?.universities?.name ?? "—",
    category: "Ticket",
    action: e.to_status ? STATUS_META[e.to_status]?.label ?? e.to_status : "Update",
    target: `${e.tickets?.ticket_no ?? "—"}${e.tickets?.subjects?.name ? ` · ${e.tickets.subjects.name}` : ""}`,
    note: e.note ?? "",
  }));

  const directoryEvents: LogEvent[] = ((rawActivity ?? []) as unknown as Array<{
    id: string;
    actor_name: string | null;
    action: string;
    entity: string;
    entity_name: string | null;
    created_at: string;
    universities: { name: string } | null;
  }>).map((a) => ({
    id: `a-${a.id}`,
    time: a.created_at,
    actor: a.actor_name ?? "System",
    university: a.universities?.name ?? "—",
    category: "Directory",
    action: `${ACTION_VERB[a.action] ?? a.action} ${ENTITY_LABEL[a.entity] ?? a.entity}`,
    target: a.entity_name ?? "—",
    note: "",
  }));

  const events = [...ticketEvents, ...directoryEvents].sort((a, b) => b.time.localeCompare(a.time));

  const audit: AuditEvent[] = ((auditRes.data ?? []) as unknown as AuditEvent[]).map((a) => ({
    id: a.id,
    created_at: a.created_at,
    actor_name: a.actor_name,
    action: a.action,
    target_email: a.target_email,
    role: a.role,
    detail: a.detail,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Audit"
        title="Logs"
        subtitle={
          adminLike
            ? "Full trail across all universities — tickets and directory changes, who did what and when — plus access history."
            : "Activity trail for your university — tickets and directory changes, who did what and when."
        }
      />
      <LogsView events={events} audit={audit} isAdmin={adminLike} />
    </div>
  );
}
