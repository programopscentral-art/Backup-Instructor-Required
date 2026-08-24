"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { notify } from "@/lib/notify";
import { closeZohoTicket } from "@/lib/zoho/close";
import type { TicketStatus } from "@/lib/tickets/status";

export interface ActionState {
  ok?: string;
  error?: string;
  ticketId?: string;
}

async function logEvent(
  supabase: Awaited<ReturnType<typeof createAuthedClient>>,
  ticketId: string,
  actorId: string,
  actorName: string,
  from: TicketStatus,
  to: TicketStatus,
  note?: string,
) {
  await supabase.from("ticket_events").insert({
    ticket_id: ticketId,
    actor_id: actorId,
    actor_name: actorName,
    from_status: from,
    to_status: to,
    note: note || null,
  });
}

/** University staff (or admin) raises an absence ticket. */
export async function createTicket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { error: "Not signed in." };

  const university_id = String(formData.get("university_id") || "");
  const subject_id = String(formData.get("subject_id") || "");
  const absent_instructor_name = String(formData.get("absent_instructor_name") || "").trim();
  const absent_instructor_id = String(formData.get("absent_instructor_id") || "") || null;
  const reason_category = String(formData.get("reason_category") || "").trim() || null;
  const reason = String(formData.get("reason") || "").trim();
  const absent_from = String(formData.get("absent_from") || "") || null;
  const absent_to = String(formData.get("absent_to") || "") || null;
  const time_from = String(formData.get("time_from") || "").trim() || null;
  const time_to = String(formData.get("time_to") || "").trim() || null;
  const requested_mode = String(formData.get("requested_mode") || "undecided");
  const notifyCmIds = String(formData.get("notify_cm_ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!university_id) return { error: "Select a university." };
  if (!subject_id) return { error: "Select a subject." };
  if (!absent_instructor_name) return { error: "Select the absent instructor." };

  const supabase = await createAuthedClient();

  // Resolve the owning capability from the (normalized) subject.
  const { data: subject } = await supabase
    .from("subjects")
    .select("capability_id")
    .eq("id", subject_id)
    .maybeSingle();

  const capability_id = (subject?.capability_id as string | null) ?? null;

  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      university_id,
      subject_id,
      capability_id,
      absent_instructor_name,
      absent_instructor_id,
      reason_category,
      reason,
      absent_from,
      absent_to,
      time_from,
      time_to,
      requested_mode,
      raised_by: ctx.userId,
      status: "raised",
    })
    .select("id, ticket_no, universities(name), subjects(name)")
    .single();

  if (error) {
    if (/row-level security/i.test(error.message)) {
      return { error: "You don't have permission to raise a ticket for this university." };
    }
    return { error: error.message };
  }

  const info = ticket as unknown as {
    id: string;
    ticket_no: string;
    universities: { name: string } | null;
    subjects: { name: string } | null;
  };

  await logEvent(
    supabase,
    ticket.id,
    ctx.userId,
    ctx.profile?.full_name || ctx.email,
    "raised",
    "raised",
    capability_id ? "Ticket raised." : "Raised — subject has no Capability Manager yet (needs admin).",
  );

  // Optionally notify selected capability managers (esp. when no CM is mapped).
  if (notifyCmIds.length) {
    const { data: cms } = await supabase.rpc("list_capability_managers");
    const list = (cms ?? []) as { user_id: string; name: string; email: string }[];
    const targets = list.filter((c) => notifyCmIds.includes(c.user_id));
    for (const t of targets) {
      await notify(supabase, {
        recipientUserId: t.user_id,
        recipientEmail: t.email,
        type: "ticket",
        title: `Backup requested — ${info.ticket_no}`,
        body: `${ctx.profile?.full_name || ctx.email} raised a backup request for ${info.subjects?.name ?? "a subject"} at ${info.universities?.name ?? "a university"}. Absent: ${absent_instructor_name}. Please review.`,
        ticketId: ticket.id,
      });
    }
  }

  revalidatePath("/dashboard/tickets");
  // Return the id and let the client navigate — redirect() inside a
  // useActionState action breaks under Next 16 / Turbopack.
  return { ok: "created", ticketId: ticket.id };
}

const NEXT: Record<string, { to: TicketStatus; note: string }> = {
  confirm: { to: "confirmed", note: "Ops confirmed & dispatched the backup." },
  session: { to: "session_done", note: "Session delivered." },
  to_invoice: { to: "invoice_pending", note: "Offline — awaiting invoice within 24h." },
  close_online: { to: "closed", note: "Online session complete — ticket closed." },
  ops_approve: { to: "ops_approved", note: "Ops approved the claim." },
  hod_approve: { to: "hod_approved", note: "HOD gave final approval." },
  close: { to: "closed", note: "Ticket closed." },
  cancel: { to: "cancelled", note: "Ticket cancelled." },
};

