// One-time: exchange a Zoho self-client GRANT CODE for a long-lived REFRESH TOKEN.
//
//   1) Put ZOHO_OAUTH_CLIENT_ID and ZOHO_OAUTH_CLIENT_SECRET in .env.local
//   2) Generate a grant code in api-console.zoho.in (scope ZohoCreator.report.UPDATE)
//   3) node --env-file=.env.local scripts/zoho-oauth.mjs <GRANT_CODE>
//
// Prints the refresh token — add it to .env.local + Vercel as ZOHO_OAUTH_REFRESH_TOKEN.
const code = process.argv[2];
const id = process.env.ZOHO_OAUTH_CLIENT_ID;
const secret = process.env.ZOHO_OAUTH_CLIENT_SECRET;
const accounts = process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.in";

if (!code || !id || !secret) {
  console.error("Missing input.\n- ZOHO_OAUTH_CLIENT_ID / ZOHO_OAUTH_CLIENT_SECRET must be in .env.local\n- pass the grant code as the argument");
  process.exit(1);
}

const url =
  `${accounts}/oauth/v2/token?grant_type=authorization_code` +
  `&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}` +
  `&code=${encodeURIComponent(code)}`;

const res = await fetch(url, { method: "POST" });
const j = await res.json();
console.log(JSON.stringify(j, null, 2));
if (j.refresh_token) {
  console.log("\n✅ REFRESH TOKEN (add as ZOHO_OAUTH_REFRESH_TOKEN):\n" + j.refresh_token);
} else {
  console.log("\n⚠️ No refresh_token returned — the code may have expired (10 min) or the scope was wrong. Generate a fresh code and retry.");
}
