import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findInstalledBundle } from "../core/storage.js";
import { loadBundle, listSlugs, readPageMarkdown } from "../core/bundle.js";
import { buildIndex, searchIndex } from "../core/search-engine.js";
import { isUrlLike, listDocUrls, readDocUrl, searchDocUrls } from "../core/web-docs.js";
import { loadConfig } from "../core/config.js";
import { readDocStoreManifest, readDocStorePage, storeIdForBundle, storeIdForUrl } from "../core/doc-store.js";
import { listDocStoreChildren, docStorePagePathKeyForUrl } from "../core/doc-store-nav.js";
import { ingestUrlToDocStore } from "../core/ingest-url.js";
import { ingestBundleToDocStore } from "../core/ingest-bundle.js";
import { searchDocStore } from "../core/doc-store-search.js";
import {
  listDocsRegistryEntries,
  resolveDocsEntryWithFallback,
  searchDocsRegistry,
  searchGlobalDocsRegistry,
  type DocsRegistryEntry,
} from "../core/registry-client.js";

type OpenDocSession = {
  docId: string;
  entry: DocsRegistryEntry;
  resolvedFrom: "local" | "cache" | "global";
  provider: "bundle" | "web";
  registryRevision?: string;
  fetchedAt: string;
  storeId?: string;
  ingestRequested?: boolean;
  ingestError?: string;
};

type ListNodeItem = {
  path: string;
  title: string;
  kind: "page" | "dir";
};

const sessions = new Map<string, OpenDocSession>();

function docIdFor(entry: DocsRegistryEntry): string {
  return `doc:${entry.id}`;
}

