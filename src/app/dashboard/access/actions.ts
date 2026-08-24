"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import {
  isAdminLike,
  isDomainAllowed,
  type AppRole,
  type ScopeKind,
} from "@/lib/auth/roles";

export interface GrantState {
  ok?: string;
  error?: string;
}

const VALID_ROLES: AppRole[] = [
  "admin",
  "hod",
  "capability_manager",
  "cma",
  "university_staff",
  "instructor",
];

export async function grantAccess(
  _prev: GrantState,
  formData: FormData,
): Promise<GrantState> {
  const ctx = await getSessionContext();
  if (!ctx || !isAdminLike(ctx.roles)) return { error: "Not authorized." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as AppRole;
  const scopeType = String(formData.get("scope_type") ?? "global") as ScopeKind;
  let scopeId: string | null = String(formData.get("scope_id") ?? "").trim() || null;

  if (!email) return { error: "Email is required." };
  if (!isDomainAllowed(email))
    return { error: "Email must be @nxtwave.in or @nxtwave.co.in." };
  if (!VALID_ROLES.includes(role)) return { error: "Pick a role." };
  // Only a true Admin may grant the Admin role — stops an HOD self-escalating.
  if (role === "admin" && !ctx.roles.includes("admin"))
    return { error: "Only an Admin can grant the Admin role." };

  if (scopeType === "global") scopeId = null;
  if (scopeType !== "global" && !scopeId)
    return { error: "Select a scope for this role." };

  const supabase = await createAuthedClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profile?.id) {
    // Anti-lockout / anti-self-escalation: an admin can't rewrite their own role.
    if (profile.id === ctx.userId)
      return { error: "You can't change your own role. Ask another admin." };
    // One person = one role. Granting a new role REPLACES any existing one
    // atomically (upsert on the unique user_id) — never a delete-then-insert
    // window that could leave the user with zero roles.
    const { error } = await supabase
      .from("role_assignments")
      .upsert(
        {
          user_id: profile.id,
          role,
          scope_type: scopeType,
          scope_id: scopeId,
          granted_by: ctx.userId,
        },
        { onConflict: "user_id" },
      );
    if (error) return { error: error.message };
    await supabase.from("profiles").update({ status: "active" }).eq("id", profile.id);
    await audit(supabase, ctx, "grant_role", { email, role, scopeType, scopeId, detail: "Assigned to existing user (replaced any prior role)" });
    revalidatePath("/dashboard/access");
    return { ok: `Role set to ${role} for ${email} (any previous role was removed). Applies on their next page load.` };
  }

  // Pending pre-authorization: keep exactly one per email — replace any prior pending grant.
  await supabase.from("access_grants").delete().ilike("email", email).is("applied_at", null);
  const { error } = await supabase.from("access_grants").insert({
    email,
    role,
    scope_type: scopeType,
    scope_id: scopeId,
    granted_by: ctx.userId,
  });
  if (error) return { error: error.message };
  await audit(supabase, ctx, "grant_role", { email, role, scopeType, scopeId, detail: "Pre-authorized (pending first login)" });
  revalidatePath("/dashboard/access");
  return {
    ok: `Access pre-authorized for ${email}. Applied automatically on first login.`,
  };
}

type SB = Awaited<ReturnType<typeof createAuthedClient>>;
type Ctx = NonNullable<Awaited<ReturnType<typeof getSessionContext>>>;

async function audit(
  supabase: SB,
  ctx: Ctx,
  action: string,
  x: { email?: string | null; role?: string | null; scopeType?: string | null; scopeId?: string | null; detail?: string },
) {
  try {
    await supabase.from("audit_log").insert({
      actor_id: ctx.userId,
      actor_name: ctx.profile?.full_name || ctx.email,
      action,
      target_email: x.email ?? null,
      role: x.role ?? null,
      scope_type: x.scopeType ?? null,
      scope_id: x.scopeId ?? null,
      detail: x.detail ?? null,
    });
  } catch {
    /* non-fatal */
  }
}

/** Revoke an active role assignment. Admins can't revoke their own (anti-lockout). */
export async function revokeAssignment(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx || !isAdminLike(ctx.roles)) return;
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = await createAuthedClient();
  const { data: a } = await supabase
    .from("role_assignments")
    .select("user_id, role, scope_type, scope_id, profiles!role_assignments_user_id_fkey(email)")
    .eq("id", id)
    .maybeSingle();
  if (!a) return;
  if (a.user_id === ctx.userId) return; // never let an admin lock themselves out
  if (a.role === "admin" && !ctx.roles.includes("admin")) return; // only admins touch admin roles
  await supabase.from("role_assignments").delete().eq("id", id);
  await audit(supabase, ctx, "revoke_role", {
    email: (a.profiles as unknown as { email: string } | null)?.email,
    role: a.role,
    scopeType: a.scope_type,
    scopeId: a.scope_id,
    detail: "Role revoked",
  });
  revalidatePath("/dashboard/access");
}

/** Remove a pending pre-authorization (email grant not yet applied). */
export async function deletePendingGrant(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx || !isAdminLike(ctx.roles)) return;
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = await createAuthedClient();
  const { data: g } = await supabase
    .from("access_grants")
    .select("email, role, scope_type, scope_id")
    .eq("id", id)
    .maybeSingle();
  if (g?.role === "admin" && !ctx.roles.includes("admin")) return; // only admins touch admin grants
  await supabase.from("access_grants").delete().eq("id", id);
  if (g)
    await audit(supabase, ctx, "delete_grant", {
      email: g.email,
      role: g.role,
      scopeType: g.scope_type,
      scopeId: g.scope_id,
      detail: "Pending pre-authorization removed",
    });
  revalidatePath("/dashboard/access");
}
