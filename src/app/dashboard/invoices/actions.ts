"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { notifyOps, notifyHod, notifyBackup } from "@/lib/notify-targets";

export interface InvoiceState {
  ok?: string;
  error?: string;
}

function isUrl(v: string) {
  return /^https?:\/\/.+/i.test(v);
}

/** Instructor/admin submits the offline claim (files already uploaded to Storage). */
export async function submitInvoice(_prev: InvoiceState, formData: FormData): Promise<InvoiceState> {
  const ctx = await getSessionContext();
  if (!ctx) return { error: "Not signed in." };

  const ticket_id = String(formData.get("ticket_id") || "");
  const session_date = String(formData.get("session_date") || "") || null;
  const description = String(formData.get("description") || "").trim();
  const nxtclaim_link = String(formData.get("nxtclaim_link") || "").trim();
  const filesJson = String(formData.get("files") || "[]");

  if (!ticket_id) return { error: "Missing ticket." };
  if (!nxtclaim_link) return { error: "The NxtClaim link is mandatory." };
  if (!isUrl(nxtclaim_link)) return { error: "Enter a valid NxtClaim URL (https://…)." };
  if (!description) return { error: "Add a short description." };

  // Budget breakdown — travel + accommodation + other. Each must be a valid,
  // non-negative number; the total (amount) is their sum.
  const parseAmt = (key: string): number | null => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };
  const travel_amount = parseAmt("travel_amount");
  const accommodation_amount = parseAmt("accommodation_amount");
  const other_amount = parseAmt("other_amount");
  if (travel_amount === null || accommodation_amount === null || other_amount === null) {
    return { error: "Enter valid, non-negative amounts for travel / accommodation / other." };
  }
  const amount = travel_amount + accommodation_amount + other_amount;

  let files: { path: string; name: string }[] = [];
  try {
    files = JSON.parse(filesJson);
  } catch {
    files = [];
  }
  if (files.length === 0) return { error: "Upload at least one charge slip / receipt." };
  if (files.length > 5) return { error: "You can upload at most 5 files." };
  // Every uploaded file must live under this ticket's folder — don't let the
  // client attach an arbitrary bucket path to the invoice.
  if (!files.every((f) => typeof f?.path === "string" && f.path.startsWith(`${ticket_id}/`))) {
    return { error: "Invalid file reference." };
  }

  const supabase = await createAuthedClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, ticket_no, status, mode, capability_id, assigned_backup_id, invoice_due_at, universities(name), subjects(name)")
    .eq("id", ticket_id)
    .maybeSingle();
  if (!ticket) return { error: "Ticket not found." };
  if (ticket.mode !== "offline") return { error: "Invoices are only for offline sessions." };
  if (ticket.status !== "invoice_pending") return { error: "This ticket isn't in the invoice stage yet." };

  const adminLike = isAdminLike(ctx.roles);

  // Assigned backup's email + upload-lock state (3 red flags).
  let bpEmail: string | null = null;
  let bpBlocked = false;
  if (ticket.assigned_backup_id) {
    const { data: bp } = await supabase
      .from("backup_instructor_pool")
      .select("email, upload_blocked")
      .eq("id", ticket.assigned_backup_id)
      .maybeSingle();
    bpEmail = (bp as { email: string | null } | null)?.email ?? null;
    bpBlocked = (bp as { upload_blocked: boolean } | null)?.upload_blocked ?? false;
  }

  // Only the assigned backup instructor uploads the claim. Ops/HOD keep a
  // superuser override; Capability Managers do NOT — once they've assigned the
  // backup, the invoice step is the instructor's (then Ops/HOD approve).
  const isTheBackup = !!bpEmail && bpEmail.toLowerCase() === ctx.email.toLowerCase();
  const allowed = adminLike || isTheBackup;
  if (!allowed) return { error: "Only the assigned backup instructor (or Ops/HOD) can upload this invoice." };

  // 3-red-flag lock — the instructor is blocked until an Admin resets it (Ops/CM can still file).
  if (!adminLike && isTheBackup && bpBlocked) {
    return { error: "Invoice upload is locked — you've reached 3 red flags. Ask an Admin/CM to reset your flags before submitting." };
  }

  const late = ticket.invoice_due_at ? new Date() > new Date(ticket.invoice_due_at) : false;
  const payload = {
    session_date,
    description,
    amount,
    travel_amount,
    accommodation_amount,
    other_amount,
    nxtclaim_link,
    status: "submitted" as const,
    late,
    submitted_by: ctx.userId,
    submitted_by_name: ctx.profile?.full_name || ctx.email,
    return_reason: null,
    updated_at: new Date().toISOString(),
  };

  // Idempotent: a 'returned' claim can be re-filed; a live one blocks a resubmit.
  const { data: existing } = await supabase.from("invoices").select("id, status").eq("ticket_id", ticket_id).maybeSingle();
  let invoiceId: string;
  if (existing) {
    if (existing.status !== "returned") return { error: "An invoice has already been submitted for this ticket." };
    const { error } = await supabase.from("invoices").update(payload).eq("id", existing.id);
    if (error) return { error: error.message };
    invoiceId = existing.id;
  } else {
    const { data: created, error } = await supabase.from("invoices").insert({ ticket_id, ...payload }).select("id").single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return { error: "An invoice was just submitted for this ticket." };
      return { error: error.message };
    }
    invoiceId = created.id;
  }

  if (files.length) {
    await supabase.from("invoice_files").insert(
      files.map((f) => ({ invoice_id: invoiceId, path: f.path, name: f.name })),
    );
  }

  await supabase.from("ticket_events").insert({
    ticket_id,
    actor_id: ctx.userId,
    actor_name: ctx.profile?.full_name || ctx.email,
    from_status: "invoice_pending",
    to_status: "invoice_pending",
    note: late ? "Invoice submitted (late)." : "Invoice submitted.",
  });

  // Alert Ops that a claim is ready for the first (Ops) review.
  const tk = ticket as unknown as {
    ticket_no: string;
    universities: { name: string } | null;
    subjects: { name: string } | null;
  };
  const amountLabel = payload.amount != null ? ` · ₹${payload.amount.toLocaleString("en-IN")}` : "";
  await notifyOps({
    ticketId: ticket_id,
    title: `📄 Invoice filed — ${tk.ticket_no}`,
    body: `A claim was filed for ${tk.subjects?.name ?? "a subject"} at ${tk.universities?.name ?? "a university"}${amountLabel}${late ? " (late)" : ""}. Ready for Ops review.`,
  });

  revalidatePath(`/dashboard/tickets/${ticket_id}`);
  revalidatePath("/dashboard/invoices");
  return { ok: "Invoice submitted." };
}