/** Drives a ticket through its lifecycle. */
export async function transitionTicket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { error: "Not signed in." };

  const ticketId = String(formData.get("ticket_id") || "");
  const action = String(formData.get("action") || "");
  const note = String(formData.get("note") || "").trim() || undefined;
  if (!ticketId || !action) return { error: "Missing action." };

  const supabase = await createAuthedClient();
  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, status, mode")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return { error: "Ticket not found." };

  const from = ticket.status as TicketStatus;
  const actorName = ctx.profile?.full_name || ctx.email;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let to: TicketStatus;

  if (action === "assign") {
    const backupId = String(formData.get("assigned_backup_id") || "") || null;
    const backupName = String(formData.get("assigned_backup_name") || "").trim();
    const mode = String(formData.get("mode") || "undecided");
    if (!backupName && !backupId) return { error: "Pick a backup instructor." };
    to = "backup_assigned";
    update.assigned_backup_id = backupId;
    update.assigned_backup_name = backupName || null;
    update.mode = mode;
    update.assigned_cm = ctx.userId;
    update.status = to;
  } else {
    const step = NEXT[action];
    if (!step) return { error: "Unknown action." };
    if ((action === "ops_approve" || action === "hod_approve" || action === "close") && !isAdminLike(ctx.roles)) {
      return { error: "Only Ops/HOD can approve." };
    }
    to = step.to;
    if (action === "confirm") update.confirmed_by = ctx.userId;
    // Start the 24-hour invoice SLA clock when going offline → invoice.
    if (action === "to_invoice") {
      update.invoice_due_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    update.status = to;
  }

  const { error } = await supabase.from("tickets").update(update).eq("id", ticketId);
  if (error) return { error: error.message };

  await logEvent(supabase, ticketId, ctx.userId, actorName, from, to, note ?? NEXT[action]?.note);

  // Notify the university (raiser) when a backup is assigned / confirmed.
  if (action === "assign" || action === "confirm") {
    const { data: full } = await supabase
      .from("tickets")
      .select("ticket_no, raised_by, mode, assigned_backup_name, source, zoho_record_id, universities(name), subjects(name)")
      .eq("id", ticketId)
      .maybeSingle();
    const f = full as unknown as {
      ticket_no: string;
      raised_by: string | null;
      mode: string;
      assigned_backup_name: string | null;
      source: string | null;
      zoho_record_id: string | null;
      universities: { name: string } | null;
      subjects: { name: string } | null;
    } | null;

    // Backup allocated & dispatched → close the origin Zoho ticket (best-effort).
    if (action === "confirm" && f?.source === "zoho" && f.zoho_record_id) {
      const r = await closeZohoTicket(f.zoho_record_id);
      await logEvent(
        supabase,
        ticketId,
        ctx.userId,
        "Zoho sync",
        to,
        to,
        r.ok ? "Zoho ticket closed (backup allocated)." : `Zoho close failed: ${r.detail}`,
      );
    }
    if (f?.raised_by) {
      const { data: raiser } = await supabase.from("profiles").select("email").eq("id", f.raised_by).maybeSingle();
      const subj = f.subjects?.name ?? "the subject";
      const uni = f.universities?.name ?? "the university";
      const title = action === "confirm" ? `✅ Backup confirmed — ${f.ticket_no}` : `Backup assigned — ${f.ticket_no}`;
      const body =
        action === "confirm"
          ? `Your backup for ${subj} at ${uni} is confirmed: ${f.assigned_backup_name ?? "—"} (${f.mode}). The instructor has been dispatched.`
          : `A backup (${f.assigned_backup_name ?? "—"}) has been assigned for ${subj} at ${uni}, pending Ops confirmation.`;
      await notify(supabase, {
        recipientEmail: (raiser as { email: string } | null)?.email,
        recipientUserId: f.raised_by,
        type: "ticket",
        title,
        body,
        ticketId,
      });
    }
  }

  revalidatePath(`/dashboard/tickets/${ticketId}`);
  revalidatePath("/dashboard/tickets");
  return { ok: "Updated." };
}

/**
 * Resolve the missing-CM edge case from a ticket: link the subject to a
 * capability (existing or new) that has a manager, and route the ticket to it.
 * Admin/HOD only. Persists the mapping so future tickets route correctly.
 */
