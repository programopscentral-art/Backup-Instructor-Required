// Applies migration 0035 (ticket_remarks table + RLS + realtime) to Supabase.
// Purely additive. Run before testing the new features locally.
//   node --env-file=.env.local scripts/apply-0035.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const REF = "takdccssaodydjrtrnwc";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("Missing SUPABASE_DB_PASSWORD in env."); process.exit(1); }
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
  process.stdout.write("Running migrations/0035_ticket_remarks.sql … ");
  await client.query(readFileSync(join(root, "supabase", "migrations", "0035_ticket_remarks.sql"), "utf8"));
  console.log("done");
  const { rows } = await client.query("select count(*)::int n from public.ticket_remarks");
  console.log(`✅ ticket_remarks table ready (rows: ${rows[0].n}).`);
} finally { await client.end(); }
