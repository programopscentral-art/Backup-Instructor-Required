import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";

interface Msg {
  title: string;
  body: string;
  ticketId: string;
  type?: string;
}

/** Notify the assigned backup instructor (by their pool email + linked login, if any). */
export async function notifyBackup(backupId: string | null | undefined, msg: Msg) {
  if (!backupId) return;
  const db = createAdminClient();
  const { data: bp } = await db
    .from("backup_instructor_pool")
    .select("email")
    .eq("id", backupId)
    .maybeSingle();
  const email = (bp as { email: string | null } | null)?.email ?? null;
  if (!email) return;
  const { data: prof } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
  await notify(db, {
    recipientUserId: (prof as { id: string } | null)?.id ?? null,
    recipientEmail: email,
    type: msg.type ?? "assignment",
    title: msg.title,
    body: msg.body,
    ticketId: msg.ticketId,
  });
}

/**
 * Notify every active Capability Manager of a capability (in-app + email).
 * `excludeEmail` skips one person (e.g. the actor who just performed the action,
 * so they don't get pinged about their own change).
 */
export async function notifyCapabilityManagers(
  capabilityId: string | null | undefined,
  msg: Msg,
  excludeEmail?: string | null,
): Promise<number> {
  if (!capabilityId) return 0;
  const db = createAdminClient();
  const { data: cms } = await db
    .from("capability_managers")
    .select("email")
    .eq("capability_id", capabilityId)
    .eq("status", "active");
  const skip = excludeEmail?.trim().toLowerCase() || null;
  let notified = 0;
  for (const cm of (cms ?? []) as { email: string | null }[]) {
    const email = cm.email;
    if (!email) continue;
    if (skip && email.toLowerCase() === skip) continue;
    const { data: prof } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
    await notify(db, {
      recipientUserId: (prof as { id: string } | null)?.id ?? null,
      recipientEmail: email,
      type: msg.type ?? "ticket",
      title: msg.title,
      body: msg.body,
      ticketId: msg.ticketId,
    });
    notified++;
  }
  return notified;
}

/** Notify everyone holding a given role (admin / hod). */
async function notifyByRoles(roles: string[], msg: Msg) {
  const db = createAdminClient();
  const { data: ras } = await db.from("role_assignments").select("user_id").in("role", roles);
  const ids = [...new Set(((ras ?? []) as { user_id: string }[]).map((r) => r.user_id))];
  if (!ids.length) return;
  const { data: profs } = await db.from("profiles").select("id, email").in("id", ids);
  for (const p of (profs ?? []) as { id: string; email: string | null }[]) {
    await notify(db, {
      recipientUserId: p.id,
      recipientEmail: p.email,
      type: msg.type ?? "invoice",
      title: msg.title,
      body: msg.body,
      ticketId: msg.ticketId,
    });
  }
}

/** Ops queue — all Admins (Program Ops). */
export function notifyOps(msg: Msg) {
  return notifyByRoles(["admin"], msg);
}

/** Final-approval queue — all HODs (plus Admins as superuser oversight). */
export function notifyHod(msg: Msg) {
  return notifyByRoles(["hod", "admin"], msg);
}
