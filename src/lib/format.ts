/** India Standard Time — the product's single display timezone. */
export const IST_TZ = "Asia/Kolkata";

/**
 * Format a timestamp in IST for display. Server components render on Vercel
 * (UTC), so without an explicit timeZone every server-rendered time is 5½h off.
 */
export function fmtIST(d: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: IST_TZ,
    ...opts,
  });
}
