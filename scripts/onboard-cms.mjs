// Onboards the 5 Capability Managers (synthesized test emails), then PROVES the
// RLS scoping: each CM can see only their capability's tickets.
//   node --env-file=.env.local scripts/onboard-cms.mjs
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, svc, { auth: { persistSession: false } });
const REF = "takdccssaodydjrtrnwc";

const CMS = [
  { name: "Riya Rai", email: "riya.rai@nxtwave.in", capability: "English & Communication Studies" },
  { name: "Voppangi Sai Prasanna", email: "voppangi.saiprasanna@nxtwave.in", capability: "Quantitative Aptitude & Logical Reasoning" },
  { name: "Meka Sri Satya Prudhvi Charan", email: "meka.srisatyaprudhvicharan@nxtwave.in", capability: "Backend Systems" },
  { name: "Preethi Vangaveti", email: "preethi.vangaveti@nxtwave.in", capability: "Frontend Technologies" },
  { name: "Sigatapu Sai Sankar", email: "sigatapu.saisankar@nxtwave.in", capability: "Data Structures & Algorithms" },
];

async function pgc() {
  const c = new pg.Client({ host: "aws-0-ap-south-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}`, password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

async function main() {
  console.log("\n▶ Onboarding Capability Managers + RLS scoping test\n");
  const db = await pgc();
  let pass = 0, fail = 0;
  const check = (n, ok, x = "") => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${x}`); } };

  try {
    const { rows: adminRows } = await db.query("select id from profiles where email='programopscentral@nxtwave.in'");
    const adminId = adminRows[0]?.id ?? null;

    const cmIds = {};
    for (const cm of CMS) {
      const { rows: capRows } = await db.query("select id from capabilities where name=$1", [cm.capability]);
      const capId = capRows[0]?.id;
      if (!capId) { check(`capability found: ${cm.capability}`, false); continue; }

      // Pre-authorize by email (for real future logins)
      await db.query(
        `insert into access_grants (email, role, scope_type, scope_id, granted_by)
         select $1,'capability_manager','capability',$2::uuid,$3::uuid
         where not exists (select 1 from access_grants where lower(email)=lower($1) and role='capability_manager')`,
        [cm.email, capId, adminId],
      );

      // Create the auth user (no email sent; confirmed). Trigger builds the profile.
      const { error: cErr } = await sb.auth.admin.createUser({ email: cm.email, email_confirm: true });
      const created = !cErr;
      const alreadyExists = cErr && /already|registered|exists/i.test(cErr.message);

      // Find the profile id
      const { rows: pRows } = await db.query("select id from profiles where lower(email)=lower($1)", [cm.email]);
      const uid = pRows[0]?.id ?? null;
      cmIds[cm.capability] = uid;

      // Ensure the role assignment + activate + link as capability manager
      if (uid) {
        await db.query(
          `insert into role_assignments (user_id, role, scope_type, scope_id, granted_by)
           select $1::uuid,'capability_manager','capability',$2::uuid,$3::uuid
           where not exists (select 1 from role_assignments where user_id=$1::uuid and role='capability_manager' and scope_id=$2::uuid)`,
          [uid, capId, adminId],
        );
        await db.query("update profiles set status='active' where id=$1", [uid]);
        await db.query("update capabilities set manager_user_id=$1::uuid, manager_name=$2 where id=$3::uuid", [uid, cm.name, capId]);
      }
      check(`onboarded ${cm.name} → ${cm.capability} (${created ? "new" : alreadyExists ? "existing" : "?"})`, !!uid, cErr && !alreadyExists ? cErr.message : "");
    }

    // ---- RLS scoping proof ----
    console.log("\n  — RLS scoping test —");
    const { rows: caps } = await db.query("select id, name from capabilities where name in ('Data Structures & Algorithms','Backend Systems')");
    const dsa = caps.find((c) => c.name === "Data Structures & Algorithms");
    const backend = caps.find((c) => c.name === "Backend Systems");
    const { rows: uni } = await db.query("select id from universities limit 1");

    // Two tickets in different capabilities
    const mk = async (capId) => {
      const { rows } = await db.query(
        `insert into tickets (university_id, capability_id, absent_instructor_name, reason, raised_by, status)
         values ($1::uuid,$2::uuid,'RLS test','RLS-TEST',$3::uuid,'raised') returning id`,
        [uni[0].id, capId, adminId],
      );
      return rows[0].id;
    };
    const dsaTicket = await mk(dsa.id);
    const backendTicket = await mk(backend.id);

    // Impersonate a user under RLS: SET ROLE authenticated + jwt claims
    const asUser = async (uid) => {
      await db.query("begin");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
      await db.query("set local role authenticated");
      const { rows } = await db.query("select capability_id from tickets where reason='RLS-TEST'");
      await db.query("rollback");
      return rows.map((r) => r.capability_id);
    };

    const dsaCM = cmIds["Data Structures & Algorithms"];
    const backendCM = cmIds["Backend Systems"];

    const dsaSees = await asUser(dsaCM);
    check("DSA manager sees the DSA ticket", dsaSees.includes(dsa.id));
    check("DSA manager does NOT see the Backend ticket", !dsaSees.includes(backend.id));

    const backendSees = await asUser(backendCM);
    check("Backend manager sees the Backend ticket", backendSees.includes(backend.id));
    check("Backend manager does NOT see the DSA ticket", !backendSees.includes(dsa.id));

    const adminSees = await asUser(adminId);
    check("Admin sees BOTH tickets", adminSees.includes(dsa.id) && adminSees.includes(backend.id));

    // cleanup
    await db.query("delete from tickets where reason='RLS-TEST'");

    console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
    console.log("\nCapability Managers can now sign in with their @nxtwave.in email and land on a CM dashboard scoped to their vertical.\n");
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
