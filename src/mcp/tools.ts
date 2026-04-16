import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findInstalledBundle, listInstalled } from "../core/storage.js";
import { loadBundle, listSlugs, readPageMarkdown } from "../core/bundle.js";
import { buildIndex, searchIndex } from "../core/search-engine.js";
import { isUrlLike, listDocUrls, readDocUrl, searchDocUrls } from "../core/web-docs.js";

export function registerD0Tools(server: McpServer): void {
  server.registerTool(
    "d0_search",
    {
      description: "Full-text search within an installed d0 documentation bundle.",
      inputSchema: {
        bundle: z.string().describe("Bundle name, e.g. @acme/docs"),
        query: z.string().describe("Search query"),
      },
    },
    async ({ bundle, query }) => {
      const ref = await findInstalledBundle(bundle);
      if (!ref) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "bundle not found", bundle }) }] };
      }
      const b = await loadBundle(ref.root);
      const mini = await buildIndex(b);
      const hits = searchIndex(mini, query);
      return { content: [{ type: "text" as const, text: JSON.stringify({ bundle: b.manifest.name, query, hits }) }] };
    },
  );

  server.registerTool(
    "d0_url_search",
    {
      description: "Search docs directly from a URL target (site or page).",
      inputSchema: {
        url: z.string().describe("URL or domain, e.g. docs.example.com/getting-started"),
        query: z.string().describe("Search query"),
        includeExternal: z
          .boolean()
          .optional()
          .describe("If true, include off-site URLs from llms.txt (default: same origin as url only)"),
      },
    },
    async ({ url, query, includeExternal }) => {
      if (!isUrlLike(url)) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "invalid url", url }) }] };
      }
      const hits = await searchDocUrls(url, query, includeExternal ? { llmsIncludeExternal: true } : undefined);
      return { content: [{ type: "text" as const, text: JSON.stringify({ url, query, hits }) }] };
    },
  );

  server.registerTool(
    "d0_read",
    {
      description: "Read a documentation page (markdown) from an installed bundle by slug.",
      inputSchema: {
        bundle: z.string().describe("Bundle name"),
        path: z.string().describe("Page slug from d0.json structure keys"),
      },
    },
    async ({ bundle, path: slug }) => {
      const ref = await findInstalledBundle(bundle);
      if (!ref) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "bundle not found", bundle }) }] };
      }
      const b = await loadBundle(ref.root);
      try {
        const md = await readPageMarkdown(b, slug);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                bundle: b.manifest.name,
                slug,
                path: b.manifest.structure[slug],
                content: md,
              }),
            },
          ],
        };
      } catch {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "unknown slug", slug }) }] };
      }
    },
  );

  server.registerTool(
    "d0_url_read",
    {
      description: "Read a docs page directly from URL and return markdown.",
      inputSchema: {
        url: z.string().describe("Page URL"),
      },
    },
    async ({ url }) => {
      if (!isUrlLike(url)) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "invalid url", url }) }] };
      }
      try {
        const page = await readDocUrl(url);
        return { content: [{ type: "text" as const, text: JSON.stringify(page) }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: e instanceof Error ? e.message : String(e), url }) }],
        };
      }
    },
  );

  server.registerTool(
    "d0_ls",
    {
      description: "List installed bundles, or list page slugs for one bundle.",
      inputSchema: {
        bundle: z.string().optional().describe("If set, list pages in this bundle; else list installed bundles"),
      },
    },
    async ({ bundle }) => {
      if (!bundle?.trim()) {
        const installed = await listInstalled();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                installed.map((x) => ({
                  name: x.manifest.name,
                  version: x.manifest.version,
                  bin: x.manifest.bin,
                })),
              ),
            },
          ],
        };
      }
      const ref = await findInstalledBundle(bundle);
      if (!ref) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "bundle not found", bundle }) }] };
      }
      const b = await loadBundle(ref.root);
      const slugs = listSlugs(b);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              slugs.map((slug) => ({ slug, path: b.manifest.structure[slug] })),
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "d0_url_ls",
    {
      description: "List docs page URLs discovered from a docs site/page URL.",
      inputSchema: {
        url: z.string().describe("Docs URL"),
        includeExternal: z
          .boolean()
          .optional()
          .describe("If true, include off-site URLs from llms.txt (default: same origin as url only)"),
      },
    },
    async ({ url, includeExternal }) => {
      if (!isUrlLike(url)) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "invalid url", url }) }] };
      }
      try {
        const pages = await listDocUrls(url, includeExternal ? { llmsIncludeExternal: true } : undefined);
        return { content: [{ type: "text" as const, text: JSON.stringify(pages.map((u) => ({ url: u }))) }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: e instanceof Error ? e.message : String(e), url }) }],
        };
      }
    },
  );
}
