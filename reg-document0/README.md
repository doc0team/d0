# reg.document0.com — hosted doc search indexes

Small Vercel project: **rebuild** remote search JSON with the `d0` crawler (any docs URL the CLI supports), store each file in **Vercel Blob**, and serve **`/indexes/*`** (same paths registry entries use with `searchIndexPath` under `registryIndexBaseUrl`).

No large JSON is committed to the d0 git repo.

## Vercel setup

1. Create a **Blob** store on the Vercel team; link it to this project so `BLOB_READ_WRITE_TOKEN` is available.
2. Connect this GitHub repo; set **Root Directory** to `reg-document0`.
3. **Install Command** (parent package must build `d0/dist` first):

   ```bash
   cd .. && npm ci && npm run build && cd reg-document0 && npm ci
   ```

4. **Environment variables**
   - `CRON_SECRET` — long random string; cron and manual rebuild must send `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`.
   - **Index targets** (pick one style):
     - **`INDEX_JOBS`** — JSON array of sites to crawl in one cron run. Each object:
       - **`baseUrl`** (required) — doc root, e.g. `https://docs.stripe.com`
       - **`file`** (optional) — blob filename under `indexes/`, e.g. `stripe-v1.json`. If omitted, derived from the hostname (e.g. `docs.stripe.com-v1.json`).
       - **`docId`**, **`maxPages`**, **`external`**, **`revision`** — same meaning as `d0 index build-url` / `buildRemoteIndexJson`.
     - **Single site:** `INDEX_BASE_URL` plus optional `INDEX_BLOB_FILE`, `INDEX_DOC_ID`, `INDEX_MAX_PAGES`, `INDEX_EXTERNAL` (`1`/`true`), `INDEX_REVISION`. If `INDEX_BLOB_FILE` is omitted, the filename is derived from the URL host (safe slug + `-v1.json`).
     - **Legacy Stripe-only:** `INDEX_STRIPE_BASE_URL` (optional) defaults file to `stripe-v1.json` and `docId` to `stripe`; default `maxPages` is **150** when `INDEX_MAX_PAGES` is unset (other modes default to 500).
   - Global optional: `INDEX_MAX_PAGES` applies when a job does not set `maxPages` (and overrides legacy Stripe default when set).

5. Assign domain **reg.document0.com** to the deployment.

### Example `INDEX_JOBS` (compact one line)

```json
[{"file":"stripe-v1.json","baseUrl":"https://docs.stripe.com","docId":"stripe","maxPages":150},{"file":"vercel-com-docs-v1.json","baseUrl":"https://vercel.com/docs","maxPages":200}]
```

Registry entries then set `searchIndexPath` to `indexes/stripe-v1.json`, `indexes/vercel-com-docs-v1.json`, etc.

## Manual rebuild (before first cron)

```text
GET https://reg.document0.com/api/cron-rebuild?secret=YOUR_CRON_SECRET
```

Response JSON lists each job (`pathname`, `blobUrl`, `serveUrl`, `pageCount`, `bytes`, or `message` on failure). HTTP **500** if any job failed (others may still have been written).

### Nothing in Blob / 404 on `/indexes/…`

1. **Trigger a rebuild** — indexes are only written when `/api/cron-rebuild` succeeds (cron or manual). Opening `/indexes/…` alone does nothing.
2. **Diagnostics** (same secret as cron):

   ```text
   GET https://YOUR_DEPLOYMENT/api/diag?secret=YOUR_CRON_SECRET
   ```

   Check `hasBlobToken`, `hasCronSecret`, `indexJobsParse`, and `listResult.pathnames`. If `listResult` errors, the token is wrong or the Blob store is not linked to **this** Vercel project (Storage → connect store, or paste `BLOB_READ_WRITE_TOKEN` from the store into project env).
3. **Function logs** (Vercel → project → Logs) for `/api/cron-rebuild`: look for import errors, timeouts (increase `maxPages` carefully), or crawl failures in `jobs[].message`.
4. **`INDEX_JOBS` must be strict JSON** — one line, straight double quotes `"`, no trailing commas. A UTF-8 BOM at the start of the value breaks parse; re-paste or strip BOM.

## Updating the index in the wild

1. Rebuild is automatic on the **weekly cron** (Sunday 07:00 UTC, see `vercel.json`), or trigger manually as above.
2. Bump **`searchIndexRevision`** on the matching registry entry when you want clients to **drop disk cache** (`~/.d0/remote-search-index/`): builtin registry, `~/.d0/docs-registry.json`, or your live global registry payload.

## Local smoke test

From repo root:

```bash
npm run build
cd reg-document0 && npm ci && npx vercel dev
```

With `BLOB_READ_WRITE_TOKEN` and `CRON_SECRET` in `.env.local`, set `INDEX_BASE_URL` (or `INDEX_JOBS`) in `.env.local`, then open `http://localhost:3000/api/cron-rebuild?secret=YOUR_SECRET`, then `http://localhost:3000/indexes/<your-file>.json`.
