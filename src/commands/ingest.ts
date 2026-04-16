import type { D0Config } from "../core/config.js";
import { ingestBundleToDocStore } from "../core/ingest-bundle.js";
import { ingestUrlToDocStore, type IngestUrlOptions } from "../core/ingest-url.js";
import { findInstalledBundle } from "../core/storage.js";
import { isUrlLike } from "../core/web-docs.js";

export async function cmdIngestUrl(
  url: string,
  opts: { external?: boolean; maxPages?: number; json?: boolean },
  _config: D0Config,
): Promise<void> {
  if (!isUrlLike(url)) {
    console.error(`d0 ingest url: invalid URL: ${url}`);
    process.exitCode = 1;
    return;
  }
  const ingestOpts: IngestUrlOptions = {
    llmsIncludeExternal: opts.external === true,
    maxPages: opts.maxPages,
  };
  try {
    const manifest = await ingestUrlToDocStore(url, ingestOpts);
    if (opts.json) {
      console.log(JSON.stringify({ storeId: manifest.storeId, pages: Object.keys(manifest.pages).length }, null, 2));
      return;
    }
    console.log(`Ingested URL docs into store: ${manifest.storeId}`);
    console.log(`Pages: ${Object.keys(manifest.pages).length}`);
    console.log(`Manifest: ~/.d0/docs-store/${manifest.storeId}/manifest.json`);
  } catch (e) {
    console.error(`d0 ingest url: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

export async function cmdIngestBundle(
  bundle: string,
  opts: { json?: boolean },
  _config: D0Config,
): Promise<void> {
  const ref = await findInstalledBundle(bundle);
  if (!ref) {
    console.error(`d0 ingest bundle: bundle not installed: ${bundle}`);
    process.exitCode = 1;
    return;
  }
  try {
    const manifest = await ingestBundleToDocStore(ref.root);
    if (opts.json) {
      console.log(JSON.stringify({ storeId: manifest.storeId, pages: Object.keys(manifest.pages).length }, null, 2));
      return;
    }
    console.log(`Ingested bundle docs into store: ${manifest.storeId}`);
    console.log(`Pages: ${Object.keys(manifest.pages).length}`);
    console.log(`Manifest: ~/.d0/docs-store/${manifest.storeId}/manifest.json`);
  } catch (e) {
    console.error(`d0 ingest bundle: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
