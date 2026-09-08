// Align the app's universities to Zoho's Campus_Details names (APP-SIDE ONLY).
// - RENAMES: same campus, adopt Zoho's exact spelling (no duplicate row; id kept,
//   so existing tickets/staff keep working — only the display name changes).
// - ADDS: campuses in Zoho that the app doesn't have yet (name only; code/city/
//   state left blank — fill later if you want).
// Idempotent: safe to re-run. One prod-DB write.
//   node --env-file=.env.local scripts/reconcile-unis.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// [current app name, Zoho canonical name]
const RENAMES = [
  ["GMRIT (Rajam)", "GMR Institute Of Technology"],
  ["Subharti University (Meerut)", "Subarthi University"],           // Zoho's spelling (adopt to auto-match)
  ["Lingayas (Faridabad)", "Lingaya's Vidyapeeth"],
  ["St Peters (Bangalore)", "St. Peter's Institute of Higher Education and Research"],
];

// Zoho campuses the app is missing entirely (exact Zoho names).
const ADDS = [
  "Lingaya's Institute of Management and Technology",
  "St Mary's Rehabilitation University",
  "Scope Global Skills University",
  "MNR Group of Institutions",
  "Amrita Sai University",
  "PBR Visodyaya University",
  "PBR Visvodaya Institute of Technology & Science",
  "Vels University",
  "Sharda University",
  // Internal / non-campus entities that also live in Zoho's campus list — added
  // so their tickets auto-match too (per "whatever is in Zoho is in the app").
  "Intensive - Online",
  "Intensive - Offline",
  "CCBP Academy",
  "Central Team",
  "NIAT",
];

const { data: existing } = await db.from("universities").select("id, name");
const byLower = new Map((existing ?? []).map((u) => [u.name.toLowerCase(), u]));

console.log("=== RENAMES ===");
for (const [from, to] of RENAMES) {
  const row = byLower.get(from.toLowerCase());
  const clash = byLower.get(to.toLowerCase());
  if (!row) { console.log(`  skip "${from}" — not found (already renamed?)`); continue; }
  if (clash && clash.id !== row.id) { console.log(`  skip "${from}" → "${to}" — target already exists`); continue; }
  const { error } = await db.from("universities").update({ name: to }).eq("id", row.id);
  console.log(error ? `  ✗ "${from}": ${error.message}` : `  ✅ "${from}"  →  "${to}"`);
}

console.log("\n=== ADDS ===");
for (const name of ADDS) {
  if (byLower.has(name.toLowerCase())) { console.log(`  skip "${name}" — already present`); continue; }
  const { error } = await db.from("universities").insert({ name });
  console.log(error ? `  ✗ "${name}": ${error.message}` : `  ➕ "${name}"`);
}

const { count } = await db.from("universities").select("id", { count: "exact", head: true });
console.log(`\n✅ Done. Universities in app now: ${count}. Re-run scripts/uni-unmatched.mjs — it should show 0 unmatched.`);
