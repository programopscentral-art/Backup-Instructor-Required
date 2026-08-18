import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";

/**
 * Zoho Creator → NIAT webhook (READ-ONLY intake).
 * Zoho pushes a ticket here on submit; we never call back to Zoho.
 * Auth: shared secret in the `x-zoho-secret` header (== ZOHO_WEBHOOK_SECRET).
 *
 * Expected JSON body (configure these in the Zoho Deluge workflow):
 * {
 *   "zoho_id":         "<record id>",            // for idempotency
 *   "university":      "Crescent University (Chennai)",  // name or code
 *   "subject":         "Back End Development",
 *   "reason":          "Absent",
 *   "instructor":      "J V Ayyappan",            // instructor needing backup
 *   "notes":           "Health",                  // optional
 *   "from_date":       "2026-08-18",              // YYYY-MM-DD (optional)
 *   "to_date":         "2026-08-19",
 *   "time_from":       "09:00",
 *   "time_to":         "18:00",
 *   "mode":            "offline",                 // online | offline | (blank)
 *   "raised_by_email": "staff.name@nxtwave.in"
 * }
 */

// Health check — lets you confirm the endpoint is reachable from a browser.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "zoho/ticket", ready: !!process.env.ZOHO_WEBHOOK_SECRET });
}

const str = (v: unknown) => (v == null ? "" : String(v)).trim();
const normMode = (m: string) => {
  const s = m.toLowerCase();
  if (s.startsWith("off")) return "offline";
  if (s.startsWith("on")) return "online";
  return "undecided";
};

