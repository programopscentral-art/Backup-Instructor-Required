import crypto from "node:crypto";

/**
 * Constant-time check of the `x-zoho-secret` header against ZOHO_WEBHOOK_SECRET.
 * Fails CLOSED when the env var is unset, and avoids the byte-by-byte timing
 * leak of a plain `!==` compare.
 */
export function zohoSecretOk(req: Request): boolean {
  const expected = process.env.ZOHO_WEBHOOK_SECRET;
  if (!expected) return false;
  const got = req.headers.get("x-zoho-secret") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // timingSafeEqual requires equal lengths; compare against a fixed-length hash
  // so mismatched lengths don't early-return (and don't leak the length).
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Escape LIKE/ILIKE wildcards so user input matches literally, not as a pattern. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
