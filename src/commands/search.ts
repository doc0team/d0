import { findInstalledBundle } from "../core/storage.js";
import { loadBundle } from "../core/bundle.js";
import { buildIndex, searchIndex } from "../core/search-engine.js";
import type { D0Config } from "../core/config.js";
import { resolveOutputMode } from "../utils/output.js";
import { isUrlLike, searchDocUrls, type ListDocUrlsOptions } from "../core/web-docs.js";

export async function cmdSearch(
  pkg: string,
  queryParts: string[],
  opts: { json?: boolean; raw?: boolean },
  config: D0Config,
): Promise<void> {
  const query = queryParts.join(" ").trim();
  if (!query) {
    console.error("Usage: d0 <pkg> search <query>");
    process.exitCode = 1;
    return;
  }
  const ref = await findInstalledBundle(pkg);
  if (!ref) {
    console.error(`d0: bundle not installed: ${pkg}`);
    process.exitCode = 1;
    return;
  }
  const bundle = await loadBundle(ref.root);
  const mini = await buildIndex(bundle);
  const hits = searchIndex(mini, query);
  const mode = resolveOutputMode(config, opts);

  if (mode === "json") {
    console.log(JSON.stringify({ bundle: bundle.manifest.name, query, hits }, null, 2));
    return;
  }

  if (!hits.length) {
    console.log("No results.");
    return;
  }
  for (const h of hits) {
    console.log(`${h.slug}\n  ${h.title}\n  ${h.snippet}\n`);
  }
}

export async function cmdSearchUrl(
  target: string,
  queryParts: string[],
  opts: { json?: boolean; raw?: boolean; external?: boolean },
  config: D0Config,
): Promise<void> {
  if (!isUrlLike(target)) {
    console.error(`d0 search: invalid URL target: ${target}`);
    process.exitCode = 1;
    return;
  }
  const query = queryParts.join(" ").trim();
  if (!query) {
    console.error("Usage: d0 search <url> <query>");
    process.exitCode = 1;
    return;
  }
  const mode = resolveOutputMode(config, opts);
  const listOpts: ListDocUrlsOptions | undefined = opts.external ? { llmsIncludeExternal: true } : undefined;
  try {
    const hits = await searchDocUrls(target, query, listOpts);
    if (mode === "json") {
      console.log(JSON.stringify({ target, query, hits }, null, 2));
      return;
    }
    if (!hits.length) {
      console.log("No results.");
      return;
    }
    for (const h of hits) {
      console.log(`${h.url}\n  ${h.title}\n  ${h.snippet}\n`);
    }
  } catch (e) {
    console.error(`d0 search: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
