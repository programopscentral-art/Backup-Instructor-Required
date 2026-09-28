import { createAdminClient } from "@/lib/supabase/admin";
import { ingestZohoTicket } from "@/lib/zoho/ingest";
import { likeEscape } from "@/lib/zoho/security";

/**
 * Safety-net sync: Zoho → Backup OS.
 *
 * Zoho's "API call to other app" workflow pushes each new ticket to us exactly
 * once and never retries — so if that one call fails, the ticket is silently
 * lost. This job periodically reads recent "Backup Instructor Required" records
 * straight from the Zoho Creator API and ingests any that aren't in Backup OS
 * yet, through the SAME ingest the webhook uses (so routing + notifications are
 * identical). Idempotent by zoho_record_id — re-running never duplicates.
 */

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.in";
const API = process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.in";
const OWNER = process.env.ZOHO_APP_OWNER || "nxtwave";
const APP = process.env.ZOHO_APP_NAME || "niat";
const REPORT = process.env.ZOHO_REPORT_NAME || "All_Campus_Program_Operations_Tracker";
const CATEGORY = "Backup Instructor Required";

// Only pick up tickets nobody has acted on in Zoho yet. A ticket already
// Resolved / Discarded / In Progress over there was handled elsewhere.
const IMPORTABLE_STATUSES = new Set(["", "yet to pick", "re-open"]);
// Give the normal webhook a head start so we don't race it on fresh tickets.
const MIN_AGE_MS = 5 * 60 * 1000;

export interface SyncItem {
  zohoId: string;
  zohoTicketId: string;
  addedTime: string;
  raisedBy: string | null;
  campus: string | null;
  action: "would-import" | "imported" | "failed";
  ticketNo?: string;
  error?: string;
}

export interface SyncResult {
  ok: boolean;
  dryRun: boolean;
  windowHours: number;
  scanned: number;
  alreadyInApp: number;
  skippedHandledInZoho: number;
  skippedTooFresh: number;
  items: SyncItem[];
  error?: string;
}

type ZRec = Record<string, unknown>;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Zoho date ("23/09/2026" or "23-Sep-2026", optional time) → "2026-09-23". */
function zDate(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  return "";
}

