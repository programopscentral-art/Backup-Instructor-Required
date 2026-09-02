import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { zohoSecretOk } from "@/lib/zoho/security";
import { resolveSubjectName } from "@/lib/tickets/subject-routing";

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

// Words that carry no identifying signal in a university name (so "Malla Reddy
// Vishwavidyapeeth - Hyderabad" from Zoho matches "Malla Reddy University" here).
const UNI_STOPWORDS = new Set([
  "university", "universities", "vishwavidyapeeth", "vishwavidyalaya", "vidyapeeth",
  "deemed", "the", "of", "and", "college", "institute", "institutes", "institution",
  "technology", "technologies", "campus", "school", "for", "advanced", "studies",
  "niat", "nxtwave",
  // Common filler words that appear in official names ("… deemed to be university").
  "to", "be", "is", "at", "in", "an", "by", "on", "or", "as", "a",
]);
/** Distinctive lowercase tokens of a university name (fillers + short bits dropped). */
function uniTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !UNI_STOPWORDS.has(t) && !/^\d+$/.test(t)),
  );
}
type UniRow = { id: string; code: string | null; name: string; city: string | null };

// Segments that are pure org-prefix noise in a Staff-Profile university string
// like "NIAT - KKH - Hyderabad" (the campus is the middle segment, not "NIAT").
const PREFIX_FILLER = new Set(["niat", "nxtwave", "the"]);
const segIsFiller = (seg: string) => {
  const ts = seg.split(/\s+/).filter(Boolean);
  return ts.length > 0 && ts.every((t) => PREFIX_FILLER.has(t));
};

/**
 * Resolve a Zoho/Staff-Profile university string to our university id, tolerant of
 * the two real formats — "NIAT - KKH - Hyderabad" and
 * "Malla Reddy Vishwavidyapeeth - Hyderabad":
 *   1) exact code, 2) parse "[NIAT -] <campus> - <city>" then exact-name on campus,
 *   3) stopword-stripped token overlap on the CAMPUS segment (subset or Jaccard ≥ 0.5),
 *   using the city segment to break ties. Returns null if nothing is confident enough
 *   (caller then falls back to deriving the campus from the raiser).
 */
function resolveUniversityId(raw: string, rows: UniRow[]): string | null {
  const q = raw.trim();
  if (!q) return null;
  const lc = q.toLowerCase();
  // 1) exact code on the whole string
  const byCode = rows.find((r) => r.code && r.code.toLowerCase() === lc);
  if (byCode) return byCode.id;
  // Parse "[NIAT -] <campus> - <city>": drop filler segments, keep campus + city.
  const segs = lc.split(" - ").map((s) => s.trim()).filter(Boolean);
  const sig = segs.filter((s) => !segIsFiller(s));
  const use = sig.length ? sig : segs;
  const campus = use[0];
  const city = use.length > 1 ? use[use.length - 1] : "";
  // Prefer the row matching the parsed city when several campuses tie.
  const cityPick = (cands: UniRow[]): UniRow | null => {
    if (cands.length <= 1) return cands[0] ?? null;
    if (city) {
      const byCity = cands.find(
        (r) => (r.city && r.city.toLowerCase() === city) ||
               r.name.toLowerCase().includes(`(${city})`) ||
               r.name.toLowerCase().includes(city),
      );
      if (byCity) return byCity;
    }
    return cands[0];
  };
  // 2) exact name on the campus segment (or the whole string)
  const exact = rows.find((r) => {
    const n = r.name.toLowerCase();
    return n === campus || n === lc;
  });
  if (exact) return exact.id;
  // 3) token overlap on the campus segment only (city handled separately)
  const qt = uniTokens(campus);
  if (qt.size === 0) return null;
  let bestScore = 0;
  let bestRows: UniRow[] = [];
  for (const r of rows) {
    const rt = uniTokens(r.name);
    if (rt.size === 0) continue;
    let inter = 0;
    for (const t of qt) if (rt.has(t)) inter++;
    if (inter === 0) continue;
    const smaller = Math.min(qt.size, rt.size);
    const union = qt.size + rt.size - inter;
    const subset = inter === smaller; // all tokens of the shorter name are shared
    const jaccard = inter / union;
    if (!(subset || jaccard >= 0.5)) continue;
    const score = subset ? 1 + inter : jaccard;
    if (score > bestScore) {
      bestScore = score;
      bestRows = [r];
    } else if (score === bestScore) {
      bestRows.push(r);
    }
  }
  return bestRows.length ? cityPick(bestRows)!.id : null;
}

