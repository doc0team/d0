import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findInstalledBundle } from "../core/storage.js";
import { loadBundle, listSlugs, readPageMarkdown } from "../core/bundle.js";
import { buildIndex, searchIndex } from "../core/search-engine.js";
import {
  fetchLlmsFullTxt,
  isUrlLike,
  listDocUrls,
  readDocUrl,
  searchDocUrls,
  type LlmsFullChunk,
} from "../core/web-docs.js";
import { readDocStoreManifest, readDocStorePage, storeIdForUrl } from "../core/doc-store.js";
import { listDocStoreChildren } from "../core/doc-store-nav.js";
import { mergeWebDocPageIntoUrlDocStore, pathKeyForPageUrl } from "../core/ingest-url.js";
import { ingestBundleToDocStore } from "../core/ingest-bundle.js";
import { searchDocStore } from "../core/doc-store-search.js";
import {
  listDocsRegistryEntries,
  mcpRegistryOptions,
  resolveDocsRegistryEntry,
  searchDocsRegistry,
  type DocsRegistryEntry,
} from "../core/registry-client.js";

type ListNodeItem = {
  path: string;
  title: string;
  kind: "page" | "dir";
};

/** Cap on live MCP URL grep fetches so megasites don't hang the tool. Override via D0_MCP_SEARCH_MAX_FETCH. */
function mcpLiveSearchMaxFetch(): number {
  const raw = process.env.D0_MCP_SEARCH_MAX_FETCH?.trim();
  if (!raw) return 80;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 80;
  return Math.min(n, 10_000);
}

/** Per-process cache of llms-full.txt content, keyed by registry id. */
const llmsFullCache = new Map<string, { fetchedAt: number; chunks: LlmsFullChunk[] | null; markdown: string | null }>();
const LLMS_FULL_TTL_MS = 30 * 60 * 1000;

/** Per-storeId write chain so concurrent read_docs merges don't corrupt manifest.json. */
const lazyStoreWriteChain = new Map<string, Promise<void>>();

function scheduleLazyStoreWrite(storeId: string, task: () => Promise<void>): void {
  const prev = lazyStoreWriteChain.get(storeId) ?? Promise.resolve();
  const next = prev.then(task).catch((err) => {
    console.error(`[doc0 mcp] lazy doc store write failed (${storeId}):`, err);
  });
  lazyStoreWriteChain.set(storeId, next);
}

