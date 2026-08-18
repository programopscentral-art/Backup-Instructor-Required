import Link from "next/link";
import { ReceiptText, AlertTriangle, ArrowUpRight } from "lucide-react";
import { createAuthedClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";
import { InvoicesView, type InvoiceRow as ViewRow } from "./invoices-view";

interface InvoiceRow {
  id: string;
  status: "submitted" | "ops_approved" | "hod_approved" | "returned";
  amount: number | null;
  late: boolean;
  submitted_by_name: string | null;
  submitted_at: string;
  tickets: {
    id: string;
    ticket_no: string;
    universities: { name: string } | null;
    subjects: { name: string } | null;
  } | null;
}
interface PendingTicket {
  id: string;
  ticket_no: string;
  invoice_due_at: string | null;
  universities: { name: string } | null;
  subjects: { name: string } | null;
}

export default async function InvoicesPage() {
  const supabase = await createAuthedClient();

  const [{ data: inv }, { data: pend }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, status, amount, late, submitted_by_name, submitted_at, tickets(id, ticket_no, universities(name), subjects(name))",
      )
      .order("submitted_at", { ascending: false }),
    supabase
      .from("tickets")
      .select("id, ticket_no, invoice_due_at, universities(name), subjects(name)")
      .eq("status", "invoice_pending"),
  ]);

  const invoices = (inv ?? []) as unknown as InvoiceRow[];
  const withInvoice = new Set(invoices.map((i) => i.tickets?.id));
  const now = Date.now();
  const redFlags = ((pend ?? []) as unknown as PendingTicket[]).filter(
    (t) => !withInvoice.has(t.id) && t.invoice_due_at && now > new Date(t.invoice_due_at).getTime(),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Invoices"
        subtitle="Offline claims — NxtClaim + charge slips, 24-hour SLA, and the Ops → HOD approval chain."
      />

      {redFlags.length > 0 && (
        <FadeIn className="mb-6">
          <div className="card border-[#f6cdd6] bg-[#fdeef1] p-5">
            <div className="mb-3 flex items-center gap-2 text-[color:var(--rose)]">
              <AlertTriangle size={18} />
              <h3 className="font-[family-name:var(--font-display)] text-sm font-bold">
                Red-flagged · {redFlags.length} invoice{redFlags.length > 1 ? "s" : ""} overdue (24h passed, not submitted)
              </h3>
            </div>
            <div className="flex flex-col gap-2">
              {redFlags.map((t) => (
                <Link
                  key={t.id}
                  href={`/dashboard/tickets/${t.id}`}
                  className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 text-sm hover:bg-white"
                >
                  <span>
                    <span className="font-semibold">{t.ticket_no}</span> · {t.subjects?.name ?? "—"} ·{" "}
                    <span className="text-[color:var(--muted)]">{t.universities?.name ?? "—"}</span>
                  </span>
                  <ArrowUpRight size={15} className="text-[color:var(--rose)]" />
                </Link>
              ))}
            </div>
          </div>
        </FadeIn>
      )}

      {invoices.length === 0 ? (
        <FadeIn>
          <div className="card flex flex-col items-center gap-3 p-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
              <ReceiptText size={26} />
            </span>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-bold">No invoices yet</h3>
            <p className="max-w-sm text-sm text-[color:var(--muted)]">
              When an offline backup session is delivered, the claim (NxtClaim + slips) is filed from
              the ticket and appears here for Ops → HOD approval.
            </p>
          </div>
        </FadeIn>
      ) : (
        <FadeIn delay={0.05}>
          <InvoicesView
            invoices={invoices.map<ViewRow>((i) => ({
              id: i.id,
              status: i.status,
              amount: i.amount,
              late: i.late,
              submitted_by_name: i.submitted_by_name,
              submitted_at: i.submitted_at,
              ticket_id: i.tickets?.id ?? null,
              ticket_no: i.tickets?.ticket_no ?? null,
              university: i.tickets?.universities?.name ?? null,
              subject: i.tickets?.subjects?.name ?? null,
            }))}
          />
        </FadeIn>
      )}
    </div>
  );
}
