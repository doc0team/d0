/** @typedef {{ file: string; baseUrl: string; docId?: string; maxPages?: number; external?: boolean; revision?: string }} IndexJob */

const INDEX_FILE_RE = /^[a-zA-Z0-9._-]+\.json$/;

function defaultBlobFileFromBaseUrl(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname.replace(/^www\./, "");
    const slug = host.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/^-+|-+$/g, "") || "docs";
    return `${slug}-v1.json`;
  } catch {
    return "docs-v1.json";
  }
}

function parseBool(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/** @param {{ legacyStripeOnly?: boolean }} [opts] */
function defaultMaxPages(opts = {}) {
  const env = process.env.INDEX_MAX_PAGES?.trim();
  if (env) {
    const n = Number.parseInt(env, 10);
    return Number.isFinite(n) ? n : 500;
  }
  return opts.legacyStripeOnly ? 150 : 500;
}

/**
 * Resolve rebuild targets from env (same rules as cron-rebuild).
 * @returns {IndexJob[]}
 */
export function resolveIndexJobsFromEnv() {
  const rawJobs = process.env.INDEX_JOBS?.replace(/^\uFEFF/, "").trim();
  if (rawJobs) {
    let parsed;
    try {
      parsed = JSON.parse(rawJobs);
    } catch (e) {
      throw new Error(`INDEX_JOBS must be valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("INDEX_JOBS must be a non-empty JSON array");
    }
    const jobs = [];
    for (const j of parsed) {
      if (!j || typeof j !== "object") throw new Error("INDEX_JOBS: each entry must be an object");
      const baseUrl = String(j.baseUrl ?? "").trim();
      if (!baseUrl) throw new Error("INDEX_JOBS: each entry needs baseUrl");
      const file = String(j.file ?? j.blobFile ?? "").trim() || defaultBlobFileFromBaseUrl(baseUrl);
      if (!INDEX_FILE_RE.test(file)) throw new Error(`INDEX_JOBS: invalid file name: ${file}`);
      jobs.push({
        file,
        baseUrl,
        docId: j.docId != null && String(j.docId).trim() ? String(j.docId).trim() : undefined,
        maxPages:
          j.maxPages != null && Number.isFinite(Number(j.maxPages))
            ? Number(j.maxPages)
            : defaultMaxPages({ legacyStripeOnly: false }),
        external: parseBool(j.external),
        revision: j.revision != null && String(j.revision).trim() ? String(j.revision).trim() : undefined,
      });
    }
    return jobs;
  }

  const base =
    process.env.INDEX_BASE_URL?.trim() ||
    process.env.INDEX_STRIPE_BASE_URL?.trim() ||
    "";
  if (!base) return [];

  const legacyStripe = Boolean(process.env.INDEX_STRIPE_BASE_URL?.trim());
  const file =
    process.env.INDEX_BLOB_FILE?.trim() ||
    (legacyStripe ? "stripe-v1.json" : defaultBlobFileFromBaseUrl(base));
  if (!INDEX_FILE_RE.test(file)) {
    throw new Error(`INDEX_BLOB_FILE must match ${INDEX_FILE_RE}: got ${file}`);
  }

  const maxPages = defaultMaxPages({ legacyStripeOnly: legacyStripe });
  const external = parseBool(process.env.INDEX_EXTERNAL);

  return [
    {
      file,
      baseUrl: base,
      docId:
        process.env.INDEX_DOC_ID?.trim() ||
        (legacyStripe ? "stripe" : undefined),
      maxPages,
      external,
      revision: process.env.INDEX_REVISION?.trim() || undefined,
    },
  ];
}
