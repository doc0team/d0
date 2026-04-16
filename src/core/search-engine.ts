import MiniSearch from "minisearch";
import type { LoadedBundle } from "./bundle.js";
import { readPageMarkdown } from "./bundle.js";

export interface SearchDocument {
  id: string;
  slug: string;
  title: string;
  body: string;
}

export interface SearchHit {
  slug: string;
  title: string;
  snippet: string;
  score?: number;
}

const MINI_OPTIONS = {
  fields: ["slug", "title", "body"] as const,
  storeFields: ["slug", "title", "body"] as const,
  searchOptions: {
    boost: { title: 3, slug: 2, body: 1 },
    fuzzy: 0.2,
    prefix: true,
  },
} as const;

function firstHeading(markdown: string): string | undefined {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : undefined;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippetAround(text: string, query: string, maxLen = 200): string {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) {
    return text.slice(0, maxLen) + (text.length > maxLen ? "…" : "");
  }
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + query.length + 120);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end).trim() + suffix;
}

export async function buildIndex(bundle: LoadedBundle): Promise<MiniSearch<SearchDocument>> {
  const docs: SearchDocument[] = [];
  for (const slug of Object.keys(bundle.manifest.structure)) {
    const md = await readPageMarkdown(bundle, slug);
    const title = firstHeading(md) ?? slug;
    const body = stripMarkdown(md);
    docs.push({ id: slug, slug, title, body });
  }
  const mini = new MiniSearch<SearchDocument>({
    fields: [...MINI_OPTIONS.fields],
    storeFields: [...MINI_OPTIONS.storeFields],
    searchOptions: {
      boost: { ...MINI_OPTIONS.searchOptions.boost },
      fuzzy: MINI_OPTIONS.searchOptions.fuzzy,
      prefix: MINI_OPTIONS.searchOptions.prefix,
    },
  });
  mini.addAll(docs);
  return mini;
}

export function searchIndex(
  mini: MiniSearch<SearchDocument>,
  query: string,
  limit = 25,
): SearchHit[] {
  if (!query.trim()) return [];
  const results = mini.search(query, { combineWith: "AND" });
  return results.slice(0, limit).map((r) => {
    const body = String(r.body ?? "");
    return {
      slug: String(r.slug),
      title: String(r.title),
      snippet: snippetAround(body, query),
      score: typeof r.score === "number" ? r.score : undefined,
    };
  });
}
