import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";
import { HodApprovalsView, type PendingClaim, type DoneClaim } from "./hod-approvals-view";

export const dynamic = "force-dynamic";

interface RawPending {
  id: string;
  amount: number | null;
  travel_amount: number | null;
  accommodation_amount: number | null;
  other_amount: number | null;
  late: boolean;
  nxtclaim_link: string;
  description: string | null;
  session_date: string | null;
  submitted_by_name: string | null;
  ops_approved_at: string | null;
  tickets: {
    id: string;
    ticket_no: string;
    universities: { name: string } | null;
    subjects: { name: string } | null;
    capabilities: { name: string; manager_name: string | null } | null;
  } | null;
}
interface RawDone {
  id: string;
  amount: number | null;
  hod_approved_at: string | null;
  tickets: {
    id: string;
    ticket_no: string;
    universities: { name: string } | null;
    subjects: { name: string } | null;
  } | null;
}

export default async function HodApprovalsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  // HOD is the intended user; Admin (superuser) can also see/act here. Everyone
  // else is bounced — this queue is the final-sign-off surface only.
  if (!isAdminLike(ctx.roles)) redirect("/dashboard");

  const supabase = await createAuthedClient();

  // The queue: claims Ops has approved, awaiting HOD. Oldest first (FIFO) so
  // nothing waits too long for final sign-off.
  const { data: rows } = await supabase
    .from("invoices")
    .select(
      "id, amount, travel_amount, accommodation_amount, other_amount, late, nxtclaim_link, description, session_date, submitted_by_name, ops_approved_at, tickets(id, ticket_no, universities(name), subjects(name), capabilities(name, manager_name))",
    )
    .eq("status", "ops_approved")
    .order("ops_approved_at", { ascending: true });

  const pendingRaw = (rows ?? []) as unknown as RawPending[];

  // Signed URLs for each claim's charge slips (private bucket; 1h TTL).
  const invoiceIds = pendingRaw.map((r) => r.id);
  const filesByInvoice: Record<string, { name: string; url: string }[]> = {};
  if (invoiceIds.length) {
    const { data: files } = await supabase
      .from("invoice_files")
      .select("invoice_id, path, name")
      .in("invoice_id", invoiceIds);
    await Promise.all(
      (files ?? []).map(async (f) => {
        const { data } = await supabase.storage.from("invoices").createSignedUrl(f.path, 3600);
        (filesByInvoice[f.invoice_id] ??= []).push({ name: f.name ?? "file", url: data?.signedUrl ?? "#" });
      }),
    );
  }

  const pending: PendingClaim[] = pendingRaw.map((r) => ({
    invoiceId: r.id,
    ticketId: r.tickets?.id ?? "",
    ticketNo: r.tickets?.ticket_no ?? "—",
    university: r.tickets?.universities?.name ?? "—",
    subject: r.tickets?.subjects?.name ?? "—",
    capability: r.tickets?.capabilities?.name ?? null,
    cm: r.tickets?.capabilities?.manager_name ?? null,
    amount: r.amount,
    travel: r.travel_amount,
    accommodation: r.accommodation_amount,
    other: r.other_amount,
    late: r.late,
    nxtclaimLink: r.nxtclaim_link,
    description: r.description,
    sessionDate: r.session_date,
    submittedByName: r.submitted_by_name,
    opsApprovedAt: r.ops_approved_at,
    files: filesByInvoice[r.id] ?? [],
  }));

  // Recent HOD sign-offs — a short read-only history for confidence/reference.
  const { data: doneRows } = await supabase
    .from("invoices")
    .select("id, amount, hod_approved_at, tickets(id, ticket_no, universities(name), subjects(name))")
    .eq("status", "hod_approved")
    .order("hod_approved_at", { ascending: false })
    .limit(50);
  const done: DoneClaim[] = ((doneRows ?? []) as unknown as RawDone[]).map((d) => ({
    ticketId: d.tickets?.id ?? "",
    ticketNo: d.tickets?.ticket_no ?? "—",
    university: d.tickets?.universities?.name ?? "—",
    subject: d.tickets?.subjects?.name ?? "—",
    amount: d.amount,
    approvedAt: d.hod_approved_at,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="HOD Approvals"
        subtitle="Your final sign-off queue — claims Ops has approved. Verify the amount, NxtClaim link, and charge slips, then approve (or return for a fix)."
      />
      <FadeIn delay={0.05}>
        <HodApprovalsView pending={pending} done={done} />
      </FadeIn>
    </div>
  );
}
