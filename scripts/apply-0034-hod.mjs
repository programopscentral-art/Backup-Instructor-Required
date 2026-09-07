// Applies migration 0034 (HOD Teams channel) and sets teams_config.hod_webhook_url
// from TEAMS_HOD_WEBHOOK_URL in your env (.env.local — git-ignored, secret stays
// out of git). DB-driven, so no Vercel env change is needed to activate.
//   node --env-file=.env.local scripts/apply-0034-hod.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const REF = "takdccssaodydjrtrnwc";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const HOD_URL = process.env.TEAMS_HOD_WEBHOOK_URL;
if (!PASSWORD) { console.error("Missing SUPABASE_DB_PASSWORD in env."); process.exit(1); }
if (!HOD_URL) { console.error("Missing TEAMS_HOD_WEBHOOK_URL in env (.env.local)."); process.exit(1); }

const CANDIDATES = [
  { host: "aws-0-ap-south-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { host: "aws-1-ap-south-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { host: "aws-0-ap-south-1.pooler.supabase.com", port: 6543, user: `postgres.${REF}` },
  { host: `db.${REF}.supabase.co`, port: 5432, user: "postgres" },
];

async function connect() {
  for (const c of CANDIDATES) {
    const client = new Client({ host: c.host, port: c.port, user: c.user, password: PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
    try { await client.connect(); console.log(`✓ Connected via ${c.host}:${c.port}`); return client; }
    catch (e) { console.log(`… ${c.host}:${c.port} failed (${e.code || e.message})`); try { await client.end(); } catch {} }
  }
  throw new Error("Could not connect to the database on any candidate host.");
}

async function main() {
  const client = await connect();
  try {
    process.stdout.write("Running migrations/0034_teams_hod_channel.sql … ");
    await client.query(readFileSync(join(root, "supabase", "migrations", "0034_teams_hod_channel.sql"), "utf8"));
    console.log("done");

    process.stdout.write("Setting teams_config.hod_webhook_url … ");
    await client.query("update public.teams_config set hod_webhook_url = $1 where id = true", [HOD_URL]);
    console.log("done");

    const { rows } = await client.query(
      "select enabled, (dispatch_url is not null) as has_dispatch, (teams_webhook_url is not null) as has_main, (hod_webhook_url is not null) as has_hod from public.teams_config where id = true",
    );
    const c = rows[0] || {};
    console.log("\n✅ teams_config:");
    console.log(`   enabled: ${c.enabled}`);
    console.log(`   dispatch route set: ${c.has_dispatch}`);
    console.log(`   main channel set:   ${c.has_main}`);
    console.log(`   HOD channel set:    ${c.has_hod}`);
    if (!c.enabled) console.log("   ⚠️ Teams is disabled — the whole integration is dormant until enabled=true.");
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("\n✗ Failed:", e.message); process.exit(1); });
