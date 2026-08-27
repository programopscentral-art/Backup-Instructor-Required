import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildTeamsCard, buildReminderCard, postToTeams, type TeamsEvent, type Mention } from "@/lib/teams";

export const dynamic = "force-dynamic";

type DB = ReturnType<typeof createAdminClient>;

/** The assigned backup as an @mention (only if their email is on file). */
async function backupMention(db: DB, backupId: string | null): Promise<Mention[]> {
  if (!backupId) return [];
  const { data } = await db.from("backup_instructor_pool").select("instructor_name, email").eq("id", backupId).maybeSingle();
  const r = data as { instructor_name: string; email: string | null } | null;
  return r?.email ? [{ name: r.instructor_name, email: r.email }] : [];
}

/** Every Capability Manager of a capability, as @mentions (with an email). */
async function capabilityMentions(db: DB, capabilityId: string | null): Promise<Mention[]> {
  if (!capabilityId) return [];
  const { data } = await db
    .from("capability_managers")
    .select("name, email")
    .eq("capability_id", capabilityId)
    .eq("status", "active");
  return ((data ?? []) as { name: string; email: string | null }[])
    .filter((m) => m.email)
    .map((m) => ({ name: m.name, email: m.email as string }));
}

/** All active Capability Manager NAMES of a capability (with or without email),
 *  for display on the card. Falls back to the lead name if the list is empty. */
