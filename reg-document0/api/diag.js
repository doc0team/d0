import { list } from "@vercel/blob";
import { cronAuthorized } from "./_cron-auth.js";
import { VERCEL_CRONS } from "./_lib/cron-meta.js";
import { resolveIndexJobsFromEnv } from "./_lib/index-jobs.js";
import { requestUrl } from "./_lib/request-url.js";

/**
 * GET /api/diag?secret=… — same auth as cron-rebuild.
 * Read-only: env sanity, resolved index jobs, Vercel cron meta, blob list (no crawl).
 */
export default async function handler(req) {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = requestUrl(req);
  if (!cronAuthorized(req, url)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  const hasCronSecret = Boolean(process.env.CRON_SECRET?.trim());
  const indexJobsRaw = process.env.INDEX_JOBS?.replace(/^\uFEFF/, "").trim() ?? "";
  const indexBaseUrl = process.env.INDEX_BASE_URL?.trim() || process.env.INDEX_STRIPE_BASE_URL?.trim() || "";

  let indexJobsParse = /** @type {{ ok: true; length: number; note?: string } | { ok: false; message: string }} */ ({
    ok: false,
    message: "No INDEX_JOBS and no INDEX_BASE_URL / INDEX_STRIPE_BASE_URL",
  });
  if (indexJobsRaw) {
    try {
      const parsed = JSON.parse(indexJobsRaw);
      if (!Array.isArray(parsed)) {
        indexJobsParse = { ok: false, message: "INDEX_JOBS is not a JSON array" };
      } else {
        indexJobsParse = { ok: true, length: parsed.length };
      }
    } catch (e) {
      indexJobsParse = {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  } else if (indexBaseUrl) {
    indexJobsParse = { ok: true, length: 1, note: "single-site from INDEX_BASE_URL / INDEX_STRIPE_BASE_URL" };
  }

  let resolvedJobs = /** @type {{ ok: true; jobs: object[] } | { ok: false; message: string }} */ ({
    ok: false,
    message: "",
  });
  try {
    const jobs = resolveIndexJobsFromEnv();
    resolvedJobs = { ok: true, jobs };
  } catch (e) {
    resolvedJobs = {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }

  let listResult = /** @type {{ ok: true; blobs: { pathname: string; url: string; size: number; uploadedAt: string }[]; hasMore: boolean } | { ok: false; message: string }} */ ({
    ok: false,
    message: "skipped",
  });
  if (hasBlobToken) {
    try {
      const r = await list({ prefix: "indexes/", limit: 100 });
      const blobs = Array.isArray(r.blobs) ? r.blobs : [];
      listResult = {
        ok: true,
        blobs: blobs.map((b) => ({
          pathname: b.pathname,
          url: b.url,
          size: b.size,
          uploadedAt: b.uploadedAt instanceof Date ? b.uploadedAt.toISOString() : String(b.uploadedAt),
        })),
        hasMore: r.hasMore,
      };
    } catch (e) {
      listResult = {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  } else {
    listResult = {
      ok: false,
      message: "BLOB_READ_WRITE_TOKEN missing — link Blob store to this project or set the env var",
    };
  }

  return Response.json({
    hasBlobToken,
    hasCronSecret,
    indexJobsCharLength: indexJobsRaw.length,
    indexJobsParse,
    indexBaseUrlSet: Boolean(indexBaseUrl),
    resolvedJobs,
    vercelCrons: VERCEL_CRONS,
    listResult,
    hint: "If listResult.blobs is empty, run Rebuild on the dashboard or GET /api/cron-rebuild?secret=…",
  });
}