function normalizeNodePath(input: string | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw || raw === ".") return "/";
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.replace(/\\/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
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

async function listDocStoreNodeItems(session: OpenDocSession, nodePath: string): Promise<ListNodeItem[] | null> {
  if (!session.storeId) return null;
  const manifest = await readDocStoreManifest(session.storeId);
  if (!manifest) return null;
  const children = listDocStoreChildren(manifest, nodePath);
  return children.map((ch) => ({
    path: ch.path,
    title: ch.title,
    kind: ch.children.length > 0 ? "dir" : ch.pageRef ? "page" : "dir",
  }));
}

async function ensureIngestedSession(session: OpenDocSession): Promise<void> {
  if (!session.ingestRequested || session.storeId) return;
  try {
    if (session.provider === "web") {
      const manifest = await ingestUrlToDocStore(session.entry.source);
      session.storeId = manifest.storeId;
      return;
    }
    if (session.provider === "bundle") {
      const ref = await findInstalledBundle(session.entry.source);
      if (!ref) {
        session.ingestError = "bundle not installed; cannot ingest to local store";
        return;
      }
      const manifest = await ingestBundleToDocStore(ref.root);
      session.storeId = manifest.storeId;
    }
  } catch (e) {
    session.ingestError = e instanceof Error ? e.message : String(e);
  }
}

function getSession(docId: string): OpenDocSession | null {
  const session = sessions.get(docId);
  return session ?? null;
}

export function registerD0Tools(server: McpServer): void {
  server.registerTool(
    "search_docs",
    {
      description: "Find docs sources by identifier, alias, or description.",
      inputSchema: {
        query: z.string().describe("Docs source query, e.g. stripe"),
      },
    },
    async ({ query }) => {
      const config = await loadConfig();
      const [localEntries, globalResult] = await Promise.all([
        searchDocsRegistry(query),
        searchGlobalDocsRegistry(config, query),
      ]);
      const merged = new Map<string, DocsRegistryEntry>();
      for (const entry of [...localEntries, ...globalResult.entries]) {
        if (!merged.has(entry.id)) merged.set(entry.id, entry);
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              [...merged.values()].map((entry) => ({
                id: entry.id,
                aliases: entry.aliases,
                sourceType: entry.sourceType,
                source: entry.source,
                description: entry.description,
                sourceScope: entry.sourceScope ?? "builtin",
              })),
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_docs",
    {
      description: "List all discoverable docs sources.",
      inputSchema: {},
    },
    async () => {
      const config = await loadConfig();
      const entries = await listDocsRegistryEntries(config);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              entries.map((entry) => ({
                id: entry.id,
                aliases: entry.aliases,
                sourceType: entry.sourceType,
                source: entry.source,
                description: entry.description,
                sourceScope: entry.sourceScope ?? "builtin",
              })),
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "open_docs",
    {
      description: "Open documentation by identifier and return a doc_id for subsequent node operations.",
      inputSchema: {
        package: z.string().describe("Docs identifier, alias, or topic"),
        ingest: z
          .boolean()
          .optional()
          .describe("If true, ingest into local ~/.d0/docs-store for structured list/read/search"),
      },
    },
    async ({ package: packageQuery, ingest }) => {
      const config = await loadConfig();
      const resolved = await resolveDocsEntryWithFallback(config, packageQuery);
      if (!resolved) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: "docs not found", query: packageQuery }) },
          ],
        };
      }
      const entry = resolved.entry;
      const docId = docIdFor(entry);
      const provider: "bundle" | "web" = entry.sourceType === "bundle" ? "bundle" : "web";
      const session: OpenDocSession = {
        docId,
        entry,
        provider,
        resolvedFrom: resolved.resolvedFrom,
        registryRevision: resolved.registryRevision,
        fetchedAt: resolved.fetchedAt,
        ingestRequested: ingest === true,
      };
      if (!ingest) {
        const existingId = provider === "web" ? storeIdForUrl(entry.source) : storeIdForBundle(entry.source);
        const existing = await readDocStoreManifest(existingId);
        if (existing) session.storeId = existing.storeId;
      } else {
        await ensureIngestedSession(session);
      }
      sessions.set(docId, session);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              doc_id: docId,
              id: entry.id,
              aliases: entry.aliases,
              sourceType: entry.sourceType,
              source: entry.source,
              description: entry.description,
              sourceScope: entry.sourceScope ?? "builtin",
              resolvedFrom: resolved.resolvedFrom,
              provider,
              registryRevision: resolved.registryRevision,
              fetchedAt: resolved.fetchedAt,
              store_id: session.storeId,
              ingest: ingest === true,
              ingestError: session.ingestError,
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_nodes",
    {
      description: "List child nodes in an opened documentation tree.",
      inputSchema: {
        doc_id: z.string().describe("doc_id returned by open_docs"),
        path: z.string().optional().describe("Node path to list, defaults to root '/'"),
      },
    },
    async ({ doc_id, path }) => {
      const session = getSession(doc_id);
      if (!session) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "unknown doc_id", doc_id }) }] };
      }
      const nodePath = normalizeNodePath(path);
      if (session.ingestRequested && session.ingestError && !session.storeId) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "ingest failed", detail: session.ingestError, doc_id }),
            },
          ],
        };
      }
      const storeNodes = await listDocStoreNodeItems(session, nodePath);
      if (storeNodes) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                doc_id,
                path: nodePath,
                provider: session.provider,
                resolvedFrom: session.resolvedFrom,
                store_id: session.storeId,
                nodes: storeNodes,
              }),
            },
          ],
        };
      }
      if (session.entry.sourceType === "bundle") {
        const ref = await findInstalledBundle(session.entry.source);
        if (!ref) {
          return {
            content: [
              { type: "text" as const, text: JSON.stringify({ error: "bundle not installed", bundle: session.entry.source }) },
            ],
          };
        }
        const bundle = await loadBundle(ref.root);
        const nodes = listBundleNodes(listSlugs(bundle), nodePath);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                doc_id,
                path: nodePath,
                provider: session.provider,
                resolvedFrom: session.resolvedFrom,
                nodes,
              }),
            },
          ],
        };
      }

      const urls = await listDocUrls(session.entry.source);
      const nodes = listUrlNodes(urls, nodePath);
      try {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ doc_id, path: nodePath, provider: session.provider, resolvedFrom: session.resolvedFrom, nodes }),
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: e instanceof Error ? e.message : String(e), source: session.entry.source }),
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "read_node",
    {
      description: "Read a specific documentation node and return markdown content.",
      inputSchema: {
        doc_id: z.string().describe("doc_id returned by open_docs"),
        path: z.string().describe("Path to page node"),
      },
    },
    async ({ doc_id, path }) => {
      const session = getSession(doc_id);
      if (!session) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "unknown doc_id", doc_id }) }] };
      }
      const nodePath = normalizeNodePath(path);
      if (session.ingestRequested && session.ingestError && !session.storeId) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "ingest failed", detail: session.ingestError, doc_id }),
            },
          ],
        };
      }
      if (session.storeId) {
        const manifest = await readDocStoreManifest(session.storeId);
        if (manifest) {
          if (session.provider === "web" && (nodePath.startsWith("http://") || nodePath.startsWith("https://"))) {
            const key = docStorePagePathKeyForUrl(manifest, nodePath);
            if (!key) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({ error: "page not in store", path: nodePath, store_id: session.storeId }),
                  },
                ],
              };
            }
            const rec = manifest.pages[key];
            if (!rec) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({ error: "unknown store page", path: key, store_id: session.storeId }),
                  },
                ],
              };
            }
            const content = await readDocStorePage(session.storeId, rec.relPath);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    doc_id,
                    path: nodePath,
                    title: rec.title,
                    provider: session.provider,
                    resolvedFrom: session.resolvedFrom,
                    store_id: session.storeId,
                    content,
                  }),
                },
              ],
            };
          }

          const slug = nodePath.replace(/^\//, "");
          const rec = manifest.pages[`/${slug}`];
          if (!rec) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "unknown path", path: nodePath, store_id: session.storeId }),
                },
              ],
            };
          }
          const content = await readDocStorePage(session.storeId, rec.relPath);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  doc_id,
                  path: nodePath,
                  title: rec.title,
                  provider: session.provider,
                  resolvedFrom: session.resolvedFrom,
                  store_id: session.storeId,
                  content,
                }),
              },
            ],
          };
        }
      }
      if (session.entry.sourceType === "bundle") {
        const slug = nodePath.replace(/^\//, "");
        const ref = await findInstalledBundle(session.entry.source);
        if (!ref) {
          return {
            content: [
              { type: "text" as const, text: JSON.stringify({ error: "bundle not installed", bundle: session.entry.source }) },
            ],
          };
        }
        const bundle = await loadBundle(ref.root);
        try {
          const content = await readPageMarkdown(bundle, slug);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  doc_id,
                  path: nodePath,
                  title: slug,
                  provider: session.provider,
                  resolvedFrom: session.resolvedFrom,
                  content,
                }),
              },
            ],
          };
        } catch {
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: "unknown path", path: nodePath }) }] };
        }
      }

      const sourcePath = nodePath.startsWith("http://") || nodePath.startsWith("https://") ? nodePath : null;
      if (!sourcePath || !isUrlLike(sourcePath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "for URL docs, read_node path must be an absolute page URL from list_nodes",
                path: nodePath,
              }),
            },
          ],
        };
      }
      try {
        const page = await readDocUrl(sourcePath);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                doc_id,
                path: sourcePath,
                title: page.title,
                provider: session.provider,
                resolvedFrom: session.resolvedFrom,
                content: page.markdown,
              }),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: e instanceof Error ? e.message : String(e), path: sourcePath }) }],
        };
      }
    },
  );

  server.registerTool(
    "search_nodes",
    {
      description: "Search nodes in an opened documentation context.",
      inputSchema: {
        doc_id: z.string().describe("doc_id returned by open_docs"),
        query: z.string().describe("Search query"),
      },
    },
    async ({ doc_id, query }) => {
      const session = getSession(doc_id);
      if (!session) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "unknown doc_id", doc_id }) }] };
      }
      if (session.ingestRequested && session.ingestError && !session.storeId) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "ingest failed", detail: session.ingestError, doc_id }),
            },
          ],
        };
      }
      if (session.storeId) {
        const manifest = await readDocStoreManifest(session.storeId);
        if (manifest) {
          const hits = await searchDocStore(manifest, query);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  doc_id,
                  query,
                  store_id: session.storeId,
                  hits: hits.map((hit) => ({
                    path: hit.path,
                    title: hit.title,
                    snippet: hit.snippet,
                    score: hit.score,
                  })),
                }),
              },
            ],
          };
        }
      }
      if (session.entry.sourceType === "bundle") {
        const ref = await findInstalledBundle(session.entry.source);
        if (!ref) {
          return {
            content: [
              { type: "text" as const, text: JSON.stringify({ error: "bundle not installed", bundle: session.entry.source }) },
            ],
          };
        }
        const bundle = await loadBundle(ref.root);
        const mini = await buildIndex(bundle);
        const hits = searchIndex(mini, query).map((hit) => ({
          path: `/${hit.slug}`,
          title: hit.title,
          snippet: hit.snippet,
          score: hit.score,
        }));
        return { content: [{ type: "text" as const, text: JSON.stringify({ doc_id, query, hits }) }] };
      }

      const hits = await searchDocUrls(session.entry.source, query);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              doc_id,
              query,
              hits: hits.map((hit) => ({
                path: hit.url,
                title: hit.title,
                snippet: hit.snippet,
              })),
              provider: session.provider,
              resolvedFrom: session.resolvedFrom,
            }),
          },
        ],
      };
    },
  );
}