export async function POST(req: Request) {
  if (!zohoSecretOk(req)) {
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
  // Raiser snapshot from Zoho Staff Profiles (name + full profile details).
  const raiserName = str(body.raised_by_name) || null;
  let raiserDetails: Record<string, unknown> | null = null;
  const rbd = body.raised_by_details;
  if (rbd && typeof rbd === "object" && !Array.isArray(rbd)) {
    raiserDetails = rbd as Record<string, unknown>;
  } else if (typeof rbd === "string" && rbd.trim().startsWith("{")) {
    try {
      raiserDetails = JSON.parse(rbd);
    } catch {
      raiserDetails = null;
    }
  }
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

  // Resolve university — tolerant of Zoho↔product name drift (e.g.
  // "Malla Reddy Vishwavidyapeeth - Hyderabad" → "Malla Reddy University").
  let universityId: string | null = null;
  if (universityRaw) {
    const { data: uniRows } = await db.from("universities").select("id, code, name, city");
    universityId = resolveUniversityId(universityRaw, (uniRows ?? []) as UniRow[]);
  }

  // Resolve subject → capability using the subject VERTICALS (capabilities) as the
  // primary routing key: Zoho sends a vertical name (e.g. "Gen AI"), which maps
  // straight to that capability's CMs. Falls back to a legacy granular subject,
  // then auto-creates an unmapped subject (→ needs admin) for anything unknown.
  const { capabilityId, subjectId } = subjectRaw
    ? await resolveSubjectName(db, subjectRaw)
    : { capabilityId: null, subjectId: null };

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
      raised_by_name: raiserName,
      raised_by_details: raiserDetails,
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
    actor_name: raiserName || raiserEmail || "Zoho",
    from_status: "raised",
    to_status: "raised",
    note: `Raised via Zoho${universityId ? "" : " — university not matched (needs admin)"}${capabilityId ? "" : "; subject has no Capability Manager"}.`,
  });

  // Notify: raiser, the subject's CMs, and all Admins/HODs.
  const uni = info.universities?.name ?? (universityRaw || "a university");
  const subj = info.subjects?.name ?? (subjectRaw || "a subject");
  // No capability = a new/unlisted subject (incl. the Zoho "Other" option) — the
  // admin must add the subject + assign a Capability Manager before it can route.
  const noCap = !capabilityId;
  const title = noCap
    ? `⚠️ New subject — needs admin — ${info.ticket_no}`
    : `New backup request — ${info.ticket_no}`;
  const bodyMsg = noCap
    ? `A ticket for "${subjectRaw || subj}" at ${uni} was raised via Zoho, but that subject isn't mapped to a Capability yet. Please add the subject and assign a Capability Manager — then it routes automatically. Absent: ${instructor || "—"}. Details: ${notes || reason || "—"}.`
    : `A ticket for ${subj} at ${uni} was raised via Zoho. Absent: ${instructor || "—"}. Reason: ${reason || "—"}.`;

  const recipients = new Map<string, { userId: string | null; email: string | null }>();
  if (raisedBy || raiserEmail) recipients.set(raisedBy ?? raiserEmail!, { userId: raisedBy, email: raiserEmail });

  // ALL Capability Managers of the capability (a capability can have several).
  if (capabilityId) {
    const { data: cms } = await db
      .from("capability_managers")
      .select("email")
      .eq("capability_id", capabilityId)
      .eq("status", "active");
    for (const cm of (cms ?? []) as { email: string | null }[]) {
      const em = (cm.email ?? "").toLowerCase();
      if (!em.includes("@")) continue;
      const { data: p } = await db.from("profiles").select("id").ilike("email", em).maybeSingle();
      recipients.set(p?.id ?? em, { userId: p?.id ?? null, email: em });
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
