// Persist BOTH Teams channel URLs into teams_config (production).
// Reads TEAMS_MAIN_WEBHOOK_URL (main/all-notifications) and TEAMS_HOD_WEBHOOK_URL
// (HOD invoices) from .env.local. DB-driven — no redeploy needed.
//   node --env-file=.env.local scripts/set-teams-channels.mjs
import pg from "pg";
const { Client } = pg;
const REF = "takdccssaodydjrtrnwc";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const MAIN = process.env.TEAMS_MAIN_WEBHOOK_URL;
const HOD = process.env.TEAMS_HOD_WEBHOOK_URL;
if (!PASSWORD) { console.error("Missing SUPABASE_DB_PASSWORD."); process.exit(1); }
if (!MAIN) { console.error("Missing TEAMS_MAIN_WEBHOOK_URL in .env.local."); process.exit(1); }
if (!HOD) { console.error("Missing TEAMS_HOD_WEBHOOK_URL in .env.local."); process.exit(1); }

const CANDIDATES = [
  { host: "aws-0-ap-south-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { host: "aws-1-ap-south-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { host: "aws-0-ap-south-1.pooler.supabase.com", port: 6543, user: `postgres.${REF}` },
];
async function connect() {
  for (const c of CANDIDATES) {
    const client = new Client({ host: c.host, port: c.port, user: c.user, password: PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
    try { await client.connect(); console.log(`✓ Connected via ${c.host}:${c.port}`); return client; }
    catch (e) { console.log(`… ${c.host}:${c.port} failed (${e.code || e.message})`); try { await client.end(); } catch {} }
  }
  throw new Error("Could not connect.");
}
const client = await connect();
try {
  await client.query("update public.teams_config set teams_webhook_url = $1, hod_webhook_url = $2 where id = true", [MAIN, HOD]);
  const { rows } = await client.query("select enabled, (teams_webhook_url is not null) as main, (hod_webhook_url is not null) as hod from public.teams_config where id = true");
  const r = rows[0] || {};
  console.log("\n✅ teams_config updated:");
  console.log(`   enabled: ${r.enabled}`);
  console.log(`   main channel (Backup OS) set:      ${r.main}`);
  console.log(`   HOD channel (Backup OS Invoices):  ${r.hod}`);
} finally { await client.end(); }
