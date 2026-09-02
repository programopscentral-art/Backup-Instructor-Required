"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminLike } from "@/lib/auth/roles";
import { resolveSubjectName, ensureSubject } from "@/lib/tickets/subject-routing";
import { notify } from "@/lib/notify";
import { notifyBackup, notifyHod, notifyOps, notifyCapabilityManagers } from "@/lib/notify-targets";
import { setZohoStatus, ZOHO_STATUS } from "@/lib/zoho/close";
import { STATUS_META, type TicketStatus } from "@/lib/tickets/status";

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
  const subject_name = String(formData.get("subject_name") || "").trim();
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
  if (!subject_name) return { error: "Select a subject." };
  if (!absent_instructor_name) return { error: "Select the absent instructor." };

  const supabase = await createAuthedClient();

  // Resolve subject → capability with the SAME vertical-first resolver Zoho uses,
  // so the product and Zoho route identically. Subject rows are system-managed
  // reference data, so the resolve runs on the service-role client.
  const { capabilityId: capability_id, subjectId: subject_id } = await resolveSubjectName(
    createAdminClient(),
    subject_name,
  );

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

  // Route notifications exactly like the Zoho intake so both paths behave the
  // same: every CM of the subject's vertical (in-app + email), plus admins as a
  // safety net when there's no vertical or the vertical has no CMs — so a raise
  // is never silent.
  const subjName = info.subjects?.name ?? subject_name;
  const uniName = info.universities?.name ?? "a university";
  const raiserLabel = ctx.profile?.full_name || ctx.email;

  if (capability_id) {
    const notified = await notifyCapabilityManagers(
      capability_id,
      {
        ticketId: ticket.id,
        title: `🆕 New backup request — ${info.ticket_no}`,
        body: `${raiserLabel} raised a backup request for ${subjName} at ${uniName}. Absent: ${absent_instructor_name}. Please review and assign a backup.`,
      },
      ctx.email,
    );
    // B2 — the vertical exists but has no CMs: don't let it sit silently.
    if (notified === 0) {
      await notifyOps({
        ticketId: ticket.id,
        title: `⚠️ Backup request with no CM — ${info.ticket_no}`,
        body: `${subjName} at ${uniName} has no Capability Manager. Add one in Directory → Capability Managers so it can be assigned. Absent: ${absent_instructor_name}.`,
      });
    }
  } else {
    // No vertical → new/unknown subject. Alert Ops/HOD to map it (same as Zoho).
    await notifyOps({
      ticketId: ticket.id,
      title: `⚠️ New subject — needs admin — ${info.ticket_no}`,
      body: `A ticket for "${subject_name}" at ${uniName} was raised, but that subject isn't mapped to a vertical yet. Add the vertical + a Capability Manager, then it routes automatically. Absent: ${absent_instructor_name}.`,
    });
  }

  // Also honour any manually-selected CMs from the "Notify Capability Managers" field.
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
        body: `${raiserLabel} raised a backup request for ${subjName} at ${uniName}. Absent: ${absent_instructor_name}. Please review.`,
        ticketId: ticket.id,
      });
    }
  }

  revalidatePath("/dashboard/tickets");
  // Return the id and let the client navigate — redirect() inside a
  // useActionState action breaks under Next 16 / Turbopack.
  return { ok: "created", ticketId: ticket.id };
}

