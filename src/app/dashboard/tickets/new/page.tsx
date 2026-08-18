import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { createAuthedClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { isAdminLike } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";
import { NewTicketForm, type SubjectOption } from "./new-ticket-form";

export default async function NewTicketPage() {
  const ctx = await getSessionContext();
  const roles = ctx?.roles ?? [];
  // Raising absence tickets is a University Ops (staff) privilege only.
  const canRaise = isAdminLike(roles) || roles.includes("university_staff");

  if (!canRaise) {
    return (
      <div>
        <Link href="/dashboard/tickets" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--accent)]">
          <ArrowLeft size={15} /> Back to tickets
        </Link>
        <FadeIn>
          <div className="card flex flex-col items-center gap-3 p-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
              <Lock size={24} />
            </span>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-bold">
              Raising tickets is a University Ops privilege
            </h3>
            <p className="max-w-md text-sm text-[color:var(--muted)]">
              As an <strong>instructor</strong>, you can&apos;t raise an absence ticket — that&apos;s handled by
              your university&apos;s Ops team (BOA / PMA / PM / COS).
            </p>
            <div className="mt-1 max-w-md rounded-xl border border-[color:var(--line)] bg-[color:var(--cream-2)] px-4 py-3 text-left text-sm text-[color:var(--muted)]">
              <p className="mb-1 font-semibold text-[color:var(--ink)]">What to do</p>
              <p>
                If you&apos;ll be absent or assigned other work, <strong>inform your university Ops/staff team</strong>{" "}
                so they can raise the backup request on your behalf. You can still track its progress here once it&apos;s raised.
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    );
  }

  const supabase = await createAuthedClient();
  const [
    { data: universities },
    { data: subjects },
    { data: instructors },
    { data: reasons },
    { data: cms },
  ] = await Promise.all([
    supabase.from("universities").select("id, name").order("name"),
    supabase
      .from("subjects")
      .select("id, name, capability_id, capabilities(name, manager_name)")
      .order("name"),
    supabase.from("instructors").select("id, instructor_name, emp_id, university_id").order("instructor_name"),
    supabase.from("ticket_reasons").select("id, label").order("label"),
    supabase.rpc("list_capability_managers"),
  ]);

  const subjectOptions = ((subjects ?? []) as unknown as Array<{
    id: string;
    name: string;
    capability_id: string | null;
    capabilities: { name: string; manager_name: string | null } | null;
  }>).map<SubjectOption>((s) => ({
    id: s.id,
    name: s.name,
    capability: s.capabilities?.name ?? null,
    manager: s.capabilities?.manager_name ?? null,
  }));

  return (
    <div>
      <Link
        href="/dashboard/tickets"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--accent)]"
      >
        <ArrowLeft size={15} /> Back to tickets
      </Link>
      <PageHeader
        eyebrow="Operations"
        title="Raise an absence ticket"
        subtitle="Report an absent instructor and request a backup. It routes to Ops and the subject's Capability Manager."
      />
      <FadeIn delay={0.05} className="max-w-2xl">
        <div className="card p-6 sm:p-8">
          <NewTicketForm
            universities={universities ?? []}
            subjects={subjectOptions}
            instructors={(instructors ?? []) as { id: string; instructor_name: string; emp_id: string | null; university_id: string | null }[]}
            reasons={(reasons ?? []) as { id: string; label: string }[]}
            cms={(cms ?? []) as { user_id: string; name: string; email: string; capability: string | null }[]}
          />
        </div>
      </FadeIn>
    </div>
  );
}
