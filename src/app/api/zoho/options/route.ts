import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { zohoSecretOk, likeEscape } from "@/lib/zoho/security";

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
  if (!zohoSecretOk(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") || "").toLowerCase();
  const db = createAdminClient();

  // Capability Managers list (for Zoho's "Notify Capability Managers" dropdown).
  if (type === "capability_managers" || type === "cms") {
    const { data } = await db
      .from("capabilities")
      .select("name, manager_name, manager_user_id, profiles:manager_user_id(email)")
      .eq("status", "active")
      .order("name");
    const cms = (data ?? [])
      .map((c) => {
        const prof = (c as unknown as { profiles: { email: string } | { email: string }[] | null }).profiles;
        const email = Array.isArray(prof) ? prof[0]?.email ?? null : prof?.email ?? null;
        if (!email) return null;
        const label = c.manager_name ? `${c.manager_name} — ${c.name}` : c.name;
        return { label, value: email };
      })
      .filter(Boolean);
    return NextResponse.json({ ok: true, capability_managers: cms });
  }

  // Instructors for a given university (dependent dropdown). The campus can be
  // named directly (?university=) OR derived from the raiser (?email=) — the Zoho
  // form has no University field, so email is the normal path.
  if (type === "instructors") {
    const uniRaw = (searchParams.get("university") || "").trim();
    const email = (searchParams.get("email") || "").trim().toLowerCase();
    let universityId: string | null = null;
    if (uniRaw) {
      const { data: byCode } = await db.from("universities").select("id").ilike("code", likeEscape(uniRaw)).maybeSingle();
      universityId = byCode?.id ?? null;
      if (!universityId) {
        const { data: byName } = await db.from("universities").select("id").ilike("name", `%${likeEscape(uniRaw)}%`).limit(1);
        universityId = byName?.[0]?.id ?? null;
      }
    }
    // Derive the raiser's campus from their staff scope / directory row.
    if (!universityId && email) {
      const { data: prof } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
      if (prof) {
        const { data: ra } = await db
          .from("role_assignments")
          .select("scope_id")
          .eq("user_id", prof.id)
          .eq("role", "university_staff")
          .eq("scope_type", "university")
          .limit(1);
        universityId = (ra?.[0]?.scope_id as string | null) ?? null;
      }
      if (!universityId) {
        const { data: sRow } = await db
          .from("university_staff")
          .select("university_id")
          .ilike("email", email)
          .limit(1);
        universityId = (sRow?.[0]?.university_id as string | null) ?? null;
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
    // "Other (not listed)" lets a raiser flag a new/unlisted subject — it lands
    // with no capability and instantly alerts the admin (Teams + email) to add it.
    universities: (unis ?? []).map((u) => u.name),
    subjects: [...(subs ?? []).map((s) => s.name), "Other (not listed)"],
    reasons: (reasons ?? []).map((r) => r.label),
    modes: ["No preference", "Online", "Offline"],
  });
}
