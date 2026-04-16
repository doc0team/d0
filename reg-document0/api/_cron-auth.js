import { headerGet } from "./_lib/req-compat.js";

/** Shared auth for cron-rebuild and diag (same secret). */
export function cronAuthorized(req, url) {
  const bearer = headerGet(req, "authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (bearer === `Bearer ${secret}`) return true;
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}
