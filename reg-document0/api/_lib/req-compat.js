/**
 * Fetch `Request` uses `Headers#get`; Node `IncomingMessage` uses a plain object (Vercel cron uses the latter).
 * @param {import("node:http").IncomingMessage | Request} req
 * @param {string} name
 */
export function headerGet(req, name) {
  const key = name.toLowerCase();
  const h = req.headers;
  if (!h) return undefined;
  if (typeof h.get === "function") {
    return h.get(name) ?? h.get(key) ?? undefined;
  }
  const direct = h[key];
  if (direct !== undefined) return Array.isArray(direct) ? direct[0] : direct;
  for (const k of Object.keys(h)) {
    if (String(k).toLowerCase() === key) {
      const v = h[k];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

/**
 * Absolute URL for this request (path-only `req.url` is normal on Vercel cron).
 * @param {import("node:http").IncomingMessage | Request} req
 */
export function requestUrl(req) {
  const raw = typeof req.url === "string" ? req.url : String(req.url ?? "");
  if (/^https?:\/\//i.test(raw)) {
    return new URL(raw);
  }
  const host =
    headerGet(req, "x-forwarded-host")?.split(",")[0]?.trim() ||
    headerGet(req, "host")?.trim() ||
    "localhost";
  const proto = headerGet(req, "x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return new URL(raw, `${proto}://${host}`);
}
