import { put } from "@vercel/blob";
import { buildRemoteIndexJson } from "d0/build-remote-index";

function authorize(req, url) {
  const bearer = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (bearer === `Bearer ${secret}`) return true;
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

/**
 * Cron (GET) or manual rebuild: crawl Stripe docs, write indexes/stripe-v1.json to Vercel Blob.
 * Set env: CRON_SECRET, BLOB_READ_WRITE_TOKEN (Vercel Blob store), optional INDEX_STRIPE_BASE_URL, INDEX_MAX_PAGES.
 */
export default async function handler(req) {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(req.url);
  if (!authorize(req, url)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const base = process.env.INDEX_STRIPE_BASE_URL?.trim() || "https://docs.stripe.com";
  const maxPages = Number.parseInt(process.env.INDEX_MAX_PAGES ?? "150", 10);

  const { json, pageCount } = await buildRemoteIndexJson({
    baseUrl: base,
    maxPages: Number.isFinite(maxPages) ? maxPages : 150,
    docId: "stripe",
  });

  await put("indexes/stripe-v1.json", json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });

  return Response.json({
    ok: true,
    pathname: "indexes/stripe-v1.json",
    pageCount,
    bytes: json.length,
  });
}
