import Link from "next/link";
import { Plus, Ticket as TicketIcon } from "lucide-react";
import { createAuthedClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { isAdminLike } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";
import { TicketsView, type TicketRow } from "./tickets-view";

export default async function TicketsPage() {
  const ctx = await getSessionContext();
  const roles = ctx?.roles ?? [];
  // Raising is a University Ops (staff) privilege — instructors cannot raise.
  const canRaise = isAdminLike(roles) || roles.includes("university_staff");

  const supabase = await createAuthedClient();
  const { data } = await supabase
    .from("tickets")
    .select(
      "id, ticket_no, status, mode, absent_instructor_name, absent_from, absent_to, created_at, universities(name), subjects(name), capabilities(name, manager_name)",
    )
    .order("created_at", { ascending: false });

  const tickets = (data ?? []) as unknown as TicketRow[];

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Tickets"
        subtitle="Absence tickets from universities, routed to Ops and the subject's Capability Manager."
        action={
          canRaise ? (
            <Link href="/dashboard/tickets/new" className="btn btn-primary">
              <Plus size={16} /> Raise ticket
            </Link>
          ) : undefined
        }
      />

      {tickets.length === 0 ? (
        <FadeIn>
          <div className="card flex flex-col items-center gap-3 p-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
              <TicketIcon size={26} />
            </span>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-bold">No tickets yet</h3>
            <p className="max-w-sm text-sm text-[color:var(--muted)]">
              When a university instructor is absent, staff raise a ticket here. It routes to
              Ops and the subject&apos;s Capability Manager for a backup.
            </p>
            {canRaise && (
              <Link href="/dashboard/tickets/new" className="btn btn-primary mt-2">
                <Plus size={16} /> Raise the first ticket
              </Link>
            )}
          </div>
        </FadeIn>
      ) : (
        <FadeIn>
          <TicketsView tickets={tickets} />
        </FadeIn>
      )}
    </div>
  );
}
