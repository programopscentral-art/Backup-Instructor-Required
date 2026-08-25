import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildTeamsCard, postToTeams, type TeamsEvent } from "@/lib/teams";

export const dynamic = "force-dynamic";

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

  let eventId = "";
  try {
    const body = (await req.json()) as { event_id?: string };
    eventId = String(body.event_id ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!eventId) return NextResponse.json({ ok: false, error: "missing event_id" }, { status: 400 });

  const { data: ev } = await db
    .from("ticket_events")
    .select(
      "id, from_status, to_status, note, actor_name, teams_sent_at, ticket_id, tickets(ticket_no, mode, assigned_backup_name, absent_instructor_name, universities(name), subjects(name))",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (!ev) return NextResponse.json({ ok: false, error: "event not found" }, { status: 404 });
  if (ev.teams_sent_at) return NextResponse.json({ ok: true, skipped: "already sent" });

  const t = ev.tickets as unknown as {
    ticket_no: string;
    mode: string | null;
    assigned_backup_name: string | null;
    absent_instructor_name: string | null;
    universities: { name: string } | null;
    subjects: { name: string } | null;
  } | null;

  // Amount is only relevant for invoice-stage cards — fetch it lazily.
  let amount: number | null = null;
  if (["invoice_pending", "ops_approved", "hod_approved", "closed"].includes(ev.to_status)) {
    const { data: inv } = await db.from("invoices").select("amount").eq("ticket_id", ev.ticket_id).maybeSingle();
    amount = (inv as { amount: number | null } | null)?.amount ?? null;
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://backup-instructor-required.vercel.app";
  const payload: TeamsEvent = {
    ticketNo: t?.ticket_no ?? "—",
    fromStatus: ev.from_status,
    toStatus: ev.to_status,
    note: ev.note,
    actorName: ev.actor_name,
    university: t?.universities?.name ?? null,
    subject: t?.subjects?.name ?? null,
    backup: t?.assigned_backup_name ?? null,
    mode: t?.mode ?? null,
    absentInstructor: t?.absent_instructor_name ?? null,
    amount,
    ticketUrl: `${base}/dashboard/tickets/${ev.ticket_id}`,
  };

  const sent = await postToTeams(webhook, buildTeamsCard(payload));
  if (!sent) {
    // Leave teams_sent_at null so the retry cron picks it up.
    return NextResponse.json({ ok: false, error: "teams post failed" }, { status: 502 });
  }

  await db.from("ticket_events").update({ teams_sent_at: new Date().toISOString() }).eq("id", eventId);
  return NextResponse.json({ ok: true, sent: true });
}