export async function assignCapability(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx || !isAdminLike(ctx.roles)) return { error: "Only Ops/HOD can assign a capability." };

  const ticketId = String(formData.get("ticket_id") || "");
  const subjectId = String(formData.get("subject_id") || "");
  let capabilityId = String(formData.get("capability_id") || "");
  const newName = String(formData.get("new_name") || "").trim();
  const managerUserId = String(formData.get("manager_user_id") || "") || null;
  const managerName = String(formData.get("manager_name") || "").trim() || null;

  if (!ticketId || !subjectId) return { error: "Missing ticket/subject." };

  const supabase = await createAuthedClient();
  let managerNameResolved = managerName;
  let managerUserResolved = managerUserId;

  if (capabilityId === "__new__" || (!capabilityId && newName)) {
    if (!newName) return { error: "Enter a capability name." };
    if (managerUserId && !managerName) {
      const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", managerUserId).maybeSingle();
      managerNameResolved = (p as { full_name: string | null; email: string } | null)?.full_name || (p as { email: string } | null)?.email || null;
    }
    const { data: cap, error: cErr } = await supabase
      .from("capabilities")
      .insert({ name: newName, manager_user_id: managerUserResolved, manager_name: managerNameResolved, status: "active" })
      .select("id, manager_user_id, manager_name")
      .single();
    if (cErr) return { error: cErr.message };
    capabilityId = cap.id;
    managerUserResolved = cap.manager_user_id;
    managerNameResolved = cap.manager_name;
  } else {
    if (!capabilityId) return { error: "Pick a capability." };
    const { data: cap } = await supabase.from("capabilities").select("manager_user_id, manager_name").eq("id", capabilityId).maybeSingle();
    managerUserResolved = (cap as { manager_user_id: string | null } | null)?.manager_user_id ?? null;
    managerNameResolved = (cap as { manager_name: string | null } | null)?.manager_name ?? null;
  }

  // Persist mapping (future tickets for this subject route automatically) + route this ticket.
  await supabase.from("subjects").update({ capability_id: capabilityId }).eq("id", subjectId);
  const { error: tErr } = await supabase
    .from("tickets")
    .update({ capability_id: capabilityId, assigned_cm: managerUserResolved, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (tErr) return { error: tErr.message };

  await supabase.from("ticket_events").insert({
    ticket_id: ticketId,
    actor_id: ctx.userId,
    actor_name: ctx.profile?.full_name || ctx.email,
    from_status: "raised",
    to_status: "raised",
    note: `Capability assigned: ${managerNameResolved ? `CM ${managerNameResolved}` : "manager pending"}.`,
  });

  if (managerUserResolved) {
    await notify(supabase, {
      recipientUserId: managerUserResolved,
      type: "ticket",
      title: "New ticket in your capability",
      body: "A backup request was routed to your capability. Please review and assign a backup.",
      ticketId,
    });
  }

  revalidatePath(`/dashboard/tickets/${ticketId}`);
  return { ok: "Capability & manager assigned." };
}

/**
 * Resolve unmatched intake data on a Zoho-raised ticket: set the University
 * (pick existing or create a new one on the spot) and optionally remap the
 * Subject to an existing one (which also re-routes capability + CM). Admin/HOD
 * only. Unblocks tickets whose Zoho data didn't match the product directories.
 */
export async function resolveTicketIntake(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx || !isAdminLike(ctx.roles)) return { error: "Only Ops/HOD can resolve ticket data." };

  const ticketId = String(formData.get("ticket_id") || "");
  if (!ticketId) return { error: "Missing ticket." };
  let universityId = String(formData.get("university_id") || "");
  const newUniName = String(formData.get("new_university_name") || "").trim();
  const newUniCity = String(formData.get("new_university_city") || "").trim() || null;
  const subjectId = String(formData.get("subject_id") || "") || null;

  const supabase = await createAuthedClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const notes: string[] = [];

  // ---- University: create new, or set existing ----
  if (universityId === "__new__" || (!universityId && newUniName)) {
    if (!newUniName) return { error: "Enter a university name." };
    const { data: u, error } = await supabase
      .from("universities")
      .insert({ name: newUniName, city: newUniCity, status: "active" })
      .select("id, name")
      .single();
    if (error) return { error: error.message };
    universityId = u.id;
    update.university_id = universityId;
    notes.push(`University created & set: ${u.name}`);
  } else if (universityId) {
    update.university_id = universityId;
    const { data: u } = await supabase.from("universities").select("name").eq("id", universityId).maybeSingle();
    notes.push(`University set: ${(u as { name: string } | null)?.name ?? "—"}`);
  }

  // ---- Optional subject remap (re-routes capability + CM) ----
  if (subjectId) {
    const { data: s } = await supabase
      .from("subjects")
      .select("id, name, capability_id")
      .eq("id", subjectId)
      .maybeSingle();
    const subj = s as { id: string; name: string; capability_id: string | null } | null;
    if (subj) {
      update.subject_id = subj.id;
      update.capability_id = subj.capability_id ?? null;
      if (subj.capability_id) {
        const { data: cap } = await supabase
          .from("capabilities")
          .select("manager_user_id")
          .eq("id", subj.capability_id)
          .maybeSingle();
        update.assigned_cm = (cap as { manager_user_id: string | null } | null)?.manager_user_id ?? null;
      }
      notes.push(`Subject set: ${subj.name}`);
    }
  }

  if (notes.length === 0) return { error: "Pick a university (or a subject) to set." };

  const { error: tErr } = await supabase.from("tickets").update(update).eq("id", ticketId);
  if (tErr) return { error: tErr.message };

  await supabase.from("ticket_events").insert({
    ticket_id: ticketId,
    actor_id: ctx.userId,
    actor_name: ctx.profile?.full_name || ctx.email,
    from_status: "raised",
    to_status: "raised",
    note: `Resolved intake — ${notes.join("; ")}.`,
  });

  revalidatePath(`/dashboard/tickets/${ticketId}`);
  revalidatePath("/dashboard/tickets");
  return { ok: `Resolved — ${notes.join("; ")}.` };
}
