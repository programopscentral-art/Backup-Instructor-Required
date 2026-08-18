import { redirect } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { GrantForm } from "./grant-form";
import { revokeAssignment, deletePendingGrant } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";

interface AssignmentRow {
  id: string;
  user_id: string;
  role: AppRole;
  scope_type: string;
  scope_id: string | null;
  granted_at: string;
  profiles: { email: string; full_name: string | null } | null;
}
interface GrantRow {
  id: string;
  email: string;
  role: AppRole;
  scope_type: string;
  scope_id: string | null;
  created_at: string;
}

export default async function AccessPage() {
  const ctx = await getSessionContext();
  if (!ctx || !isAdminLike(ctx.roles)) redirect("/dashboard");
  const supabase = await createAuthedClient();

  const [{ data: universities }, { data: capabilities }, { data: assignments }, { data: pending }] =
    await Promise.all([
      supabase.from("universities").select("id, name").order("name"),
      supabase.from("capabilities").select("id, name").order("name"),
      supabase
        .from("role_assignments")
        .select("id, user_id, role, scope_type, scope_id, granted_at, profiles!role_assignments_user_id_fkey(email, full_name)")
        .order("granted_at", { ascending: false })
        .limit(200),
      supabase
        .from("access_grants")
        .select("id, email, role, scope_type, scope_id, created_at")
        .is("applied_at", null)
        .order("created_at", { ascending: false }),
    ]);

  const nameMap = new Map<string, string>();
  (universities ?? []).forEach((u) => nameMap.set(u.id, u.name));
  (capabilities ?? []).forEach((c) => nameMap.set(c.id, c.name));
  const scopeLabel = (type: string, id: string | null) =>
    type === "global" ? "Global" : id ? nameMap.get(id) ?? type : type;

  const assigned = (assignments ?? []) as unknown as AssignmentRow[];
  const pendingGrants = (pending ?? []) as GrantRow[];

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Access & Roles"
        subtitle="Grant, review, edit and revoke access. Every change is recorded in Logs → Access history."
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <FadeIn delay={0.05}>
          <section className="card p-6">
            <h2 className="mb-4 font-[family-name:var(--font-display)] text-base font-bold">Grant access</h2>
            <GrantForm universities={universities ?? []} capabilities={capabilities ?? []} />
            <p className="mt-4 text-xs text-[color:var(--faint)]">
              To change someone&apos;s role, revoke the old one and grant the new — it&apos;s logged both ways.
            </p>
          </section>
        </FadeIn>

        <div className="space-y-6">
          <FadeIn delay={0.12}>
            <section className="card p-6">
              <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-bold">
                Active assignments{" "}
                <span className="font-normal text-[color:var(--faint)]">({assigned.length})</span>
              </h2>
              {assigned.length === 0 ? (
                <p className="text-sm text-[color:var(--faint)]">No roles assigned yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>Role</th>
                        <th>Scope</th>
                        <th className="text-right">Revoke</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assigned.map((a) => (
                        <tr key={a.id}>
                          <td className="text-[color:var(--muted)]">{a.profiles?.email ?? "—"}</td>
                          <td>
                            <span className="pill pill-accent">{ROLE_LABELS[a.role]}</span>
                          </td>
                          <td className="text-[color:var(--muted)]">{scopeLabel(a.scope_type, a.scope_id)}</td>
                          <td className="text-right">
                            {a.user_id === ctx.userId ? (
                              <span className="text-[10px] text-[color:var(--faint)]">you</span>
                            ) : (
                              <form action={revokeAssignment}>
                                <input type="hidden" name="id" value={a.id} />
                                <button className="btn btn-danger btn-sm" title="Revoke">
                                  <Trash2 size={13} />
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </FadeIn>

          <FadeIn delay={0.18}>
            <section className="card p-6">
              <h2 className="mb-3 font-[family-name:var(--font-display)] text-base font-bold">
                Pending pre-authorizations{" "}
                <span className="font-normal text-[color:var(--faint)]">({pendingGrants.length})</span>
              </h2>
              {pendingGrants.length === 0 ? (
                <p className="text-sm text-[color:var(--faint)]">None waiting. Everyone granted has logged in.</p>
              ) : (
                <ul className="space-y-2">
                  {pendingGrants.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(251,191,36,0.2)] bg-[rgba(251,191,36,0.07)] px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-[color:var(--ink)]">{g.email}</span>
                      <span className="flex flex-none items-center gap-2">
                        <span className="pill pill-warn">
                          {ROLE_LABELS[g.role]} · {scopeLabel(g.scope_type, g.scope_id)}
                        </span>
                        <form action={deletePendingGrant}>
                          <input type="hidden" name="id" value={g.id} />
                          <button className="grid h-7 w-7 place-items-center rounded-lg text-[color:var(--rose)] hover:bg-white" title="Remove">
                            <X size={14} />
                          </button>
                        </form>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