function normalizeNodePath(input: string | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw || raw === ".") return "/";
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.replace(/\\/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function entryCard(entry: DocsRegistryEntry): Record<string, unknown> {
  return {
    id: entry.id,
    aliases: entry.aliases,
    source_type: entry.sourceType,
    source: entry.source,
    description: entry.description,
  };
}

function text(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

function makeTitleFromPath(p: string): string {
  const base = p.split("/").filter(Boolean).at(-1) ?? p;
  return base || "/";
}

function listBundleNodes(slugs: string[], nodePath: string): ListNodeItem[] {
  const prefix = nodePath === "/" ? "" : nodePath.replace(/^\//, "").replace(/\/+$/, "");
  const children = new Map<string, ListNodeItem>();
  for (const slug of slugs) {
    if (prefix) {
      if (slug === prefix) {
        children.set(slug, { path: `/${slug}`, title: makeTitleFromPath(slug), kind: "page" });
        continue;
      }
      if (!slug.startsWith(`${prefix}/`)) continue;
    }
    const remainder = prefix ? slug.slice(prefix.length + 1) : slug;
    const [head, ...rest] = remainder.split("/").filter(Boolean);
    if (!head) continue;
    const childPath = prefix ? `${prefix}/${head}` : head;
    const normalized = `/${childPath}`;
    if (rest.length === 0) {
      children.set(normalized, { path: normalized, title: head, kind: "page" });
      continue;
    }
    children.set(normalized, { path: normalized, title: head, kind: "dir" });
  }
  return [...children.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function listUrlNodes(urls: string[], nodePath: string): ListNodeItem[] {
  const children = new Map<string, ListNodeItem>();
  const prefix = nodePath === "/" ? "/" : nodePath.replace(/\/+$/, "");
  for (const raw of urls) {
    let pathname = "/";
    try {
      pathname = new URL(raw).pathname || "/";
    } catch {
      continue;
    }
    const normalizedPath = pathname.replace(/\/+$/, "") || "/";
    if (prefix !== "/" && normalizedPath !== prefix && !normalizedPath.startsWith(`${prefix}/`)) continue;

    if (prefix !== "/" && normalizedPath === prefix) {
      children.set(raw, { path: raw, title: raw, kind: "page" });
      continue;
    }
    const remainder = prefix === "/" ? normalizedPath.slice(1) : normalizedPath.slice(prefix.length + 1);
    const [head, ...rest] = remainder.split("/").filter(Boolean);
    if (!head) {
      children.set(raw, { path: raw, title: raw, kind: "page" });
      continue;
    }
    const childPath = prefix === "/" ? `/${head}` : `${prefix}/${head}`;
    if (rest.length === 0) {
      children.set(raw, { path: raw, title: head, kind: "page" });
      continue;
    }
    children.set(childPath, { path: childPath, title: head, kind: "dir" });
  }
  return [...children.values()].sort((a, b) => a.path.localeCompare(b.path));
}

async function treeForEntry(entry: DocsRegistryEntry, nodePath: string): Promise<ListNodeItem[]> {
  if (entry.sourceType === "bundle") {
    const storeId = await ensureBundleStoreId(entry);
    if (storeId) {
      const manifest = await readDocStoreManifest(storeId);
      if (manifest) {
        const children = listDocStoreChildren(manifest, nodePath);
        return children.map((ch) => ({
          path: ch.path,
          title: ch.title,
          kind: ch.children.length > 0 ? "dir" : ch.pageRef ? "page" : "dir",
        }));
      }
    }
    const ref = await findInstalledBundle(entry.source);
    if (!ref) return [];
    const bundle = await loadBundle(ref.root);
    return listBundleNodes(listSlugs(bundle), nodePath);
  }
  const urls = await listDocUrls(entry.source);
  return listUrlNodes(urls, nodePath);
}

async function ensureBundleStoreId(entry: DocsRegistryEntry): Promise<string | null> {
  try {
    const ref = await findInstalledBundle(entry.source);
    if (!ref) return null;
    const manifest = await ingestBundleToDocStore(ref.root);
    return manifest.storeId;
  } catch (err) {
    console.error(`[doc0 mcp] bundle ingest failed for ${entry.source}:`, err);
    return null;
  }
}

async function resolveOrFail(id: string): Promise<DocsRegistryEntry | null> {
  return resolveDocsRegistryEntry(id, mcpRegistryOptions());
}

async function getLlmsFullChunks(entry: DocsRegistryEntry): Promise<LlmsFullChunk[] | null> {
  if (entry.sourceType !== "url") return null;
  const now = Date.now();
  const cached = llmsFullCache.get(entry.id);
  if (cached && now - cached.fetchedAt <= LLMS_FULL_TTL_MS) return cached.chunks;
  try {
    const full = await fetchLlmsFullTxt(entry.source);
    if (!full) {
      llmsFullCache.set(entry.id, { fetchedAt: now, chunks: null, markdown: null });
      return null;
    }
    llmsFullCache.set(entry.id, { fetchedAt: now, chunks: full.chunks, markdown: full.markdown });
    return full.chunks;
  } catch (err) {
    console.error(`[doc0 mcp] llms-full.txt fetch failed for ${entry.source}:`, err);
    llmsFullCache.set(entry.id, { fetchedAt: now, chunks: null, markdown: null });
    return null;
  }
}

async function getLlmsFullMarkdown(entry: DocsRegistryEntry): Promise<string | null> {
  await getLlmsFullChunks(entry);
  return llmsFullCache.get(entry.id)?.markdown ?? null;
}

export function registerD0Tools(server: McpServer): void {
  server.registerTool(
    "find_docs",
    {
      description:
        "Find documentation sources in the registry. Returns matching entries plus — for the top match — the root tree and whether an llms-full.txt fast path is available. One call is usually enough to start navigating.",
      inputSchema: {
        query: z.string().describe("Identifier, alias, or topic, e.g. \"stripe\" or \"stripe webhooks\""),
      },
    },
    async ({ query }) => {
      const matches = await searchDocsRegistry(query, mcpRegistryOptions());
      if (matches.length === 0) {
        return text({ matches: [], top: null });
      }
      const top = matches[0]!;
      const [tree, llmsChunks] = await Promise.all([
        treeForEntry(top, "/").catch(() => [] as ListNodeItem[]),
        top.sourceType === "url" ? getLlmsFullChunks(top) : Promise.resolve(null),
      ]);
      return text({
        matches: matches.map(entryCard),
        top: {
          ...entryCard(top),
          tree,
          llms_full_available: Array.isArray(llmsChunks) && llmsChunks.length > 0,
          llms_full_chunk_count: Array.isArray(llmsChunks) ? llmsChunks.length : 0,
        },
      });
    },
  );

  server.registerTool(
    "read_docs",
    {
      description:
        "Read documentation by identifier. Default (no path): returns the root tree. With a directory path: returns that subtree. With a page path or URL: returns its markdown content. Pass full=true to return the entire /llms-full.txt dump (one HTTP hit for the whole site, when available). Pass full=\"heading substring\" to return a single llms-full.txt section matching that heading.",
      inputSchema: {
        id: z.string().describe("Registry identifier (e.g. \"stripe\") or alias"),
        path: z
          .string()
          .optional()
          .describe(
            "Optional: '/' or dir path → subtree; absolute page URL (URL docs) or slug (bundles) → page content",
          ),
        full: z
          .union([z.boolean(), z.string()])
          .optional()
          .describe(
            "Optional: true → full llms-full.txt markdown; string → return the llms-full chunk whose heading contains that substring (case-insensitive)",
          ),
      },
    },
    async ({ id, path, full }) => {
      const entry = await resolveOrFail(id);
      if (!entry) return text({ error: "docs not found", id });

      if (full !== undefined && full !== false) {
        const chunks = await getLlmsFullChunks(entry);
        if (!chunks) {
          return text({
            error: "site does not publish /llms-full.txt",
            id: entry.id,
            source: entry.source,
            hint: "use read_docs with a path, or grep_docs to search",
          });
        }
        if (full === true) {
          const markdown = await getLlmsFullMarkdown(entry);
          return text({
            id: entry.id,
            source: entry.source,
            kind: "llms_full",
            total_chunks: chunks.length,
            markdown: markdown ?? "",
            chunks: chunks.map((c, i) => ({ index: i, heading: c.heading })),
          });
        }
        const needle = String(full).toLowerCase();
        const idx = chunks.findIndex((c) => c.heading.toLowerCase().includes(needle));
        if (idx < 0) {
          return text({
            error: "no llms-full.txt chunk matches heading",
            needle: String(full),
            available: chunks.map((c, i) => ({ index: i, heading: c.heading })),
          });
        }
        const picked = chunks[idx]!;
        return text({
          id: entry.id,
          kind: "llms_full_chunk",
          chunk: { index: idx, heading: picked.heading, content: picked.body },
          total_chunks: chunks.length,
        });
      }

      const nodePath = normalizeNodePath(path);

      if (nodePath === "/" || !path) {
        const tree = await treeForEntry(entry, "/");
        const chunks = entry.sourceType === "url" ? await getLlmsFullChunks(entry) : null;
        return text({
          id: entry.id,
          path: "/",
          kind: "tree",
          tree,
          llms_full_available: Array.isArray(chunks) && chunks.length > 0,
        });
      }

      if (entry.sourceType === "url") {
        const isAbsoluteUrl =
          (nodePath.startsWith("http://") || nodePath.startsWith("https://")) && isUrlLike(nodePath);
        if (isAbsoluteUrl) {
          const storeId = storeIdForUrl(entry.source);
          const manifest = await readDocStoreManifest(storeId);
          if (manifest) {
            const rec = manifest.pages[pathKeyForPageUrl(nodePath)];
            if (rec) {
              const content = await readDocStorePage(storeId, rec.relPath);
              return text({ id: entry.id, path: nodePath, kind: "page", title: rec.title, content });
            }
          }
          try {
            const page = await readDocUrl(nodePath);
            scheduleLazyStoreWrite(storeId, () => mergeWebDocPageIntoUrlDocStore(entry.source, page));
            return text({ id: entry.id, path: nodePath, kind: "page", title: page.title, content: page.markdown });
          } catch (e) {
            return text({ error: e instanceof Error ? e.message : String(e), id: entry.id, path: nodePath });
          }
        }

        const subtree = await treeForEntry(entry, nodePath);
        if (subtree.length > 0) {
          return text({ id: entry.id, path: nodePath, kind: "tree", tree: subtree });
        }
        return text({
          error:
            "for URL docs, read_docs path must be either '/' / a directory path, or an absolute page URL from the tree",
          id: entry.id,
          path: nodePath,
        });
      }

      const slug = nodePath.replace(/^\//, "");
      const storeId = await ensureBundleStoreId(entry);
      if (storeId) {
        const manifest = await readDocStoreManifest(storeId);
        if (manifest) {
          const rec = manifest.pages[`/${slug}`];
          if (rec) {
            const content = await readDocStorePage(storeId, rec.relPath);
            return text({ id: entry.id, path: nodePath, kind: "page", title: rec.title, content });
          }
          const subtree = await treeForEntry(entry, nodePath);
          if (subtree.length > 0) {
            return text({ id: entry.id, path: nodePath, kind: "tree", tree: subtree });
          }
        }
      }
      const ref = await findInstalledBundle(entry.source);
      if (!ref) return text({ error: "bundle not installed", id: entry.id, bundle: entry.source });
      const bundle = await loadBundle(ref.root);
      try {
        const content = await readPageMarkdown(bundle, slug);
        return text({ id: entry.id, path: nodePath, kind: "page", title: slug, content });
      } catch {
        return text({ error: "unknown path", id: entry.id, path: nodePath });
      }
    },
  );

  server.registerTool(
    "grep_docs",
    {
      description:
        "Search within a documentation source. Uses the local cache of pages you've already read when available. For URL docs with no cache yet, runs a bounded live search (D0_MCP_SEARCH_MAX_FETCH). For bundles, uses the bundle's full-text index. Tip: if the site has llms-full.txt, prefer read_docs with full=true for broad retrieval.",
      inputSchema: {
        id: z.string().describe("Registry identifier (e.g. \"stripe\") or alias"),
        query: z.string().describe("Search query"),
      },
    },
    async ({ id, query }) => {
      const entry = await resolveOrFail(id);
      if (!entry) return text({ error: "docs not found", id });

      const storeId =
        entry.sourceType === "url" ? storeIdForUrl(entry.source) : await ensureBundleStoreId(entry);

      if (storeId) {
        const manifest = await readDocStoreManifest(storeId);
        if (manifest && Object.keys(manifest.pages).length > 0) {
          const hits = await searchDocStore(manifest, query);
          return text({
            id: entry.id,
            query,
            hits: hits.map((hit) => ({
              path: hit.path,
              title: hit.title,
              snippet: hit.snippet,
              score: hit.score,
            })),
          });
        }
      }

      if (entry.sourceType === "bundle") {
        const ref = await findInstalledBundle(entry.source);
        if (!ref) return text({ error: "bundle not installed", id: entry.id, bundle: entry.source });
        const bundle = await loadBundle(ref.root);
        const mini = await buildIndex(bundle);
        const hits = searchIndex(mini, query).map((hit) => ({
          path: `/${hit.slug}`,
          title: hit.title,
          snippet: hit.snippet,
          score: hit.score,
        }));
        return text({ id: entry.id, query, hits });
      }

      const hits = await searchDocUrls(entry.source, query, undefined, {
        maxFetch: mcpLiveSearchMaxFetch(),
        earlyExit: true,
      });
      return text({
        id: entry.id,
        query,
        hits: hits.map((hit) => ({
          path: hit.url,
          title: hit.title,
          snippet: hit.snippet,
        })),
      });
    },
  );

  server.registerTool(
    "list_docs",
    {
      description: "List all registry entries (built-in + user-added + installed bundles).",
      inputSchema: {},
    },
    async () => {
      const entries = await listDocsRegistryEntries(mcpRegistryOptions());
      return text(entries.map(entryCard));
    },
  );
}
