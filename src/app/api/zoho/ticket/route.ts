import { NextResponse } from "next/server";
import { zohoSecretOk } from "@/lib/zoho/security";
import { ingestZohoTicket } from "@/lib/zoho/ingest";

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

  // All matching / routing / idempotency / notification logic lives in the
  // shared ingest (also used by the safety-net sync).
  const r = await ingestZohoTicket(body, { via: "webhook" });
  return NextResponse.json(r.json, { status: r.status });
}
