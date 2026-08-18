"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";

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
  const amountRaw = String(formData.get("amount") || "").trim();
  const nxtclaim_link = String(formData.get("nxtclaim_link") || "").trim();
  const filesJson = String(formData.get("files") || "[]");

  if (!ticket_id) return { error: "Missing ticket." };
  if (!nxtclaim_link) return { error: "The NxtClaim link is mandatory." };
  if (!isUrl(nxtclaim_link)) return { error: "Enter a valid NxtClaim URL (https://…)." };
  if (!description) return { error: "Add a short description." };

  let files: { path: string; name: string }[] = [];
  try {
    files = JSON.parse(filesJson);
  } catch {
    files = [];
  }
  if (files.length === 0) return { error: "Upload at least one charge slip / receipt." };

  const supabase = await createAuthedClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, invoice_due_at")
    .eq("id", ticket_id)
    .maybeSingle();
  if (!ticket) return { error: "Ticket not found." };

  const late = ticket.invoice_due_at ? new Date() > new Date(ticket.invoice_due_at) : false;

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      ticket_id,
      session_date,
      description,
      amount: amountRaw ? Number(amountRaw) : null,
      nxtclaim_link,
      status: "submitted",
      late,
      submitted_by: ctx.userId,
      submitted_by_name: ctx.profile?.full_name || ctx.email,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (files.length) {
    await supabase.from("invoice_files").insert(
      files.map((f) => ({ invoice_id: invoice.id, path: f.path, name: f.name })),
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

  revalidatePath(`/dashboard/tickets/${ticket_id}`);
  revalidatePath("/dashboard/invoices");
  return { ok: note };
}
