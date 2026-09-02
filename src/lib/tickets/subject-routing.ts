import { createAdminClient } from "@/lib/supabase/admin";
import { likeEscape } from "@/lib/zoho/security";

type AdminDB = ReturnType<typeof createAdminClient>;

/** Normalize a subject/vertical name for tolerant matching: lowercase, strip
 *  everything but a–z0–9. So "Gen AI", "GenAI", "gen  ai" all compare equal. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Find-or-create a subject row named `name`, mapped to `capabilityId`. If a row
 * already exists (by name, or by the unique normalized key) but points at a
 * different/no capability, heal the mapping. Reference-data maintenance — always
 * call with a service-role (admin) client.
 */
export async function ensureSubject(db: AdminDB, name: string, capabilityId: string | null): Promise<string | null> {
  const clean = name.trim();
  if (!clean) return null;

  // Existing by display name (case-insensitive). Oldest wins if duplicates exist.
  const { data: existing } = await db
    .from("subjects")
    .select("id, capability_id")
    .ilike("name", likeEscape(clean))
    .order("created_at", { ascending: true })
    .limit(1);
  const row = existing?.[0] as { id: string; capability_id: string | null } | undefined;
  if (row) {
    if (capabilityId && row.capability_id !== capabilityId) {
      await db.from("subjects").update({ capability_id: capabilityId }).eq("id", row.id);
    }
    return row.id;
  }

  const normalized = clean.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || clean.toLowerCase();
  const { data: created, error } = await db
    .from("subjects")
    .insert({ name: clean, normalized_name: normalized, capability_id: capabilityId, status: "active" })
    .select("id")
    .maybeSingle();
  if (created) return (created as { id: string }).id;

  // Insert failed — most likely the unique(normalized_name) constraint (a
  // punctuation/spacing variant already occupies this key). Fall back to that row
  // and heal its mapping, so we never lose the ticket's subject silently.
  if (error) {
    const { data: byNorm } = await db
      .from("subjects")
      .select("id, capability_id")
      .eq("normalized_name", normalized)
      .order("created_at", { ascending: true })
      .limit(1);
    const nrow = byNorm?.[0] as { id: string; capability_id: string | null } | undefined;
    if (nrow) {
      if (capabilityId && nrow.capability_id !== capabilityId) {
        await db.from("subjects").update({ capability_id: capabilityId }).eq("id", nrow.id);
      }
      return nrow.id;
    }
  }
  return null;
}

export interface SubjectRoute {
  capabilityId: string | null;
  subjectId: string | null;
}

/**
 * Resolve a raw subject NAME (from Zoho or the product raise form) to its
 * capability + subject, using the **subject verticals (capabilities) as the
 * primary routing key**:
 *
 *   1. Match a subject vertical (capability) by normalized name, so spacing/case
 *      variants still hit. This is what makes "Gen AI" route to the Gen AI CMs.
 *   2. Legacy fallback — a granular `subjects` row (exact, then contains); route via
 *      its capability_id.
 *   3. Unknown — create an unmapped subject so it shows on the ticket; capability
 *      stays null → the ticket flags "needs admin".
 *
 * "Other (not listed)" (and blanks) are explicit new-subject signals: they resolve
 * to nothing (no junk subject row) → needs admin, and the admin then picks/creates
 * the vertical.
 *
 * Adding a new subject later is therefore zero-code: create the vertical + its CM(s)
 * in Directory → Capability Managers (and mirror the name in Zoho) and it routes.
 */
export async function resolveSubjectName(db: AdminDB, rawName: string): Promise<SubjectRoute> {
  const name = (rawName || "").trim();
  if (!name || norm(name) === "othernotlisted") return { capabilityId: null, subjectId: null };

  // 1) PRIMARY — a subject vertical (capability), matched by normalized name.
  //    Ordered so an (accidental) case-variant duplicate resolves deterministically.
  const { data: caps } = await db
    .from("capabilities")
    .select("id, name")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  const target = norm(name);
  const cap = ((caps ?? []) as { id: string; name: string }[]).find((c) => norm(c.name) === target);
  if (cap) {
    const subjectId = await ensureSubject(db, name, cap.id);
    return { capabilityId: cap.id, subjectId };
  }

  // 2) LEGACY — a granular subject row (exact, then contains). Oldest wins.
  const { data: exact } = await db
    .from("subjects")
    .select("id, capability_id")
    .ilike("name", likeEscape(name))
    .order("created_at", { ascending: true })
    .limit(1);
  let row = exact?.[0] as { id: string; capability_id: string | null } | undefined;
  if (!row) {
    const { data: like } = await db
      .from("subjects")
      .select("id, capability_id")
      .ilike("name", `%${likeEscape(name)}%`)
      .order("created_at", { ascending: true })
      .limit(1);
    row = like?.[0] as { id: string; capability_id: string | null } | undefined;
  }
  if (row) return { capabilityId: row.capability_id ?? null, subjectId: row.id };

  // 3) UNKNOWN — create an unmapped subject (shows on the ticket) → needs admin.
  const subjectId = await ensureSubject(db, name, null);
  return { capabilityId: null, subjectId };
}
