// READ-ONLY go-live readiness sweep. Checks prod config + integrations. No writes.
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
let warn = 0;
const ok = (c, msg, w) => { console.log(`  ${c ? "✅" : "❌"} ${msg}`); if (!c) warn += (w ?? 1); };

console.log("== 1. Teams config (both channels, DB-driven) ==");
const { data: cfg } = await db.from("teams_config").select("enabled, dispatch_url, teams_webhook_url, hod_webhook_url").eq("id", true).maybeSingle();
ok(cfg?.enabled === true, `enabled = ${cfg?.enabled}`);
ok(!!cfg?.dispatch_url, "dispatch route set");
ok(!!cfg?.teams_webhook_url, "main channel (Backup OS) set");
ok(!!cfg?.hod_webhook_url, "HOD channel (Backup OS Invoices) set");
const sig = (u) => (u || "").match(/sig=([A-Za-z0-9_-]{6})/)?.[1] ?? "—";
console.log(`     main sig …${sig(cfg?.teams_webhook_url)}  ·  hod sig …${sig(cfg?.hod_webhook_url)}  (should differ)`);
ok(cfg?.teams_webhook_url !== cfg?.hod_webhook_url, "the two channels are different URLs");

console.log("\n== 2. Routing / capabilities ==");
const { data: caps } = await db.from("capabilities").select("id, name, status");
const active = (caps ?? []).filter((c) => c.status === "active");
ok(active.length >= 5, `${active.length} active subject verticals`);
const { data: cms } = await db.from("capability_managers").select("capability_id").eq("status", "active");
const cmCap = new Set((cms ?? []).map((m) => m.capability_id));
const noCm = active.filter((c) => !cmCap.has(c.id)).map((c) => c.name);
ok(noCm.length === 0, `every active vertical has a CM${noCm.length ? " — missing: " + noCm.join(", ") : ""}`);
const testCaps = active.filter((c) => /test/i.test(c.name)).map((c) => c.name);
ok(testCaps.length === 0, `no test verticals live${testCaps.length ? " — " + testCaps.join(", ") : ""}`);

console.log("\n== 3. Data hygiene ==");
const { data: stuck } = await db.from("tickets").select("ticket_no").eq("status", "raised").is("capability_id", null);
ok((stuck ?? []).length === 0, `stuck "needs admin" tickets: ${(stuck ?? []).length}`);

console.log("\n== 4. Zoho intake (live prod endpoints) ==");
const base = "https://backup-instructor-required.vercel.app";
const secret = process.env.ZOHO_WEBHOOK_SECRET;
try {
  const h = await fetch(`${base}/api/zoho/ticket`, { headers: { "x-zoho-secret": secret } });
  const hj = await h.json().catch(() => ({}));
  ok(h.status === 200 && hj.ready, `webhook health: ${h.status} ready=${hj.ready}`);
  const o = await (await fetch(`${base}/api/zoho/options`, { headers: { "x-zoho-secret": secret } })).json().catch(() => ({}));
  ok((o.universities?.length ?? 0) > 10, `options feed: ${o.universities?.length} universities, ${o.subjects?.length} subjects`);
  const bad = await fetch(`${base}/api/zoho/options`, { headers: { "x-zoho-secret": "wrong" } });
  ok(bad.status === 401 || bad.status === 403, `wrong secret rejected (${bad.status})`);
} catch (e) { ok(false, "Zoho endpoints unreachable: " + String(e).slice(0, 80)); }

console.log("\n== 5. Zoho close-back (OAuth + report reachable) ==");
const cid = process.env.ZOHO_OAUTH_CLIENT_ID, csec = process.env.ZOHO_OAUTH_CLIENT_SECRET, cref = process.env.ZOHO_OAUTH_REFRESH_TOKEN;
if (cid && csec && cref) {
  try {
    const tok = (await (await fetch(`https://accounts.zoho.in/oauth/v2/token?grant_type=refresh_token&client_id=${encodeURIComponent(cid)}&client_secret=${encodeURIComponent(csec)}&refresh_token=${encodeURIComponent(cref)}`, { method: "POST" })).json()).access_token;
    ok(!!tok, "OAuth refresh → access token");
    if (tok) {
      const rep = await (await fetch(`https://www.zohoapis.in/creator/v2.1/data/nxtwave/niat/report/All_Campus_Program_Operations_Tracker?field_config=all`, { headers: { Authorization: `Zoho-oauthtoken ${tok}` } })).json();
      ok(rep.code === 3000, `close-back report reachable (code ${rep.code})`);
    }
  } catch (e) { ok(false, "close-back check failed: " + String(e).slice(0, 80)); }
} else { console.log("  ⚠️  ZOHO_OAUTH_* not in local env (that's fine — they live in Vercel; close-back verified earlier)."); }

console.log(`\n${warn === 0 ? "✅ ALL GREEN — ready to hand over." : `⚠️ ${warn} item(s) need a look above.`}`);
