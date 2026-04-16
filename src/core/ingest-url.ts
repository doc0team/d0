import { createHash } from "node:crypto";
import type { ListDocUrlsOptions, WebDocPage } from "./web-docs.js";
import { listDocUrls, readDocUrl, resolveBrowseBaseUrl } from "./web-docs.js";
import { normalizeDocMarkdown } from "./doc-normalize.js";
import {
  type DocNode,
  type DocPageRecord,
  type DocStoreManifest,
  readDocStoreManifest,
  storeIdForUrl,
  writeDocStoreManifest,
  writeDocStorePage,
} from "./doc-store.js";
import { buildPathTrie, type PathTrieNode } from "../tui/url-nav-tree.js";

export type IngestUrlOptions = ListDocUrlsOptions & {
  /** Max pages to ingest after discovery dedupe. 0 = all discovered URLs. Default: D0_INGEST_MAX_PAGES or 50_000. */
  maxPages?: number;
};

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Allows 0 to mean "no cap" (ingest every URL returned by discovery). */
function envNonNegativeIntAllowZeroUnlimited(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const DEFAULT_INGEST_MAX_PAGES = envNonNegativeIntAllowZeroUnlimited("D0_INGEST_MAX_PAGES", 50_000);
const INGEST_FETCH_CONCURRENCY = envPositiveInt("D0_INGEST_FETCH_CONCURRENCY", 8);

function pageIdFromUrl(url: string): string {
  /** Full-length hash — truncated base64url caused collisions (many pages → one .md file). */
  const h = createHash("sha256").update(url).digest("hex");
  return `p_${h}`;
}

/** Path key used in `DocStoreManifest.pages` for a page URL (pathname + optional search). */
export function pathKeyForPageUrl(url: string): string {
  try {
    const u = new URL(url);
    let p = u.pathname || "/";
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    const base = p || "/";
    return u.search ? `${base}${u.search}` : base;
  } catch {
    return url;
  }
}

function trieToDocNodes(node: PathTrieNode, pages: Record<string, DocPageRecord>): DocNode[] {
  const children: DocNode[] = [];
  const dirKeys = [...node.children.keys()].sort((a, b) => a.localeCompare(b));
  for (const key of dirKeys) {
    const child = node.children.get(key)!;
    const childPages: DocNode[] = trieToDocNodes(child, pages);
    const pageRef = pages[child.pathKey]?.path;
    children.push({
      id: child.pathKey.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "root",
      title: child.segment || "/",
      path: child.pathKey || "/",
      content: "",
      children: childPages,
      pageRef,
    });
  }
  return children.sort((a, b) => a.path.localeCompare(b.path));
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

export async function ingestUrlToDocStore(baseUrl: string, opts?: IngestUrlOptions): Promise<DocStoreManifest> {
  const configuredMax = opts?.maxPages !== undefined ? opts.maxPages : DEFAULT_INGEST_MAX_PAGES;
  const origin = resolveBrowseBaseUrl(baseUrl).origin;
  const urls = await listDocUrls(baseUrl, opts);

  const pages: Record<string, DocPageRecord> = {};
  const storeId = storeIdForUrl(baseUrl);

  const canonicalByPath = new Map<string, string>();
  for (const url of urls) {
    const key = pathKeyForPageUrl(url);
    const prev = canonicalByPath.get(key);
    if (!prev || url < prev) canonicalByPath.set(key, url);
  }
  const canonicalUrlsSorted = [...canonicalByPath.values()].sort();
  const maxPages =
    configuredMax <= 0 ? canonicalUrlsSorted.length : Math.min(configuredMax, canonicalUrlsSorted.length);
  const limited = canonicalUrlsSorted.slice(0, maxPages);

  await mapWithConcurrency(limited, INGEST_FETCH_CONCURRENCY, async (url) => {
    const page = await readDocUrl(url);
    const norm = normalizeDocMarkdown(page.markdown);
    const pathKey = pathKeyForPageUrl(page.url);
    const id = pageIdFromUrl(page.url);
    const relPath = `pages/${id}.md`;
    await writeDocStorePage(storeId, relPath, norm.markdown);
    pages[pathKey] = {
      path: pathKey,
      title: page.title,
      url: page.url,
      relPath,
      codeBlocks: norm.codeBlocks.map((b) => ({ id: b.id, lang: b.lang, code: b.code })),
    };
  });

  const trie = buildPathTrie(limited, origin);
  const rootChildren = trieToDocNodes(trie, pages);
  const tree: DocNode = {
    id: "root",
    title: "root",
    path: "/",
    content: "",
    children: rootChildren,
  };

  const manifest: DocStoreManifest = {
    version: 1,
    storeId,
    sourceType: "url",
    source: baseUrl,
    ingestedAt: new Date().toISOString(),
    tree,
    pages,
  };
  await writeDocStoreManifest(manifest);
  return manifest;
}

/**
 * Merge one fetched page into the URL doc store: writes markdown, updates `pages`, rebuilds the
 * navigation tree from the current discovery URL set (same shape as full ingest).
 */
export async function mergeWebDocPageIntoUrlDocStore(
  baseUrl: string,
  page: WebDocPage,
  opts?: ListDocUrlsOptions,
): Promise<void> {
  const storeId = storeIdForUrl(baseUrl);
  const origin = resolveBrowseBaseUrl(baseUrl).origin;
  const urls = await listDocUrls(baseUrl, opts);
  const canonicalByPath = new Map<string, string>();
  for (const url of urls) {
    const key = pathKeyForPageUrl(url);
    const prev = canonicalByPath.get(key);
    if (!prev || url < prev) canonicalByPath.set(key, url);
  }
  const canonicalUrlsSorted = [...canonicalByPath.values()].sort();

  const norm = normalizeDocMarkdown(page.markdown);
  const pathKey = pathKeyForPageUrl(page.url);
  const id = pageIdFromUrl(page.url);
  const relPath = `pages/${id}.md`;
  await writeDocStorePage(storeId, relPath, norm.markdown);
  const record: DocPageRecord = {
    path: pathKey,
    title: page.title,
    url: page.url,
    relPath,
    codeBlocks: norm.codeBlocks.map((b) => ({ id: b.id, lang: b.lang, code: b.code })),
  };

  const existing = await readDocStoreManifest(storeId);
  const pages: Record<string, DocPageRecord> = { ...(existing?.pages ?? {}), [pathKey]: record };

  const trie = buildPathTrie(canonicalUrlsSorted, origin);
  const rootChildren = trieToDocNodes(trie, pages);
  const tree: DocNode = {
    id: "root",
    title: "root",
    path: "/",
    content: "",
    children: rootChildren,
  };

  const manifest: DocStoreManifest = {
    version: 1,
    storeId,
    sourceType: "url",
    source: baseUrl,
    ingestedAt: new Date().toISOString(),
    tree,
    pages,
  };
  await writeDocStoreManifest(manifest);
}
