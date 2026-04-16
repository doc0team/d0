import { get } from "@vercel/blob";

/**
 * GET /indexes/<file>.json → rewrite → ?file=<name>
 * Serves blob at pathname indexes/<file> from the linked Vercel Blob store.
 */
export default async function handler(req) {
  const url = new URL(req.url);
  const file = url.searchParams.get("file");
  if (!file || file.includes("..") || file.includes("/") || !/^[a-zA-Z0-9._-]+\.json$/.test(file)) {
    return new Response("Bad request", { status: 400 });
  }
  const pathname = `indexes/${file}`;
  let result;
  try {
    result = await get(pathname, { access: "public" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({
        error: "blob_get_failed",
        pathname,
        message,
        hint: "Check BLOB_READ_WRITE_TOKEN and that the Blob store is linked to this Vercel project. GET /api/diag?secret=… for details.",
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
  if (!result || result.statusCode !== 200 || !result.stream) {
    return new Response(
      JSON.stringify({
        error: "index_not_built",
        pathname,
        hint: "GET /api/cron-rebuild?secret=… after configuring INDEX_JOBS or INDEX_BASE_URL, or wait for the weekly cron.",
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  const body = await new Response(result.stream).text();
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
