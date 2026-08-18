// Full data import: university staff + instructors from the parsed sheet JSON.
// Also pre-authorizes staff (access_grants) scoped to their university so they
// get the right dashboard on first login.
//   node --env-file=.env.local scripts/import-sheets.mjs
import { readFileSync } from "node:fs";
import pg from "pg";

const { Client } = pg;
const REF = "takdccssaodydjrtrnwc";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const DATA_DIR =
  process.argv[2] ||
  "C:\\Users\\Asus\\AppData\\Local\\Temp\\claude\\C--Users-Asus-Desktop-OPs-Automations-Backup-Ins-product\\2cfad1fb-08b3-437a-8f90-fe3cf6452094\\scratchpad";

// Instructor-sheet short names → university codes
const SHORT_TO_CODE = {
  cdu: "TG001", mrv: "TG003", nri: "AP001", amet: "TN001", annamacharya: "AP002",
  cresent: "TN002", crescent: "TN002", takshashila: "TN007", nsrit: "AP004",
  chalapathi: "AP003", niu: "UP001", adypu: "MH002", sgu: "MH001",
  yenapoya: "KA004", yenepoya: "KA004", svyasa: "KA001", vgu: "RJ001", aurora: "TG002",
};

function capabilityFor(raw) {
  const s = (raw || "").toLowerCase();
  if (/dsa|data struct|algorithm|daa/.test(s)) return "Data Structures & Algorithms";
  if (/backend|back end|server[- ]?side/.test(s)) return "Backend Systems";
  if (/frontend|front end|react/.test(s)) return "Frontend Technologies";
  if (/english|communicat/.test(s)) return "English & Communication Studies";
  if (/logical|reasoning|aptitude|quant/.test(s)) return "Quantitative Aptitude & Logical Reasoning";
  return null;
}
function slug(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
function normType(s) {
  const t = (s || "").toLowerCase();
  if (t.startsWith("old")) return "Old";
  if (t.startsWith("new")) return "New";
  return s || null;
}
const clean = (s) => (s == null ? "" : String(s).replace(/\\#N\/A|\\\[merged\\\]|[\\()]/g, "").trim());

async function connect() {
  for (const host of ["aws-0-ap-south-1.pooler.supabase.com", "aws-1-ap-south-1.pooler.supabase.com"]) {
    const c = new Client({ host, port: 5432, user: `postgres.${REF}`, password: PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
    try { await c.connect(); console.log(`✓ Connected via ${host}`); return c; }
    catch (e) { console.log(`… ${host} failed (${e.code || e.message})`); try { await c.end(); } catch {} }
  }
  throw new Error("No DB connection");
}

async function main() {
  const staff = JSON.parse(readFileSync(`${DATA_DIR}\\staff.json`, "utf8"));
  const instructors = JSON.parse(readFileSync(`${DATA_DIR}\\instructors.json`, "utf8"));
  console.log(`Loaded ${staff.length} staff, ${instructors.length} instructors\n`);

  const db = await connect();
  try {
    const { rows: unis } = await db.query("select id, code, lower(name) name from universities");
    const byCode = new Map(unis.filter((u) => u.code).map((u) => [u.code.toLowerCase(), u.id]));
    const byName = unis;
    const findUniByName = (name) => {
      const n = (name || "").toLowerCase();
      if (!n) return null;
      const hit = byName.find((u) => u.name === n) || byName.find((u) => n.includes(u.name) || u.name.includes(n));
      return hit?.id ?? null;
    };
    const { rows: caps } = await db.query("select id, name from capabilities");
    const capId = new Map(caps.map((c) => [c.name, c.id]));

    // ---- Staff ----
    let staffIns = 0, grants = 0;
    for (const s of staff) {
      const name = clean(s.full_name);
      if (!name) continue;
      const code = clean(s.university_code).toUpperCase();
      let uid = code ? byCode.get(code.toLowerCase()) ?? null : null;
      if (!uid) uid = findUniByName(s.university_name);
      const email = clean(s.email).toLowerCase();
      const empId = clean(s.employee_id);

      const { rowCount } = await db.query(
        `insert into university_staff (employee_id, full_name, university_id, personal_contact, office_contact, email, role, status)
         select $1,$2,$3::uuid,$4,$5,$6,$7,'active'
         where not exists (select 1 from university_staff where full_name=$2 and coalesce(university_id::text,'')=coalesce($3::text,''))`,
        [empId || null, name, uid, clean(s.personal_contact) || null, clean(s.office_contact) || null, email || null, clean(s.role) || null],
      );
      staffIns += rowCount;

      // Pre-authorize staff scoped to their campus
      if (uid && /@nxtwave\.(in|co\.in)$/.test(email)) {
        const { rowCount: g } = await db.query(
          `insert into access_grants (email, role, scope_type, scope_id)
           select $1,'university_staff','university',$2::uuid
           where not exists (select 1 from access_grants where lower(email)=lower($1) and role='university_staff')`,
          [email, uid],
        );
        grants += g;
      }
    }
    console.log(`✓ Staff inserted: ${staffIns} · staff access pre-authorized: ${grants}`);

    // ---- Instructors (+ dynamic subjects) ----
    const subjectCache = new Map();
    async function ensureSubject(raw) {
      const sl = slug(raw);
      if (!sl) return null;
      if (subjectCache.has(sl)) return subjectCache.get(sl);
      const cap = capabilityFor(raw);
      await db.query(
        `insert into subjects (name, normalized_name, capability_id)
         values ($1,$2,$3) on conflict (normalized_name) do nothing`,
        [clean(raw) || sl, sl, cap ? capId.get(cap) : null],
      );
      const { rows } = await db.query("select id from subjects where normalized_name=$1", [sl]);
      const id = rows[0]?.id ?? null;
      subjectCache.set(sl, id);
      return id;
    }

    let insIns = 0;
    for (const it of instructors) {
      const name = clean(it.instructor_name);
      if (!name) continue;
      const short = clean(it.university_short).toLowerCase();
      const code = SHORT_TO_CODE[short];
      let uid = code ? byCode.get(code.toLowerCase()) ?? null : null;
      if (!uid) uid = findUniByName(it.university_short);
      const subjectId = await ensureSubject(it.subject_raw);
      const emp = clean(it.emp_id);

      const { rowCount } = await db.query(
        `insert into instructors (university_id, subject_id, instructor_name, emp_id, instructor_type, deployment_status, workload, mentor_name, mentor_emp_id, remarks, status)
         select $1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,'active'
         where not exists (select 1 from instructors where instructor_name=$3 and coalesce(subject_id::text,'')=coalesce($2::text,'') and coalesce(emp_id,'')=coalesce($4,''))`,
        [uid, subjectId, name, emp || null, normType(it.instructor_type), clean(it.deployment_status) || null, clean(it.workload) || null, clean(it.mentor_name) || null, clean(it.mentor_emp_id) || null, clean(it.remarks) || null],
      );
      insIns += rowCount;
    }
    console.log(`✓ Instructors inserted: ${insIns} · subjects now: ${subjectCache.size} distinct`);

    const { rows: c } = await db.query(`select
      (select count(*) from university_staff)::int staff,
      (select count(*) from instructors)::int inst,
      (select count(*) from subjects)::int subj,
      (select count(*) from access_grants where role='university_staff')::int grants`);
    console.log(`\n✅ Import complete. staff=${c[0].staff} instructors=${c[0].inst} subjects=${c[0].subj} staff_grants=${c[0].grants}`);
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error("✗ Import failed:", e.message); process.exit(1); });