/** Ops / HOD approval, or return-for-fix. Drives the ticket's approval steps too. */
export async function reviewInvoice(_prev: InvoiceState, formData: FormData): Promise<InvoiceState> {
  const ctx = await getSessionContext();
  if (!ctx) return { error: "Not signed in." };
  if (!isAdminLike(ctx.roles)) return { error: "Only Ops/HOD can review." };

  const invoice_id = String(formData.get("invoice_id") || "");
  const ticket_id = String(formData.get("ticket_id") || "");
  const action = String(formData.get("action") || "");
  const reason = String(formData.get("reason") || "").trim();
  const actorName = ctx.profile?.full_name || ctx.email;
  const now = new Date().toISOString();

  if (!invoice_id || !ticket_id) return { error: "Missing invoice." };

  const supabase = await createAuthedClient();

  // Guard the approval order server-side (client UI order isn't a security boundary).
  const { data: tk } = await supabase
    .from("tickets")
    .select("status, ticket_no, assigned_backup_id, universities(name), subjects(name)")
    .eq("id", ticket_id)
    .maybeSingle();
  const tkInfo = tk as unknown as {
    status: string;
    ticket_no: string;
    assigned_backup_id: string | null;
    universities: { name: string } | null;
    subjects: { name: string } | null;
  } | null;
  const ts = tkInfo?.status;
  if (action === "ops" && ts !== "invoice_pending") return { error: "This ticket isn't awaiting Ops approval." };
  if (action === "hod" && ts !== "ops_approved") return { error: "It needs Ops approval before HOD." };
  if (action === "close" && ts !== "hod_approved") return { error: "It needs HOD approval before closing." };

  const inv: Record<string, unknown> = { updated_at: now };
  const tkt: Record<string, unknown> = { updated_at: now };
  let note = "";

  if (action === "ops") {
    inv.status = "ops_approved";
    inv.ops_approved_by = ctx.userId;
    inv.ops_approved_at = now;
    tkt.status = "ops_approved";
    note = "Ops approved the claim.";
  } else if (action === "hod") {
    if (!ctx.roles.includes("hod") && !isAdminLike(ctx.roles)) return { error: "HOD only." };
    inv.status = "hod_approved";
    inv.hod_approved_by = ctx.userId;
    inv.hod_approved_at = now;
    tkt.status = "hod_approved";
    note = "HOD gave final approval.";
  } else if (action === "return") {
    if (!reason) return { error: "Add a reason to return." };
    inv.status = "returned";
    inv.return_reason = reason;
    note = `Returned for fix: ${reason}`;
  } else if (action === "close") {
    tkt.status = "closed";
    note = "Ticket closed.";
  } else {
    return { error: "Unknown action." };
  }

  if (action !== "close") {
    const { error } = await supabase.from("invoices").update(inv).eq("id", invoice_id);
    if (error) return { error: error.message };
  }
  if (tkt.status) {
    const { error } = await supabase.from("tickets").update(tkt).eq("id", ticket_id);
    if (error) return { error: error.message };
    await supabase.from("ticket_events").insert({
      ticket_id,
      actor_id: ctx.userId,
      actor_name: actorName,
      to_status: tkt.status,
      note,
    });
  } else {
    await supabase.from("ticket_events").insert({
      ticket_id,
      actor_id: ctx.userId,
      actor_name: actorName,
      from_status: "invoice_pending",
      to_status: "invoice_pending",
      note,
    });
  }

  // Notify the next party in the chain.
  const subj = tkInfo?.subjects?.name ?? "the subject";
  const uni = tkInfo?.universities?.name ?? "the university";
  if (action === "ops") {
    await notifyHod({
      ticketId: ticket_id,
      title: `🟢 Awaiting your approval — ${tkInfo?.ticket_no}`,
      body: `Ops approved the claim for ${subj} at ${uni}. It's in your HOD Approvals queue for final sign-off.`,
    });
  } else if (action === "hod") {
    await notifyBackup(tkInfo?.assigned_backup_id, {
      ticketId: ticket_id,
      type: "invoice",
      title: `🏁 Claim approved — ${tkInfo?.ticket_no}`,
      body: `Your claim for ${subj} at ${uni} received final HOD approval.`,
    });
  } else if (action === "return") {
    await notifyBackup(tkInfo?.assigned_backup_id, {
      ticketId: ticket_id,
      type: "invoice",
      title: `↩️ Invoice returned — ${tkInfo?.ticket_no}`,
      body: `Your claim for ${subj} at ${uni} was returned for a fix: ${reason}. Please correct and resubmit.`,
    });
  }

  revalidatePath(`/dashboard/tickets/${ticket_id}`);
  revalidatePath("/dashboard/invoices");
  return { ok: note };
}
