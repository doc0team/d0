import type { ListDocUrlsOptions } from "./web-docs.js";
import { listDocUrls, readDocUrl, resolveBrowseBaseUrl } from "./web-docs.js";
import { normalizeDocMarkdown } from "./doc-normalize.js";
import {
  type DocNode,
  type DocPageRecord,
  type DocStoreManifest,
  storeIdForUrl,
  writeDocStoreManifest,
  writeDocStorePage,
} from "./doc-store.js";
import { buildPathTrie, type PathTrieNode } from "../tui/url-nav-tree.js";

export type IngestUrlOptions = ListDocUrlsOptions & {
  maxPages?: number;
};

function pageIdFromUrl(url: string): string {
  const h = Buffer.from(url).toString("base64url").slice(0, 24);
  return `p_${h}`;
}

function pathKeyForPageUrl(url: string): string {
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
  const maxPages = opts?.maxPages ?? 200;
  const origin = resolveBrowseBaseUrl(baseUrl).origin;
  const urls = await listDocUrls(baseUrl, opts);
  const limited = [...new Set(urls)].sort().slice(0, maxPages);

  const pages: Record<string, DocPageRecord> = {};
  const storeId = storeIdForUrl(baseUrl);

  const canonicalByPath = new Map<string, string>();
  for (const url of limited) {
    const key = pathKeyForPageUrl(url);
    const prev = canonicalByPath.get(key);
    if (!prev || url < prev) canonicalByPath.set(key, url);
  }
  const canonicalUrls = [...canonicalByPath.values()].sort();

  await mapWithConcurrency(canonicalUrls, 4, async (url) => {
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
