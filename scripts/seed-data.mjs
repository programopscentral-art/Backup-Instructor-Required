// Seeds reference data (universities, capabilities, subjects, backup pool) from
// the NIAT sheets — a ONE-TIME import. Idempotent; safe to re-run.
//   node --env-file=.env.local scripts/seed-data.mjs
import pg from "pg";

const { Client } = pg;
const REF = "takdccssaodydjrtrnwc";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) {
  console.error("Missing SUPABASE_DB_PASSWORD");
  process.exit(1);
}

const CANDIDATES = [
  { host: "aws-0-ap-south-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { host: "aws-1-ap-south-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
];

const UNIVERSITIES = [
  ["MH002", "Ajeenkya D.Y. Patil University (Pune)", "Pune", "MH"],
  ["MH003", "ALARD", "Pune", "MH"],
  ["TN001", "AMET University (Chennai)", "Chennai", "TN"],
  ["AP002", "Annamacharya University (Rajampet)", "Rajampet", "AP"],
  ["TG002", "Aurora Deemed University", "Hyderabad", "TS"],
  ["AP005", "BEST (Andhra Pradesh)", "Anantapur", "AP"],
  ["TN008", "Bharath University (Chennai)", "Chennai", "TN"],
  ["TG001", "Chaitanya Deemed University (CDU)", "Hyderabad", "TS"],
  ["AP003", "Chalapathi Institute of Technology (Guntur)", "Guntur", "AP"],
  ["TN002", "Crescent University (Chennai)", "Chennai", "TN"],
  ["HR002", "Geeta University (Panipat)", "Panipat", "HR"],
  ["AP006", "GMRIT (Rajam)", "Vizag", "AP"],
  ["TN004", "JOY University (Chennai)", "Chennai", "TN"],
  ["TG006", "KKH", "Hyderabad", "TS"],
  ["HR003", "Lingayas (Faridabad)", "Faridabad", "HR"],
  ["TG003", "Malla Reddy University", "Hyderabad", "TS"],
  ["TG005", "NIAT - BITS (Chevella)", "Hyderabad", "TS"],
  ["UP001", "Noida International University", "Noida", "UP"],
  ["AP001", "NRI (Vijayawada)", "Vijayawada", "AP"],
  ["AP004", "NSRIT (Vizag)", "Vizag", "AP"],
  ["KA001", "S-Vyasa (Bengaluru)", "Bangalore", "KA"],
  ["MH004", "Sandip University (Nashik)", "Nashik", "MH"],
  ["MH001", "Sanjay Ghodawat University (Kolhapur)", "Kolhapur", "MH"],
  ["UP002", "Sanskriti University (Mathura)", "Mathura", "UP"],
  ["MP001", "SGSU (Bhopal)", "Bhopal", "MP"],
  ["TN003", "SIPHER (Chennai)", "Chennai", "TN"],
  ["TG004", "SMRU (Hyderabad)", "Hyderabad", "TS"],
  ["TN006", "SNS (Coimbatore)", "Coimbatore", "TN"],
  ["OD001", "Sri Sri University", "Bhubaneswar", "OD"],
  ["KA003", "St Peters (Bangalore)", "Bangalore", "KA"],
  ["UP003", "Subharti University (Meerut)", "Meerut", "UP"],
  ["HR001", "Sushant University (Gurugram)", "Gurugram", "HR"],
  ["UP004", "T. S Mishra University (Lucknow)", "Lucknow", "UP"],
  ["TN007", "Takshashila University (Pondicherry)", "Pondicherry", "TN"],
  ["RJ001", "Vivekananda Global University (Jaipur)", "Jaipur", "RJ"],
  ["KA004", "Yenepoya University (Bengaluru)", "Bangalore", "KA"],
  ["KA002", "Yenepoya University (Mangalore)", "Mangalore", "KA"],
  ["AP007", "Lingayas AP (Vijayawada)", "Vijayawada", "AP"],
  ["TN009", "PK Das University (Coimbatore)", "Coimbatore", "TN"],
  ["AP009", "Vikasha", null, "AP"],
  ["AP010", "MVR", null, "AP"],
];

const CAPABILITIES = [
  ["Data Structures & Algorithms", "Sigatapu Sai Sankar"],
  ["Backend Systems", "Meka Sri Satya Prudhvi Charan"],
  ["Frontend Technologies", "Preethi Vangaveti"],
  ["English & Communication Studies", "Riya Rai"],
  ["Quantitative Aptitude & Logical Reasoning", "Voppangi Sai Prasanna"],
];

const SUBJECTS = [
  ["DSA", "dsa", "Data Structures & Algorithms"],
  ["Design & Analysis of Algorithms", "daa", "Data Structures & Algorithms"],
  ["Backend Development", "backend", "Backend Systems"],
  ["Server Side Engineering", "server-side", "Backend Systems"],
  ["Frontend Technologies", "frontend", "Frontend Technologies"],
  ["Applied Communicative English", "english", "English & Communication Studies"],
  ["Logical Reasoning", "logical-reasoning", "Quantitative Aptitude & Logical Reasoning"],
  ["Quantitative Aptitude", "aptitude", "Quantitative Aptitude & Logical Reasoning"],
  ["Probability & Statistics", "probability-statistics", null],
  ["Operating Systems", "operating-systems", null],
  ["Introduction to Finance", "finance", null],
  ["Mathematics", "math", null],
];

const POOL = [
  ["Aanchal Lalit", "English & Communication Studies"],
  ["Uthara", "English & Communication Studies"],
  ["Ankit", "English & Communication Studies"],
  ["Anuron Banik Chowdhury", "English & Communication Studies"],
  ["Bhumika Upadhyay", "English & Communication Studies"],
  ["Sahil Agarwal", "English & Communication Studies"],
  ["Mamidisetti Venkata Vijay Kumar", "Quantitative Aptitude & Logical Reasoning"],
  ["Thorlikonda Naga Suma", "Quantitative Aptitude & Logical Reasoning"],
  ["Likhita Yerra", "Quantitative Aptitude & Logical Reasoning"],
  ["Thota Jagadeesh", "Backend Systems"],
  ["Sparsh Sharma", "Frontend Technologies"],
  ["Manas Jyoti Roy", "Data Structures & Algorithms"],
  ["Dhakar Girish", "Data Structures & Algorithms"],
];

async function connect() {
  for (const c of CANDIDATES) {
    const client = new Client({
      host: c.host,
      port: c.port,
      user: c.user,
      password: PASSWORD,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12000,
    });
    try {
      await client.connect();
      console.log(`✓ Connected via ${c.host}`);
      return client;
    } catch (e) {
      console.log(`… ${c.host} failed (${e.code || e.message})`);
      try { await client.end(); } catch {}
    }
  }
  throw new Error("No DB connection.");
}

async function main() {
  const db = await connect();
  try {
    for (const [code, name, city, state] of UNIVERSITIES) {
      await db.query(
        `insert into universities (code, name, city, state) values ($1,$2,$3,$4)
         on conflict (code) do nothing`,
        [code, name, city, state],
      );
    }
    console.log(`✓ Universities: ${UNIVERSITIES.length}`);

    for (const [name, manager] of CAPABILITIES) {
      await db.query(
        `insert into capabilities (name, manager_name) values ($1,$2)
         on conflict (name) do update set manager_name = excluded.manager_name`,
        [name, manager],
      );
    }
    console.log(`✓ Capabilities: ${CAPABILITIES.length}`);

    for (const [name, norm, cap] of SUBJECTS) {
      await db.query(
        `insert into subjects (name, normalized_name, capability_id)
         values ($1,$2,(select id from capabilities where name=$3))
         on conflict (normalized_name) do nothing`,
        [name, norm, cap],
      );
    }
    console.log(`✓ Subjects: ${SUBJECTS.length}`);

    for (const [name, cap] of POOL) {
      await db.query(
        `insert into backup_instructor_pool (instructor_name, capability_id, availability_mode, current_status, status)
         select $1, (select id from capabilities where name=$2), 'both', 'available', 'active'
         where not exists (
           select 1 from backup_instructor_pool
           where instructor_name = $1 and capability_id = (select id from capabilities where name=$2)
         )`,
        [name, cap],
      );
    }
    console.log(`✓ Backup pool: ${POOL.length}`);

    const c = await db.query(`select
      (select count(*) from universities)::int u,
      (select count(*) from capabilities)::int c,
      (select count(*) from subjects)::int s,
      (select count(*) from backup_instructor_pool)::int p`);
    console.log(`\n✅ Seeded. universities=${c.rows[0].u} capabilities=${c.rows[0].c} subjects=${c.rows[0].s} pool=${c.rows[0].p}`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error("\n✗ Seed failed:", e.message);
  process.exit(1);
});
