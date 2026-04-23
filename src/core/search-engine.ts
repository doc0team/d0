import MiniSearch from "minisearch";
import type { LoadedBundle } from "./bundle.js";
import { readPageMarkdown } from "./bundle.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

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

export interface HybridIndex {
  mini: MiniSearch<SearchDocument>;
  vectors?: Float32Array;
  vectorDim?: number;
  vectorOrder?: string[];
  docsBySlug: Map<string, SearchDocument>;
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

async function readVectorIndex(
  bundle: LoadedBundle,
): Promise<{ vectors: Float32Array; dim: number; order: string[] } | null> {
  try {
    const metaPath = path.join(bundle.root, "vectors.meta.json");
    const vecPath = path.join(bundle.root, "vectors.f32");
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as { dim?: number; pageOrder?: string[] };
    const dim = typeof meta.dim === "number" && meta.dim > 0 ? meta.dim : 0;
    if (!dim || !Array.isArray(meta.pageOrder)) return null;
    const raw = await readFile(vecPath);
    const f32 = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    return { vectors: new Float32Array(f32), dim, order: meta.pageOrder };
  } catch {
    return null;
  }
}

export async function buildHybridIndex(bundle: LoadedBundle): Promise<HybridIndex> {
  const docsBySlug = new Map<string, SearchDocument>();
  const mini = await buildIndex(bundle);
  for (const slug of Object.keys(bundle.manifest.structure)) {
    const md = await readPageMarkdown(bundle, slug);
    docsBySlug.set(slug, {
      id: slug,
      slug,
      title: firstHeading(md) ?? slug,
      body: stripMarkdown(md),
    });
  }
  const vec = await readVectorIndex(bundle);
  return {
    mini,
    docsBySlug,
    ...(vec ? { vectors: vec.vectors, vectorDim: vec.dim, vectorOrder: vec.order } : {}),
  };
}

function dot(a: Float32Array, ai: number, b: Float32Array): number {
  let v = 0;
  for (let i = 0; i < b.length; i++) v += a[ai + i]! * b[i]!;
  return v;
}

function norm(a: Float32Array, ai: number, len: number): number {
  let v = 0;
  for (let i = 0; i < len; i++) {
    const x = a[ai + i]!;
    v += x * x;
  }
  return Math.sqrt(v);
}

function vectorFromHash(query: string, dim: number): Float32Array {
  const out = new Float32Array(dim);
  let seed = 2166136261;
  for (let i = 0; i < query.length; i++) {
    seed ^= query.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  for (let i = 0; i < dim; i++) {
    seed ^= i + 1;
    seed = Math.imul(seed, 16777619);
    out[i] = ((seed >>> 0) % 1000) / 1000 - 0.5;
  }
  return out;
}

async function embedQuery(query: string, dim: number): Promise<Float32Array> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.D0_OPENAI_EMBED_MODEL ?? "text-embedding-3-small";
  if (!apiKey) return vectorFromHash(query, dim);
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: query }),
    });
    if (!res.ok) return vectorFromHash(query, dim);
    const body = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const emb = body.data?.[0]?.embedding;
    if (!Array.isArray(emb) || emb.length === 0) return vectorFromHash(query, dim);
    const out = new Float32Array(dim);
    for (let i = 0; i < dim; i++) out[i] = Number(emb[i] ?? 0);
    return out;
  } catch {
    return vectorFromHash(query, dim);
  }
}

export async function searchHybrid(index: HybridIndex, query: string, limit = 25): Promise<SearchHit[]> {
  const lexical = searchIndex(index.mini, query, Math.max(limit * 2, 50));
  if (!index.vectors || !index.vectorDim || !index.vectorOrder?.length) {
    return lexical.slice(0, limit);
  }

  const qv = await embedQuery(query, index.vectorDim);
  const qn = Math.max(1e-9, Math.sqrt(qv.reduce((acc, x) => acc + x * x, 0)));
  const semantic: SearchHit[] = [];
  for (let i = 0; i < index.vectorOrder.length; i++) {
    const slug = index.vectorOrder[i]!;
    const doc = index.docsBySlug.get(slug.replace(/^\//, ""));
    if (!doc) continue;
    const row = i * index.vectorDim;
    const dn = Math.max(1e-9, norm(index.vectors, row, index.vectorDim));
    const score = dot(index.vectors, row, qv) / (dn * qn);
    semantic.push({
      slug: doc.slug,
      title: doc.title,
      snippet: snippetAround(doc.body, query),
      score,
    });
  }
  semantic.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topSemantic = semantic.slice(0, Math.max(limit * 2, 50));

  const lexicalRank = new Map<string, number>();
  lexical.forEach((hit, i) => lexicalRank.set(hit.slug, i + 1));
  const semanticRank = new Map<string, number>();
  topSemantic.forEach((hit, i) => semanticRank.set(hit.slug, i + 1));
  const union = new Map<string, SearchHit>();
  for (const hit of lexical) union.set(hit.slug, hit);
  for (const hit of topSemantic) if (!union.has(hit.slug)) union.set(hit.slug, hit);

  return [...union.values()]
    .map((hit) => {
      const l = lexicalRank.get(hit.slug);
      const s = semanticRank.get(hit.slug);
      const rrf = (l ? 1 / (60 + l) : 0) + (s ? 1 / (60 + s) : 0);
      return { ...hit, score: rrf };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
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