// Legal predecessor statuses for each action — enforces the state machine
// server-side (the client only hides buttons, which isn't a real guard).
const PRE: Record<string, TicketStatus[]> = {
  assign: ["raised"],
  confirm: ["backup_assigned"],
  session: ["confirmed"],
  to_invoice: ["session_done"],
  close_online: ["session_done"],
  ops_approve: ["invoice_pending"],
  hod_approve: ["ops_approved"],
  close: ["hod_approved"],
  cancel: ["raised", "backup_assigned", "confirmed", "session_done", "invoice_pending", "ops_approved", "hod_approved"],
};

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
    .select("id, status, mode, capability_id, absent_to, source, zoho_record_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return { error: "Ticket not found." };

  const from = ticket.status as TicketStatus;
  // Reject illegal transitions (skip/reverse) regardless of what the client sends.
  if (!PRE[action]?.includes(from)) {
    return { error: `Can't do that from "${STATUS_META[from]?.label ?? from}".` };
  }

  // Explicit server-side authorization (defense-in-depth; RLS also enforces it):
  // assigning is admin or a Capability Manager; every other transition is Ops/HOD.
  const adminLike = isAdminLike(ctx.roles);
  const isCM = ctx.roles.includes("capability_manager") || ctx.roles.includes("cma");
  if (action === "assign") {
    if (!adminLike && !isCM) return { error: "Not authorized to assign a backup." };
  } else if (!adminLike) {
    return { error: "Only Ops/HOD can perform this action." };
  }
  const actorName = ctx.profile?.full_name || ctx.email;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let to: TicketStatus;
  let assignNote: string | undefined;

  if (action === "assign") {
    const backupId = String(formData.get("assigned_backup_id") || "") || null;
    const backupName = String(formData.get("assigned_backup_name") || "").trim();
    const mode = String(formData.get("mode") || "undecided");
    if (!backupName && !backupId) return { error: "Pick a backup instructor." };
    // A pool-selected backup must belong to this ticket's capability (no cross-
    // capability assignment via a crafted id). We also read its email so we can
    // flag assignments where the backup can't be reached (no notify / no upload).
    let backupEmail: string | null = null;
    if (backupId) {
      const { data: bp } = await supabase
        .from("backup_instructor_pool")
        .select("capability_id, email")
        .eq("id", backupId)
        .maybeSingle();
      if (!bp) return { error: "Selected backup not found." };
      if (ticket.capability_id && bp.capability_id !== ticket.capability_id) {
        return { error: "That backup belongs to a different capability." };
      }
      backupEmail = (bp as { email: string | null }).email;
    }
    to = "backup_assigned";
    update.assigned_backup_id = backupId;
    update.assigned_backup_name = backupName || null;
    update.mode = mode;
    update.assigned_cm = ctx.userId;
    update.status = to;
    // Audit note records reachability so an unreachable backup is never silent.
    assignNote = `Backup assigned${backupName ? `: ${backupName}` : ""}.`;
    if (!backupEmail) {
      assignNote +=
        " ⚠ No email on file — the backup won't be auto-notified or able to upload their claim; add an email in Backup Pool.";
    }
  } else {
    const step = NEXT[action];
    if (!step) return { error: "Unknown action." };
    if ((action === "ops_approve" || action === "hod_approve" || action === "close") && !isAdminLike(ctx.roles)) {
      return { error: "Only Ops/HOD can approve." };
    }
    to = step.to;
    if (action === "confirm") update.confirmed_by = ctx.userId;
    // Invoice window opens at 4 PM IST on the absent END date and runs +24h.
    // (Reminders start at that 4 PM and repeat every 5h until the claim is filed.)
    if (action === "to_invoice") {
      const at = (ticket as { absent_to: string | null }).absent_to;
      const openAt = at ? new Date(`${at}T16:00:00+05:30`) : new Date();
      const dueAt = new Date(openAt.getTime() + 24 * 60 * 60 * 1000);
      update.invoice_due_at = dueAt.toISOString();
    }
    update.status = to;
  }

  const { error } = await supabase.from("tickets").update(update).eq("id", ticketId);
  if (error) return { error: error.message };

  await logEvent(supabase, ticketId, ctx.userId, actorName, from, to, note ?? assignNote ?? NEXT[action]?.note);

  // Mirror the lifecycle back to the origin Zoho ticket's status (best-effort;
  // a clean no-op until Zoho OAuth is configured). Assign → In Progress,
  // Confirm → Resolved (arranged — online or offline), Cancel → Discard.
  const zt = ticket as unknown as { source: string | null; zoho_record_id: string | null };
  if (zt.source === "zoho" && zt.zoho_record_id) {
    const zStatus =
      action === "confirm"
        ? ZOHO_STATUS.resolved
        : action === "assign"
          ? ZOHO_STATUS.inProgress
          : action === "cancel"
            ? ZOHO_STATUS.discard
            : null;
    if (zStatus) {
      const r = await setZohoStatus(zt.zoho_record_id, zStatus);
      await logEvent(
        supabase,
        ticketId,
        ctx.userId,
        "Zoho sync",
        to,
        to,
        r.ok ? `Zoho ticket set to "${zStatus}".` : `Zoho sync failed: ${r.detail}`,
      );
    }
  }

  // Fire the right notifications for this step: raiser, the assigned backup,
  // and the Ops/HOD approval queues — so every party is alerted end to end.
  const NOTIFY_ACTIONS = ["assign", "confirm", "to_invoice", "ops_approve", "hod_approve"];
  if (NOTIFY_ACTIONS.includes(action)) {
    const { data: full } = await supabase
      .from("tickets")
      .select("ticket_no, raised_by, mode, assigned_backup_id, assigned_backup_name, source, zoho_record_id, universities(name), subjects(name)")
      .eq("id", ticketId)
      .maybeSingle();
    const f = full as unknown as {
      ticket_no: string;
      raised_by: string | null;
      mode: string;
      assigned_backup_id: string | null;
      assigned_backup_name: string | null;
      source: string | null;
      zoho_record_id: string | null;
      universities: { name: string } | null;
      subjects: { name: string } | null;
    } | null;
    const subj = f?.subjects?.name ?? "the subject";
    const uni = f?.universities?.name ?? "the university";

    // Raiser — on assign / confirm.
    if ((action === "assign" || action === "confirm") && f?.raised_by) {
      const { data: raiser } = await supabase.from("profiles").select("email").eq("id", f.raised_by).maybeSingle();
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

    // The assigned backup instructor — so they actually know their status.
    if (action === "assign") {
      await notifyBackup(f?.assigned_backup_id, {
        ticketId,
        title: `👤 You're the backup — ${f?.ticket_no}`,
        body: `You've been assigned as backup for ${subj} at ${uni} (${f?.mode}). Awaiting Ops confirmation — you'll be notified once it's dispatched.`,
      });
      // Every Capability Manager of the subject's capability — so all owners
      // (not just the lead) know their subject now has a backup. Skip the actor.
      await notifyCapabilityManagers(
        ticket.capability_id,
        {
          ticketId,
          title: `👤 Backup assigned — ${f?.ticket_no}`,
          body: `${f?.assigned_backup_name ?? "A backup"} was assigned for ${subj} at ${uni} (${f?.mode}), pending Ops confirmation.`,
        },
        ctx.email,
      );
    } else if (action === "confirm") {
      await notifyBackup(f?.assigned_backup_id, {
        ticketId,
        title: `✅ Confirmed — you're on for ${f?.ticket_no}`,
        body: `You're confirmed as the backup for ${subj} at ${uni} (${f?.mode}). Please take the session as scheduled.`,
      });
    } else if (action === "to_invoice") {
      await notifyBackup(f?.assigned_backup_id, {
        ticketId,
        type: "invoice",
        title: `🕒 Upload your invoice — ${f?.ticket_no}`,
        body: `Please file your claim (NxtClaim link + charge slips) within 24 hours for ${subj} at ${uni}. Late uploads are red-flagged.`,
      });
    } else if (action === "ops_approve") {
      await notifyHod({
        ticketId,
        title: `🟢 Awaiting your approval — ${f?.ticket_no}`,
        body: `Ops approved the claim for ${subj} at ${uni}. It's now in your HOD Approvals queue for final sign-off.`,
      });
    } else if (action === "hod_approve") {
      await notifyBackup(f?.assigned_backup_id, {
        ticketId,
        type: "invoice",
        title: `🏁 Claim approved — ${f?.ticket_no}`,
        body: `Your claim for ${subj} at ${uni} received final HOD approval.`,
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
  const managerName = String(formData.get("manager_name") || "").trim() || null;
  const managerEmail = String(formData.get("manager_email") || "").trim().toLowerCase() || null;

  if (!ticketId || !subjectId) return { error: "Missing ticket/subject." };

  const supabase = await createAuthedClient();
  let managerNameResolved = managerName;
  let managerUserResolved: string | null = null;

  if (capabilityId === "__new__" || (!capabilityId && newName)) {
    if (!newName) return { error: "Enter a subject vertical name." };
    // A new vertical must come with its first CM's full details (name + email) so
    // the CM is immediately notifiable and can sign in — same columns as the
    // Capability Managers directory.
    if (!managerName) return { error: "Enter the Capability Manager's name." };
    if (!managerEmail) return { error: "Enter the Capability Manager's email — they need it for alerts and to sign in." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)) return { error: "Enter a valid email address." };
    // Guard against case-variant duplicate verticals (capabilities.name unique is
    // case-sensitive, so "gen ai" would slip past "Gen AI").
    const { data: dupe } = await supabase.from("capabilities").select("id, name").ilike("name", newName).limit(1);
    if ((dupe as { name: string }[] | null)?.[0]) {
      return { error: `A subject vertical named "${(dupe as { name: string }[])[0].name}" already exists — pick it from the list instead.` };
    }
    // Create the subject vertical (capability).
    const { data: cap, error: cErr } = await supabase
      .from("capabilities")
      .insert({ name: newName, status: "active" })
      .select("id")
      .single();
    if (cErr) return { error: /duplicate|unique/i.test(cErr.message) ? "That subject vertical already exists." : cErr.message };
    capabilityId = cap.id;
    // Link an existing login by email if one exists, then create the CM row. The
    // sync_capability_lead trigger keeps capabilities.manager_* pointed at it.
    const { data: prof } = await supabase.from("profiles").select("id, full_name").ilike("email", managerEmail).maybeSingle();
    managerUserResolved = (prof as { id: string } | null)?.id ?? null;
    managerNameResolved = managerName || (prof as { full_name: string | null } | null)?.full_name || managerEmail;
    const { error: cmErr } = await supabase.from("capability_managers").insert({
      capability_id: capabilityId,
      name: managerNameResolved,
      email: managerEmail,
      user_id: managerUserResolved,
      status: "active",
    });
    if (cmErr) return { error: /duplicate|unique/i.test(cmErr.message) ? "A CM with that email already exists for this vertical." : cmErr.message };
    // If this CM already has a login, grant them the CM role now (otherwise they'd
    // have to re-login or hit "Re-check my access" before they could act).
    if (managerUserResolved) {
      await supabase.rpc("provision_user_access", { p_user: managerUserResolved, p_email: managerEmail });
    }
  } else {
    if (!capabilityId) return { error: "Pick a capability." };
    const { data: cap } = await supabase.from("capabilities").select("manager_user_id, manager_name").eq("id", capabilityId).maybeSingle();
    managerUserResolved = (cap as { manager_user_id: string | null } | null)?.manager_user_id ?? null;
    managerNameResolved = (cap as { manager_name: string | null } | null)?.manager_name ?? null;
  }

  // Persist mapping (future tickets for this subject route automatically) + route
  // this ticket. If the ticket had no subject (e.g. an "Other" ticket), mirror the
  // chosen vertical as its subject so it displays cleanly.
  let finalSubjectId: string | null = subjectId || null;
  if (finalSubjectId) {
    await supabase.from("subjects").update({ capability_id: capabilityId }).eq("id", finalSubjectId);
  } else {
    const { data: capRow } = await supabase.from("capabilities").select("name").eq("id", capabilityId).maybeSingle();
    finalSubjectId = await ensureSubject(createAdminClient(), (capRow as { name: string } | null)?.name ?? "Subject", capabilityId);
  }
  const { error: tErr } = await supabase
    .from("tickets")
    .update({ subject_id: finalSubjectId, capability_id: capabilityId, assigned_cm: managerUserResolved, updated_at: new Date().toISOString() })
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

  // Feed the assigned manager into capability_managers (the single source of
  // truth) so notifications reach them and the capability lead auto-syncs.
  if (managerUserResolved) {
    const { data: mp } = await supabase.from("profiles").select("email, full_name").eq("id", managerUserResolved).maybeSingle();
    const memail = (mp as { email: string | null } | null)?.email ?? null;
    if (memail) {
      const { data: existsCm } = await supabase
        .from("capability_managers")
        .select("id")
        .eq("capability_id", capabilityId)
        .ilike("email", memail)
        .maybeSingle();
      if (!existsCm) {
        await supabase.from("capability_managers").insert({
          capability_id: capabilityId,
          name: managerNameResolved || (mp as { full_name: string | null } | null)?.full_name || memail,
          email: memail.toLowerCase(),
          user_id: managerUserResolved,
          status: "active",
        });
      }
    }
  }

  // The normal flow now repeats: notify EVERY Capability Manager of the
  // newly-assigned capability (in-app + email); the ticket_event above also
  // fires the Teams card that @mentions them.
  const { data: tinfo } = await supabase
    .from("tickets")
    .select("ticket_no, universities(name), subjects(name)")
    .eq("id", ticketId)
    .maybeSingle();
  const ti = tinfo as unknown as {
    ticket_no: string;
    universities: { name: string } | null;
    subjects: { name: string } | null;
  } | null;
  const notifiedCms = await notifyCapabilityManagers(capabilityId, {
    ticketId,
    title: `🎯 New ticket in your capability — ${ti?.ticket_no ?? ""}`.trim(),
    body: `A backup request for ${ti?.subjects?.name ?? "a subject"} at ${ti?.universities?.name ?? "a university"} was routed to your capability. Please review and assign a backup.`,
  });
  // If the vertical still has no CM with an email, don't go silent — alert Ops.
  if (notifiedCms === 0) {
    await notifyOps({
      ticketId,
      title: `⚠️ Routed to a vertical with no CM — ${ti?.ticket_no ?? ""}`.trim(),
      body: `${ti?.subjects?.name ?? "A subject"} at ${ti?.universities?.name ?? "a university"} was routed to a vertical that has no Capability Manager. Add one in Directory → Capability Managers.`,
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
