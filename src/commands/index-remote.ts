import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import MiniSearch from "minisearch";
import { pathKeyForPageUrl } from "../core/ingest-url.js";
import { buildRemoteIndexPayload } from "../core/remote-search-index.js";
import type { SearchDocument } from "../core/search-engine.js";
import { REMOTE_SEARCH_INDEX_MINI_OPTIONS } from "../core/search-engine.js";
import { isUrlLike, listDocUrls, readDocUrl } from "../core/web-docs.js";

function stripBody(md: string, max = 12_000): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]!);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

function defaultDocIdFromUrl(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.replace(/^www\./, "");
    const first = host.split(".")[0];
    return first && first.length > 1 ? first : "docs";
  } catch {
    return "docs";
  }
}

export type BuildRemoteIndexJsonOpts = {
  baseUrl: string;
  maxPages?: number;
  external?: boolean;
  docId?: string;
  revision?: string;
};

/** Build `d0-remote-search-index-v1` JSON in memory (for workers / Vercel Blob upload). */
export async function buildRemoteIndexJson(opts: BuildRemoteIndexJsonOpts): Promise<{ json: string; pageCount: number }> {
  const baseUrl = opts.baseUrl.trim();
  if (!isUrlLike(baseUrl)) {
    throw new Error(`buildRemoteIndexJson: invalid URL: ${baseUrl}`);
  }
  const listOpts = { llmsIncludeExternal: opts.external === true };
  const maxPages = opts.maxPages ?? 500;
  const urls = await listDocUrls(baseUrl, listOpts);
  const canonicalByPath = new Map<string, string>();
  for (const url of urls) {
    const key = pathKeyForPageUrl(url);
    const prev = canonicalByPath.get(key);
    if (!prev || url < prev) canonicalByPath.set(key, url);
  }
  const canonicalSorted = [...canonicalByPath.values()].sort();
  const limited =
    maxPages <= 0 ? canonicalSorted : canonicalSorted.slice(0, Math.min(maxPages, canonicalSorted.length));

  const docs: SearchDocument[] = [];
  await mapWithConcurrency(limited, 6, async (url) => {
    try {
      const page = await readDocUrl(url);
      const pathKey = pathKeyForPageUrl(page.url);
      docs.push({
        id: pathKey,
        slug: pathKey.replace(/^\//, ""),
        title: page.title,
        body: stripBody(page.markdown),
        url: page.url,
      });
    } catch {
      /* skip */
    }
  });

  const mini = new MiniSearch<SearchDocument>({
    fields: [...REMOTE_SEARCH_INDEX_MINI_OPTIONS.fields],
    storeFields: [...REMOTE_SEARCH_INDEX_MINI_OPTIONS.storeFields],
    searchOptions: {
      boost: { ...REMOTE_SEARCH_INDEX_MINI_OPTIONS.searchOptions.boost },
      fuzzy: REMOTE_SEARCH_INDEX_MINI_OPTIONS.searchOptions.fuzzy,
      prefix: REMOTE_SEARCH_INDEX_MINI_OPTIONS.searchOptions.prefix,
    },
  });
  mini.addAll(docs);

  const docId = opts.docId?.trim() || defaultDocIdFromUrl(baseUrl);
  const revision =
    opts.revision?.trim() || new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const displayBase = baseUrl.replace(/\/+$/, "") || baseUrl;
  const payload = buildRemoteIndexPayload(docId, displayBase, revision, mini);
  return { json: JSON.stringify(payload), pageCount: docs.length };
}

export async function cmdIndexBuildUrl(
  baseUrl: string,
  opts: { out: string; maxPages?: number; external?: boolean; docId?: string; revision?: string },
): Promise<void> {
  if (!isUrlLike(baseUrl)) {
    console.error(`d0 index build-url: invalid URL: ${baseUrl}`);
    process.exitCode = 1;
    return;
  }
  try {
    const { json, pageCount } = await buildRemoteIndexJson({
      baseUrl,
      maxPages: opts.maxPages,
      external: opts.external,
      docId: opts.docId,
      revision: opts.revision,
    });
    const outPath = path.resolve(opts.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, json, "utf8");
    console.log(`Wrote remote search index (${pageCount} pages) to ${outPath}`);
  } catch (e) {
    console.error(`d0 index build-url: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
