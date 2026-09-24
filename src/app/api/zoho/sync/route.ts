import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { zohoSecretOk } from "@/lib/zoho/security";
import { runZohoSync } from "@/lib/zoho/sync";

export const dynamic = "force-dynamic";
// Ingesting a ticket sends its notifications inline; allow time for a small backlog.
export const maxDuration = 60;

/**
 * Safety-net sync trigger (see src/lib/zoho/sync.ts).
 * Called every 15 min by the Supabase pg_cron job `zoho-sync` (header
 * `x-sync-secret`, auto-generated and stored in zoho_sync_config), or manually
 * with the Zoho webhook secret (`x-zoho-secret`).
 *
 * Query: ?dry=1 → report what WOULD be imported, change nothing.
 *        ?hours=N → look-back window (default 48, max 336).
 *        ?max=N → cap imports per run (default 10, max 25).
 */
async function authorized(req: Request): Promise<boolean> {
  if (zohoSecretOk(req)) return true;
  const got = req.headers.get("x-sync-secret");
  if (!got) return false;
  const { data } = await createAdminClient()
    .from("zoho_sync_config")
    .select("sync_secret")
    .eq("id", true)
    .maybeSingle();
  const expected = (data as { sync_secret: string | null } | null)?.sync_secret;
  if (!expected) return false;
  const a = crypto.createHash("sha256").update(got).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const u = new URL(req.url);
  const dry = ["1", "true", "yes"].includes((u.searchParams.get("dry") ?? "").toLowerCase());
  const hours = Number(u.searchParams.get("hours") ?? "") || undefined;
  const max = Number(u.searchParams.get("max") ?? "") || undefined;

  const result = await runZohoSync({ dryRun: dry, hours, max });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
