// One-off: replace the universities list with the canonical Zoho set.
// Renames existing matches (preserves FKs), inserts new, deletes the rest.
// Backs up everything to scratchpad first.
import { Client } from "pg";
import { writeFileSync } from "node:fs";

// [code, exact name, city] — code reused for renames; AP011 is the one new campus.
const CANON = [
  ["MH002", "Ajeenkya DY Patil University - Pune", "Pune"],
  ["TN001", "AMET University - Chennai", "Chennai"],
  ["AP002", "Annamacharya University - Rajampet", "Rajampet"],
  ["TG002", "Aurora Deemed University - Bhuvangiri", "Bhuvangiri"],
  ["TG001", "Chaitanya – Deemed to be University - Hyderabad", "Hyderabad"],
  ["AP003", "Chalapathi Institute of Technology, Autonomous - Mothadaka", "Mothadaka"],
  ["AP011", "Chalapathi Institute of Engineering and Technology - LAM", "LAM"], // NEW
  ["TN002", "Crescent University - Chennai", "Chennai"],
  ["TG003", "Malla Reddy Vishwavidyapeeth - Hyderabad", "Hyderabad"],
  ["TG005", "NIAT - Chevella", "Chevella"],
  ["TG006", "NIAT - KKH - Hyderabad", "Hyderabad"],
  ["UP001", "Noida International University - Uttar Pradesh", "Uttar Pradesh"],
  ["AP001", "NRI Institute of Technology - Vijayawada", "Vijayawada"],
  ["AP004", "NSRIT - Nadimpalli Satyanarayana Raju Institute of Technology - Vizag", "Vizag"],
  ["KA001", "S-VYASA University - Bengaluru", "Bengaluru"],
  ["MH001", "Sanjay Ghodawat University - Kolhapur", "Kolhapur"],
  ["TN007", "Takshashila University - Pondicherry", "Pondicherry"],
  ["RJ001", "Vivekananda Global University - Jaipur", "Jaipur"],
  ["KA002", "Yenepoya University - Mangalore", "Mangalore"],
];
const KEEP = CANON.map((r) => r[0]);
const NEW_CODE = "AP011";

const conn = "postgresql://postgres.takdccssaodydjrtrnwc:" + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD) + "@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";
const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();

// --- Backup ---
const backup = {
  universities: (await c.query("select * from universities")).rows,
  staff_links: (await c.query("select id, university_id from university_staff where university_id is not null")).rows,
  instructor_links: (await c.query("select id, university_id from instructors where university_id is not null")).rows,
};
const bkPath = process.argv[2] || "universities-backup.json";
writeFileSync(bkPath, JSON.stringify(backup, null, 2));
console.log("backup written to", bkPath, "(", backup.universities.length, "universities )");

try {
  await c.query("BEGIN");
  // Rename existing / insert new
  let renamed = 0, inserted = 0;
  for (const [code, name, city] of CANON) {
    if (code === NEW_CODE) continue;
    const r = await c.query("update universities set name=$1, city=$2, status='active' where code=$3", [name, city, code]);
    renamed += r.rowCount;
  }
  const ins = CANON.find((r) => r[0] === NEW_CODE);
  const insRes = await c.query(
    "insert into universities (code, name, city, status) values ($1,$2,$3,'active') on conflict (code) do update set name=excluded.name, city=excluded.city, status='active'",
    ins,
  );
  inserted = insRes.rowCount;
  // No deletions — non-matching old universities are left exactly as they are.
  await c.query("COMMIT");
  console.log(`renamed=${renamed} inserted=${inserted} (no deletions — old non-matching universities kept)`);
  const finalRows = (await c.query("select code, name, city from universities order by name")).rows;
  console.log("\nFinal universities (", finalRows.length, "):");
  for (const r of finalRows) console.log(" -", r.code, "|", r.name);
} catch (e) {
  await c.query("ROLLBACK");
  console.error("ROLLED BACK:", e.message);
}
await c.end();
