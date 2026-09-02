// Product → Zoho: mirror the ticket's lifecycle back onto the origin Creator
// record's "Ticket Status" field. Best-effort — never throws into the caller,
// and no-ops cleanly until the OAuth env vars are configured (see
// ZOHO_ARCHITECTURE.md).
//
// Ticket_Status choices (radio): Yet To Pick · In Progress · Resolved · Re-open · Discard
//   assign  → In Progress   (a backup is being lined up)
//   confirm → Resolved      (arranged & dispatched — closed, online or offline)
//   cancel  → Discard       (request dropped)

interface ZohoEnv {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accountsDomain: string;
  apiDomain: string;
  owner: string;
  app: string;
  report: string;
  statusField: string;
}

/** The Ticket_Status values we write, overridable by env if the form ever renames them. */
export const ZOHO_STATUS = {
  inProgress: process.env.ZOHO_STATUS_INPROGRESS || "In Progress",
  resolved: process.env.ZOHO_STATUS_RESOLVED || "Resolved",
  discard: process.env.ZOHO_STATUS_DISCARD || "Discard",
  reopen: process.env.ZOHO_STATUS_REOPEN || "Re-open",
};

function zohoEnv(): ZohoEnv | null {
  const clientId = process.env.ZOHO_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ZOHO_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null; // not configured → no-op
  return {
    clientId,
    clientSecret,
    refreshToken,
    accountsDomain: process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.in",
    apiDomain: process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.in",
    owner: process.env.ZOHO_APP_OWNER || "nxtwave",
    app: process.env.ZOHO_APP_NAME || "niat",
    // The records live in the "All_Campus_Program_Operations_Tracker" report
    // (verified via the Creator API). Override with ZOHO_REPORT_NAME if it changes.
    report: process.env.ZOHO_REPORT_NAME || "All_Campus_Program_Operations_Tracker",
    statusField: process.env.ZOHO_STATUS_FIELD || "Ticket_Status",
  };
}

/** Exchange the long-lived refresh token for a short-lived access token. */
async function accessToken(env: ZohoEnv): Promise<string | null> {
  const url =
    `${env.accountsDomain}/oauth/v2/token?refresh_token=${encodeURIComponent(env.refreshToken)}` +
    `&client_id=${encodeURIComponent(env.clientId)}&client_secret=${encodeURIComponent(env.clientSecret)}` +
    `&grant_type=refresh_token`;
  const res = await fetch(url, { method: "POST" });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string };
  return json.access_token ?? null;
}

/**
 * Set the Zoho Creator record's Ticket_Status field to `statusValue`.
 * Returns a small result object; callers should not block on failure.
 */
export async function setZohoStatus(
  zohoRecordId: string | null | undefined,
  statusValue: string,
): Promise<{ ok: boolean; detail: string }> {
  const env = zohoEnv();
  if (!env) return { ok: false, detail: "zoho oauth not configured" };
  if (!zohoRecordId) return { ok: false, detail: "no zoho_record_id" };
  try {
    const token = await accessToken(env);
    if (!token) return { ok: false, detail: "could not obtain access token" };
    const url = `${env.apiDomain}/creator/v2.1/data/${env.owner}/${env.app}/report/${env.report}/${zohoRecordId}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: { [env.statusField]: statusValue } }),
    });
    const json = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    // Creator returns code 3000 on a successful update.
    const ok = res.ok && (json.code === 3000 || json.code === undefined);
    return { ok, detail: JSON.stringify(json).slice(0, 300) };
  } catch (e) {
    return { ok: false, detail: String(e).slice(0, 300) };
  }
}