export async function POST(req: Request) {
  const secret = req.headers.get("x-zoho-secret");
  if (!process.env.ZOHO_WEBHOOK_SECRET || secret !== process.env.ZOHO_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const zohoId = str(body.zoho_id) || null;
  const category = str(body.category);
  const universityRaw = str(body.university);
  const subjectRaw = str(body.subject);
  const instructor = str(body.instructor);
  const reason = str(body.reason);
  // Zoho's field is "Detailed Description"; fall back to it when no explicit notes.
  const notes = str(body.notes) || str(body.detailed_description);
  const fromDate = str(body.from_date) || null;
  const toDate = str(body.to_date) || null;
  const timeFrom = str(body.time_from) || null;
  const timeTo = str(body.time_to) || null;
  const mode = normMode(str(body.mode));
  const raiserEmail = str(body.raised_by_email).toLowerCase() || null;
  // "Notify Capability Managers" — array (Zoho multi-select) or comma string of emails.
  const notifyCms: string[] = Array.isArray(body.notify_cms)
    ? (body.notify_cms as unknown[]).map((x) => str(x)).filter(Boolean)
    : str(body.notify_cms).split(",").map((s) => s.trim()).filter(Boolean);

  // The Zoho tracker holds many categories; we ONLY ingest Backup-Instructor tickets.
  // (Zoho also filters on its side, but this is a defensive guard.)
  if (category && !/backup\s*instructor/i.test(category)) {
    return NextResponse.json({ ok: true, skipped: "not a backup-instructor ticket" });
  }

  const db = createAdminClient();

  // Idempotency — same Zoho record never creates two tickets.
  if (zohoId) {
    const { data: existing } = await db.from("tickets").select("id, ticket_no").eq("zoho_record_id", zohoId).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, duplicate: true, ticket_no: existing.ticket_no });
  }

  // Resolve university (by code, then by name, case-insensitive).
  let universityId: string | null = null;
  if (universityRaw) {
    const { data: byCode } = await db.from("universities").select("id").ilike("code", universityRaw).maybeSingle();
    if (byCode) universityId = byCode.id;
    else {
      const { data: byName } = await db.from("universities").select("id").ilike("name", `%${universityRaw}%`).limit(1);
      universityId = byName?.[0]?.id ?? null;
    }
  }

  // Resolve subject (+ its capability).
  let subjectId: string | null = null;
  let capabilityId: string | null = null;
  if (subjectRaw) {
    const { data: subj } = await db
      .from("subjects")
      .select("id, capability_id")
      .ilike("name", `%${subjectRaw}%`)
      .limit(1);
    subjectId = subj?.[0]?.id ?? null;
    capabilityId = subj?.[0]?.capability_id ?? null;
  }

  // Resolve the raiser's app account (if they have one), and — because the Zoho
  // form has no University field — derive their campus from their staff scope
  // when Zoho didn't send one. Payload university (if any) always wins.
  let raisedBy: string | null = null;
  if (raiserEmail) {
    const { data: prof } = await db.from("profiles").select("id").ilike("email", raiserEmail).maybeSingle();
    raisedBy = prof?.id ?? null;
    if (!universityId && raisedBy) {
      const { data: ra } = await db
        .from("role_assignments")
        .select("scope_id")
        .eq("user_id", raisedBy)
        .eq("role", "university_staff")
        .eq("scope_type", "university")
        .limit(1);
      universityId = (ra?.[0]?.scope_id as string | null) ?? universityId;
    }
    // Fallback: match the raiser in the university_staff directory by email.
    if (!universityId) {
      const { data: sRow } = await db
        .from("university_staff")
        .select("university_id")
        .ilike("email", raiserEmail)
        .limit(1);
      universityId = (sRow?.[0]?.university_id as string | null) ?? universityId;
    }
  }

  const { data: ticket, error } = await db
    .from("tickets")
    .insert({
      source: "zoho",
      zoho_record_id: zohoId,
      university_id: universityId,
      subject_id: subjectId,
      capability_id: capabilityId,
      absent_instructor_name: instructor || null,
      reason_category: reason || null,
      reason: notes || null,
      absent_from: fromDate,
      absent_to: toDate,
      time_from: timeFrom,
      time_to: timeTo,
      requested_mode: mode,
      raised_by: raisedBy,
      raised_by_email: raiserEmail,
      status: "raised",
    })
    .select("id, ticket_no, universities(name), subjects(name)")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const info = ticket as unknown as {
    id: string;
    ticket_no: string;
    universities: { name: string } | null;
    subjects: { name: string } | null;
  };

  await db.from("ticket_events").insert({
    ticket_id: ticket.id,
    actor_name: raiserEmail || "Zoho",
    from_status: "raised",
    to_status: "raised",
    note: `Raised via Zoho${universityId ? "" : " — university not matched (needs admin)"}${capabilityId ? "" : "; subject has no Capability Manager"}.`,
  });

  // Notify: raiser, the subject's CM, and all Admins/HODs.
  const uni = info.universities?.name ?? (universityRaw || "a university");
  const subj = info.subjects?.name ?? (subjectRaw || "a subject");
  const title = `New backup request — ${info.ticket_no}`;
  const bodyMsg = `A ticket for ${subj} at ${uni} was raised via Zoho. Absent: ${instructor || "—"}. Reason: ${reason || "—"}.`;

  const recipients = new Map<string, { userId: string | null; email: string | null }>();
  if (raisedBy || raiserEmail) recipients.set(raisedBy ?? raiserEmail!, { userId: raisedBy, email: raiserEmail });

  // CM of the capability
  if (capabilityId) {
    const { data: cap } = await db.from("capabilities").select("manager_user_id").eq("id", capabilityId).maybeSingle();
    const cmId = (cap as { manager_user_id: string | null } | null)?.manager_user_id ?? null;
    if (cmId) {
      const { data: cmProf } = await db.from("profiles").select("email").eq("id", cmId).maybeSingle();
      recipients.set(cmId, { userId: cmId, email: (cmProf as { email: string } | null)?.email ?? null });
    }
  }

  // All admins + HODs
  const { data: admins } = await db
    .from("role_assignments")
    .select("user_id, profiles!role_assignments_user_id_fkey(email)")
    .in("role", ["admin", "hod"]);
  for (const a of (admins ?? []) as unknown as { user_id: string; profiles: { email: string } | null }[]) {
    recipients.set(a.user_id, { userId: a.user_id, email: a.profiles?.email ?? null });
  }

  // Explicitly-selected CMs from Zoho's "Notify Capability Managers" field.
  for (const raw of notifyCms) {
    const em = raw.toLowerCase();
    if (!em.includes("@")) continue;
    const { data: p } = await db.from("profiles").select("id, email").ilike("email", em).maybeSingle();
    if (p) recipients.set(p.id, { userId: p.id, email: (p as { email: string }).email });
    else recipients.set(em, { userId: null, email: em });
  }

  for (const r of recipients.values()) {
    await notify(db, {
      recipientUserId: r.userId,
      recipientEmail: r.email,
      type: "ticket",
      title,
      body: bodyMsg,
      ticketId: ticket.id,
    });
  }

  return NextResponse.json({ ok: true, ticket_no: info.ticket_no, ticket_id: ticket.id });
}
