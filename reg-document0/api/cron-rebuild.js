import { put } from "@vercel/blob";
import { buildRemoteIndexJson } from "d0/build-remote-index";
import { cronAuthorized } from "./_cron-auth.js";
import { resolveIndexJobsFromEnv } from "./_lib/index-jobs.js";

/**
 * Cron (GET) or manual rebuild: crawl doc sites from env, write each JSON to Vercel Blob under indexes/<file>.
 *
 * Env: CRON_SECRET, BLOB_READ_WRITE_TOKEN. Configure targets via INDEX_JOBS (JSON array) or
 * INDEX_BASE_URL (+ INDEX_BLOB_FILE, INDEX_DOC_ID, INDEX_MAX_PAGES, INDEX_EXTERNAL, INDEX_REVISION).
 * Legacy: INDEX_STRIPE_BASE_URL defaults file to stripe-v1.json and docId to stripe.
 */
export default async function handler(req) {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(req.url);
  if (!cronAuthorized(req, url)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let jobs;
  try {
    jobs = resolveIndexJobsFromEnv();
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: "config",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 400 },
    );
  }

  if (jobs.length === 0) {
    return Response.json(
      {
        ok: false,
        error: "no_jobs",
        message:
          "Set INDEX_JOBS (JSON array) or INDEX_BASE_URL (or legacy INDEX_STRIPE_BASE_URL). See reg-document0/README.md.",
      },
      { status: 400 },
    );
  }

  const results = [];
  const errors = [];

  for (const job of jobs) {
    const pathname = `indexes/${job.file}`;
    try {
      const { json, pageCount } = await buildRemoteIndexJson({
        baseUrl: job.baseUrl,
        maxPages: job.maxPages,
        external: job.external,
        docId: job.docId,
        revision: job.revision,
      });
      const putResult = await put(pathname, json, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      results.push({
        ok: true,
        pathname,
        blobUrl: putResult.url,
        serveUrl: new URL(`/indexes/${job.file}`, url.origin).href,
        pageCount,
        bytes: json.length,
        baseUrl: job.baseUrl,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ pathname, baseUrl: job.baseUrl, message });
      results.push({ ok: false, pathname, baseUrl: job.baseUrl, message });
    }
  }

  const allOk = errors.length === 0;
  return Response.json(
    {
      ok: allOk,
      jobs: results,
      ...(errors.length ? { errors } : {}),
    },
    { status: allOk ? 200 : 500 },
  );
}
