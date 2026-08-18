// Applies all supabase/migrations/*.sql (sorted) then supabase/seed.sql to the
// remote Supabase Postgres. Run with Node's env-file loader:
//   node --env-file=.env.local scripts/apply-db.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const REF = "takdccssaodydjrtrnwc";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) {
  console.error("Missing SUPABASE_DB_PASSWORD in env.");
  process.exit(1);
}

// Candidate connections, best first (session pooler = IPv4, ideal for DDL).
const CANDIDATES = [
  { host: "aws-0-ap-south-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { host: "aws-1-ap-south-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { host: "aws-0-ap-south-1.pooler.supabase.com", port: 6543, user: `postgres.${REF}` },
  { host: `db.${REF}.supabase.co`, port: 5432, user: "postgres" },
];

function loadSql() {
  const migDir = join(root, "supabase", "migrations");
  const files = readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const parts = files.map((f) => ({
    name: `migrations/${f}`,
    sql: readFileSync(join(migDir, f), "utf8"),
  }));
  parts.push({
    name: "seed.sql",
    sql: readFileSync(join(root, "supabase", "seed.sql"), "utf8"),
  });
  return parts;
}

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
      console.log(`✓ Connected via ${c.host}:${c.port}`);
      return client;
    } catch (e) {
      console.log(`… ${c.host}:${c.port} failed (${e.code || e.message})`);
      try { await client.end(); } catch {}
    }
  }
  throw new Error("Could not connect to the database on any candidate host.");
}

async function main() {
  const client = await connect();
  try {
    for (const part of loadSql()) {
      process.stdout.write(`Running ${part.name} … `);
      await client.query(part.sql);
      console.log("done");
    }
    const { rows } = await client.query(
      "select count(*)::int as grants from public.access_grants",
    );
    console.log(`\n✅ Schema applied. access_grants rows: ${rows[0].grants}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("\n✗ Migration failed:", e.message);
  process.exit(1);
});
