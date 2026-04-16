/**
 * Build a URL from a Fetch API Request. Vercel Cron (and some runtimes) set `req.url` to a
 * path + query only (e.g. `/api/cron-rebuild`), which is invalid for `new URL()` without a base.
 *
 * @param {Request} req
 * @returns {URL}
 */
export function requestUrl(req) {
  const raw = typeof req.url === "string" ? req.url : String(req.url ?? "");
  if (/^https?:\/\//i.test(raw)) {
    return new URL(raw);
  }
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim() ||
    "localhost";
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return new URL(raw, `${proto}://${host}`);
}