async function capabilityNames(db: DB, capabilityId: string | null, leadFallback: string | null): Promise<string | null> {
  if (!capabilityId) return leadFallback;
  const { data } = await db
    .from("capability_managers")
    .select("name")
    .eq("capability_id", capabilityId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  const names = ((data ?? []) as { name: string | null }[]).map((m) => m.name).filter((n): n is string => !!n);
  return names.length ? names.join(", ") : leadFallback;
}

/** Merge mention lists, de-duplicating by (lower-cased) email. */
function dedupeMentions(...lists: Mention[][]): Mention[] {
  const seen = new Set<string>();
  const out: Mention[] = [];
  for (const m of lists.flat()) {
    const key = m.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/** Everyone holding a given role, as @mentions (only those with an email). */
async function roleMentions(db: DB, roles: string[]): Promise<Mention[]> {
  const { data: ras } = await db.from("role_assignments").select("user_id").in("role", roles);
  const ids = [...new Set(((ras ?? []) as { user_id: string }[]).map((r) => r.user_id))];
  if (!ids.length) return [];
  const { data: profs } = await db.from("profiles").select("full_name, email").in("id", ids);
  return ((profs ?? []) as { full_name: string | null; email: string | null }[])
    .filter((p) => p.email)
    .map((p) => ({ name: p.full_name || (p.email as string), email: p.email as string }));
}

/**
 * Teams dispatch — called by the ticket_events DB trigger (pg_net) with
 * { event_id }. Validates the shared secret, loads the event + ticket context,
 * builds an Adaptive Card, posts it to the Teams Workflow URL, and marks the
 * event delivered. Idempotent: an already-sent event is skipped (retry-safe).
 */
function secretOk(req: Request, expected: string | null): boolean {
  if (!expected) return false;
  const got = req.headers.get("x-teams-secret") ?? "";
  const a = crypto.createHash("sha256").update(got).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const db = createAdminClient();

  // Config lives in the DB (teams_config) so the whole integration is
  // DB-driven — no Vercel env change needed to activate/rotate. Env is a fallback.
  const { data: cfg } = await db
    .from("teams_config")
    .select("enabled, teams_webhook_url, dispatch_secret")
    .eq("id", true)
    .maybeSingle();

  const expectedSecret = (cfg?.dispatch_secret as string | null) ?? process.env.TEAMS_DISPATCH_SECRET ?? null;
  if (!secretOk(req, expectedSecret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!cfg?.enabled) return NextResponse.json({ ok: true, skipped: "disabled" });

  const webhook = (cfg?.teams_webhook_url as string | null) ?? process.env.TEAMS_WEBHOOK_URL ?? null;
  if (!webhook) return NextResponse.json({ ok: true, skipped: "no webhook configured" });

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://backup-instructor-required.vercel.app";

  let body: { event_id?: string; reminder?: boolean; ticket_id?: string };
  try {
    body = (await req.json()) as { event_id?: string; reminder?: boolean; ticket_id?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // ---- Invoice reminder path (from the send_invoice_reminders cron) ----
  if (body.reminder && body.ticket_id) {
    const { data: tk } = await db
      .from("tickets")
      .select(
        "ticket_no, mode, capability_id, assigned_backup_id, assigned_backup_name, absent_instructor_name, absent_from, absent_to, time_from, time_to, invoice_due_at, universities(name), subjects(name), capabilities(manager_name)",
      )
      .eq("id", body.ticket_id)
      .maybeSingle();
    if (!tk) return NextResponse.json({ ok: false, error: "ticket not found" }, { status: 404 });
    const rt = tk as unknown as {
      ticket_no: string;
      mode: string | null;
      capability_id: string | null;
      assigned_backup_id: string | null;
      assigned_backup_name: string | null;
      absent_instructor_name: string | null;
      absent_from: string | null;
      absent_to: string | null;
      time_from: string | null;
      time_to: string | null;
      invoice_due_at: string | null;
      universities: { name: string } | null;
      subjects: { name: string } | null;
      capabilities: { manager_name: string | null } | null;
    };
    const sentR = await postToTeams(
      webhook,
      buildReminderCard({
        ticketNo: rt.ticket_no,
        university: rt.universities?.name ?? null,
        subject: rt.subjects?.name ?? null,
        capabilityManager: await capabilityNames(db, rt.capability_id, rt.capabilities?.manager_name ?? null),
        absentInstructor: rt.absent_instructor_name,
        backup: rt.assigned_backup_name,
        mode: rt.mode,
        absentFrom: rt.absent_from,
        absentTo: rt.absent_to,
        timeFrom: rt.time_from,
        timeTo: rt.time_to,
        dueAt: rt.invoice_due_at,
        ticketUrl: `${base}/dashboard/tickets/${body.ticket_id}`,
        mentions: await backupMention(db, rt.assigned_backup_id), // ping the backup
      }),
    );
    return NextResponse.json({ ok: sentR });
  }

  const eventId = String(body.event_id ?? "");
  if (!eventId) return NextResponse.json({ ok: false, error: "missing event_id" }, { status: 400 });

  const { data: ev } = await db
    .from("ticket_events")
    .select(
      "id, from_status, to_status, note, actor_name, teams_sent_at, ticket_id, tickets(ticket_no, mode, capability_id, assigned_backup_id, assigned_backup_name, absent_instructor_name, universities(name), subjects(name), capabilities(manager_name, manager_email))",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (!ev) return NextResponse.json({ ok: false, error: "event not found" }, { status: 404 });
  if (ev.teams_sent_at) return NextResponse.json({ ok: true, skipped: "already sent" });

  const t = ev.tickets as unknown as {
    ticket_no: string;
    mode: string | null;
    capability_id: string | null;
    assigned_backup_id: string | null;
    assigned_backup_name: string | null;
    absent_instructor_name: string | null;
    universities: { name: string } | null;
    subjects: { name: string } | null;
    capabilities: { manager_name: string | null; manager_email: string | null } | null;
  } | null;

  // Who is @mentioned on this card (email present → real ping; else omitted).
  let mentions: Mention[] = [];
  const noteL = (ev.note || "").toLowerCase();
  if (ev.to_status === "raised") {
    mentions = await capabilityMentions(db, t?.capability_id ?? null); // all CMs of the capability
    if (mentions.length === 0) mentions = await roleMentions(db, ["admin"]); // no CMs (new/unknown subject) → page admins
  } else if (ev.to_status === "backup_assigned") {
    // A backup was picked → ping the backup AND every Capability Manager of the
    // subject (all owners, not just the lead), de-duplicated by email.
    mentions = dedupeMentions(
      await backupMention(db, t?.assigned_backup_id ?? null),
      await capabilityMentions(db, t?.capability_id ?? null),
    );
  } else if (ev.to_status === "confirmed" || ev.to_status === "hod_approved") {
    mentions = await backupMention(db, t?.assigned_backup_id ?? null);
  } else if (ev.to_status === "ops_approved") {
    mentions = await roleMentions(db, ["hod", "admin"]);
  } else if (ev.to_status === "invoice_pending") {
    // invoice filed → Ops; reminder / red flag / returned / to-invoice → the backup
    mentions = noteL.includes("invoice submitted")
      ? await roleMentions(db, ["admin"])
      : await backupMention(db, t?.assigned_backup_id ?? null);
  }

  // Amount is only relevant for invoice-stage cards — fetch it lazily.
  let amount: number | null = null;
  if (["invoice_pending", "ops_approved", "hod_approved", "closed"].includes(ev.to_status)) {
    const { data: inv } = await db.from("invoices").select("amount").eq("ticket_id", ev.ticket_id).maybeSingle();
    amount = (inv as { amount: number | null } | null)?.amount ?? null;
  }

  // Show ALL Capability Managers of the subject (comma-joined), not just the lead.
  const cmDisplay = await capabilityNames(db, t?.capability_id ?? null, t?.capabilities?.manager_name ?? null);

  const payload: TeamsEvent = {
    ticketNo: t?.ticket_no ?? "—",
    fromStatus: ev.from_status,
    toStatus: ev.to_status,
    note: ev.note,
    actorName: ev.actor_name,
    university: t?.universities?.name ?? null,
    subject: t?.subjects?.name ?? null,
    capabilityManager: cmDisplay,
    backup: t?.assigned_backup_name ?? null,
    mode: t?.mode ?? null,
    absentInstructor: t?.absent_instructor_name ?? null,
    amount,
    ticketUrl: `${base}/dashboard/tickets/${ev.ticket_id}`,
    mentions,
  };

  const sent = await postToTeams(webhook, buildTeamsCard(payload));
  if (!sent) {
    // Leave teams_sent_at null so the retry cron picks it up.
    return NextResponse.json({ ok: false, error: "teams post failed" }, { status: 502 });
  }

  await db.from("ticket_events").update({ teams_sent_at: new Date().toISOString() }).eq("id", eventId);
  return NextResponse.json({ ok: true, sent: true });
}