/** Zoho Added_Time (app timezone = IST) → Date. */
function zDateTime(v: unknown): Date | null {
  const d = zDate(v);
  if (!d) return null;
  const t = (typeof v === "string" ? v : "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const hh = (t?.[1] ?? "00").padStart(2, "0");
  const mm = t?.[2] ?? "00";
  const ss = t?.[3] ?? "00";
  const dt = new Date(`${d}T${hh}:${mm}:${ss}+05:30`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Readable value of a Zoho field: plain string, lookup object, or list of them. */
function disp(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(disp).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return disp(o.Full_Name ?? o.zc_display_value ?? o.display_value ?? "");
  }
  return "";
}

/** "dd/MM/yyyy HH:mm:ss" in IST — the format Zoho's criteria accepts. */
function istCriteriaStamp(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(ist.getUTCDate())}/${p(ist.getUTCMonth() + 1)}/${ist.getUTCFullYear()} ${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}:${p(ist.getUTCSeconds())}`;
}

async function zohoToken(): Promise<string | null> {
  const id = process.env.ZOHO_OAUTH_CLIENT_ID;
  const secret = process.env.ZOHO_OAUTH_CLIENT_SECRET;
  const refresh = process.env.ZOHO_OAUTH_REFRESH_TOKEN;
  if (!id || !secret || !refresh) return null;
  const res = await fetch(
    `${ACCOUNTS}/oauth/v2/token?grant_type=refresh_token&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&refresh_token=${encodeURIComponent(refresh)}`,
    { method: "POST" },
  );
  const j = (await res.json().catch(() => ({}))) as { access_token?: string };
  return j.access_token ?? null;
}

/**
 * Build the same payload the Zoho Deluge workflow sends. Fields the report
 * doesn't expose (currently Subject / Instructor / Dates / Mode) come through
 * blank — the ticket then lands as "needs admin" instead of being lost. If
 * those columns are later added to the Zoho report, they're picked up here
 * automatically.
 */
function toPayload(r: ZRec): Record<string, unknown> {
  const raiser = (r.Ticket_Raised_By_Lookup ?? null) as Record<string, unknown> | null;
  const uni = (r["Ticket_Raised_By_Lookup.University"] ?? null) as Record<string, unknown> | null;
  const campus = disp(uni?.Campus_Name ?? uni?.zc_display_value ?? "");
  const recurring = disp(r.Is_it_a_recurring_issue);
  let notes = disp(r.Detailed_Description);
  if (recurring) notes = `${notes}  [Recurring: ${recurring}]`;
  return {
    zoho_id: String(r.ID),
    category: disp(r.Category),
    university: campus,
    subject: disp(r.Subject_field ?? r.Subject_field1 ?? r.Subject),
    reason: disp(r.Reason),
    instructor: disp(r.Instructor_needing_backup1 ?? r.Instructor_needing_backup),
    detailed_description: notes,
    from_date: zDate(r.Backup_Required_From),
    to_date: zDate(r.Backup_Required_To),
    mode: disp(r.Request_Mode),
    raised_by_email: "",
    raised_by_name: disp(raiser?.Full_Name ?? raiser?.zc_display_value ?? "") || null,
    raised_by_details: {
      name: disp(raiser?.Full_Name),
      emp_id: disp(raiser?.Employee_ID),
      campus,
    },
  };
}

export async function runZohoSync(opts: { dryRun?: boolean; hours?: number; max?: number } = {}): Promise<SyncResult> {
  const dryRun = !!opts.dryRun;
  const windowHours = Math.min(Math.max(Math.round(opts.hours ?? 48), 1), 24 * 14);
  const max = Math.min(Math.max(Math.round(opts.max ?? 10), 1), 25);
  const result: SyncResult = {
    ok: true, dryRun, windowHours, scanned: 0, alreadyInApp: 0,
    skippedHandledInZoho: 0, skippedTooFresh: 0, items: [],
  };

  const token = await zohoToken();
  if (!token) return { ...result, ok: false, error: "Zoho OAuth not configured (ZOHO_OAUTH_* env vars)." };

  const now = Date.now();
  const since = new Date(now - windowHours * 60 * 60 * 1000);
  const criteria = `(Category == "${CATEGORY}" && Added_Time >= "${istCriteriaStamp(since)}")`;

  // Fetch the window (newest first). Page defensively in case of a busy window.
  const records: ZRec[] = [];
  for (let from = 1; from <= 801; from += 200) {
    const url = `${API}/creator/v2.1/data/${OWNER}/${APP}/report/${REPORT}?field_config=all&from=${from}&limit=200&criteria=${encodeURIComponent(criteria)}`;
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    const j = (await res.json().catch(() => ({}))) as { code?: number; data?: ZRec[]; message?: string };
    if (j.code === 3100) break; // "No Data Available" — empty window
    if (j.code !== 3000) return { ...result, ok: false, error: `Zoho API error: ${j.code ?? res.status} ${j.message ?? ""}`.trim() };
    const page = j.data ?? [];
    records.push(...page);
    if (page.length < 200) break;
  }
  result.scanned = records.length;
  if (!records.length) return result;

  // Which of these are already in Backup OS?
  const db = createAdminClient();
  const ids = records.map((r) => String(r.ID));
  const { data: existing } = await db.from("tickets").select("zoho_record_id").in("zoho_record_id", ids);
  const inApp = new Set(((existing ?? []) as { zoho_record_id: string | null }[]).map((e) => e.zoho_record_id));

  // Oldest missing first, so a backlog is ingested in the order it was raised.
  for (const r of [...records].reverse()) {
    const zohoId = String(r.ID);
    if (inApp.has(zohoId)) { result.alreadyInApp++; continue; }
    if (disp(r.Category).toLowerCase() !== CATEGORY.toLowerCase()) continue; // defensive
    if (!IMPORTABLE_STATUSES.has(disp(r.Ticket_Status).toLowerCase())) { result.skippedHandledInZoho++; continue; }
    const added = zDateTime(r.Added_Time);
    if (added && now - added.getTime() < MIN_AGE_MS) { result.skippedTooFresh++; continue; }
    if (result.items.length >= max) break;

    const payload = toPayload(r);
    // The report has no email for the raiser — look them up in our staff
    // directory by Employee ID so they're linked + notified like a webhook ticket.
    const empId = (payload.raised_by_details as { emp_id?: string }).emp_id;
    if (empId) {
      const { data: staff } = await db
        .from("university_staff")
        .select("email")
        .ilike("employee_id", likeEscape(empId))
        .not("email", "is", null)
        .limit(1);
      payload.raised_by_email = (staff?.[0] as { email: string } | undefined)?.email ?? "";
    }
    const item: SyncItem = {
      zohoId,
      zohoTicketId: disp(r.Ticket_ID),
      addedTime: disp(r.Added_Time),
      raisedBy: (payload.raised_by_name as string | null) ?? null,
      campus: (payload.university as string) || null,
      action: "would-import",
    };
    if (!dryRun) {
      try {
        const out = await ingestZohoTicket(payload, { via: "sync" });
        if (out.status === 200 && (out.json.ticket_no as string | undefined)) {
          item.action = "imported";
          item.ticketNo = out.json.ticket_no as string;
        } else {
          item.action = "failed";
          item.error = JSON.stringify(out.json).slice(0, 200);
        }
      } catch (e) {
        item.action = "failed";
        item.error = String(e).slice(0, 200);
      }
    }
    result.items.push(item);
  }

  if (!dryRun) {
    // Best-effort bookkeeping; the table only exists once migration 0036 is applied.
    await db.from("zoho_sync_config").update({ last_run_at: new Date().toISOString() }).eq("id", true);
  }
  return result;
}
