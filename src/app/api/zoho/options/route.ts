import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Read-only options feed for Zoho Creator's dynamic dropdowns.
 * Zoho fetches this on form load so its dropdowns always reflect the product DB
 * (no manual Zoho edits when new universities / subjects / instructors are added).
 *
 *   GET /api/zoho/options                          -> universities, subjects, reasons, modes
 *   GET /api/zoho/options?type=instructors&university=<name|code>
 *
 * Auth: `x-zoho-secret` header == ZOHO_WEBHOOK_SECRET (Zoho sends it in Deluge).
 * Returns plain string arrays — the exact shape Zoho dropdowns want.
 */
export async function GET(req: Request) {
  const secret = req.headers.get("x-zoho-secret");
  if (!process.env.ZOHO_WEBHOOK_SECRET || secret !== process.env.ZOHO_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") || "").toLowerCase();
  const db = createAdminClient();

  // Instructors for a given university (dependent dropdown).
  if (type === "instructors") {
    const uniRaw = (searchParams.get("university") || "").trim();
    let universityId: string | null = null;
    if (uniRaw) {
      const { data: byCode } = await db.from("universities").select("id").ilike("code", uniRaw).maybeSingle();
      universityId = byCode?.id ?? null;
      if (!universityId) {
        const { data: byName } = await db.from("universities").select("id").ilike("name", `%${uniRaw}%`).limit(1);
        universityId = byName?.[0]?.id ?? null;
      }
    }
    if (!universityId) return NextResponse.json({ ok: true, instructors: [] });
    const { data } = await db
      .from("instructors")
      .select("instructor_name, emp_id")
      .eq("university_id", universityId)
      .order("instructor_name");
    const instructors = (data ?? []).map((i) => (i.emp_id ? `${i.instructor_name} (${i.emp_id})` : i.instructor_name));
    return NextResponse.json({ ok: true, instructors });
  }

  // Default: all top-level option lists.
  const [{ data: unis }, { data: subs }, { data: reasons }] = await Promise.all([
    db.from("universities").select("name").eq("status", "active").order("name"),
    db.from("subjects").select("name").eq("status", "active").order("name"),
    db.from("ticket_reasons").select("label").order("label"),
  ]);

  return NextResponse.json({
    ok: true,
    universities: (unis ?? []).map((u) => u.name),
    subjects: (subs ?? []).map((s) => s.name),
    reasons: (reasons ?? []).map((r) => r.label),
    modes: ["No preference", "Online", "Offline"],
  });
}
