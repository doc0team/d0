# reg.document0.com — hosted doc search indexes

Small Vercel project: **rebuild** remote search JSON with the `d0` crawler, store it in **Vercel Blob**, and serve **`/indexes/*`** (same paths the d0 client expects under `registryIndexBaseUrl`).

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
   - Optional: `INDEX_STRIPE_BASE_URL` (default `https://docs.stripe.com`), `INDEX_MAX_PAGES` (default `150`).

5. Assign domain **reg.document0.com** to the deployment.

## Manual rebuild (before first cron)

```text
GET https://reg.document0.com/api/cron-rebuild?secret=YOUR_CRON_SECRET
```

## Updating the index in the wild

1. Rebuild is automatic on the **weekly cron** (Sunday 07:00 UTC, see `vercel.json`), or trigger manually as above.
2. Bump **`searchIndexRevision`** on the Stripe entry when you want clients to **drop disk cache** (`~/.d0/remote-search-index/`): in d0 `registry-client.ts` builtin, or in `~/.d0/docs-registry.json`, or your live global registry payload.

## Local smoke test

From repo root:

```bash
npm run build
cd reg-document0 && npm ci && npx vercel dev
```

With `BLOB_READ_WRITE_TOKEN` and `CRON_SECRET` in `.env.local`, open `http://localhost:3000/api/cron-rebuild?secret=YOUR_SECRET`, then `http://localhost:3000/indexes/stripe-v1.json`.
