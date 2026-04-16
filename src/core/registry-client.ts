import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { docsRegistryPath, listInstalled } from "./storage.js";

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

export interface RegistryBundleMeta {
  name: string;
  version: string;
  tarballUrl: string;
}

export type DocsSourceType = "bundle" | "url";

export interface DocsRegistryEntry {
  id: string;
  aliases: string[];
  sourceType: DocsSourceType;
  source: string;
  description?: string;
  sourceScope?: "user-local" | "installed-local" | "builtin";
}

export interface DocsResolveResult {
  entry: DocsRegistryEntry;
  resolvedFrom: "local";
  fetchedAt: string;
}

interface UserDocsRegistryFile {
  entries?: DocsRegistryEntry[];
}

/**
 * Built-in registry. Static, ships with the CLI.
 *
 * Prefer sources that expose `/llms.txt` or `/llms-full.txt` — those are the fast path for MCP.
 * Users add more via `d0 add <id> <url>` (writes `~/.d0/docs-registry.json`).
 */
const BUILTIN_DOCS_REGISTRY: DocsRegistryEntry[] = [
  {
    id: "stripe",
    aliases: ["stripe api", "stripe docs"],
    sourceType: "url",
    source: "https://docs.stripe.com",
    description: "Stripe API documentation",
    sourceScope: "builtin",
  },
  {
    id: "node",
    aliases: ["nodejs", "node.js", "node docs"],
    sourceType: "url",
    source: "https://nodejs.org/docs/latest/api/",
    description: "Node.js API reference",
    sourceScope: "builtin",
  },
  {
    id: "anthropic",
    aliases: ["claude", "anthropic api", "claude docs"],
    sourceType: "url",
    source: "https://docs.anthropic.com",
    description: "Anthropic / Claude API documentation",
    sourceScope: "builtin",
  },
  {
    id: "vercel",
    aliases: ["vercel docs"],
    sourceType: "url",
    source: "https://vercel.com/docs",
    description: "Vercel platform documentation",
    sourceScope: "builtin",
  },
  {
    id: "nextjs",
    aliases: ["next", "next.js", "next js"],
    sourceType: "url",
    source: "https://nextjs.org/docs",
    description: "Next.js framework documentation",
    sourceScope: "builtin",
  },
  {
    id: "prisma",
    aliases: ["prisma orm", "prisma docs"],
    sourceType: "url",
    source: "https://www.prisma.io/docs",
    description: "Prisma ORM documentation",
    sourceScope: "builtin",
  },
  {
    id: "supabase",
    aliases: ["supabase docs"],
    sourceType: "url",
    source: "https://supabase.com/docs",
    description: "Supabase platform documentation",
    sourceScope: "builtin",
  },
  {
    id: "cloudflare",
    aliases: ["cloudflare docs", "workers"],
    sourceType: "url",
    source: "https://developers.cloudflare.com",
    description: "Cloudflare developer documentation",
    sourceScope: "builtin",
  },
  {
    id: "bun",
    aliases: ["bun.sh", "bun docs"],
    sourceType: "url",
    source: "https://bun.sh/docs",
    description: "Bun runtime documentation",
    sourceScope: "builtin",
  },
  {
    id: "astro",
    aliases: ["astro docs"],
    sourceType: "url",
    source: "https://docs.astro.build",
    description: "Astro framework documentation",
    sourceScope: "builtin",
  },
  {
    id: "svelte",
    aliases: ["svelte docs", "sveltekit"],
    sourceType: "url",
    source: "https://svelte.dev/docs",
    description: "Svelte / SvelteKit documentation",
    sourceScope: "builtin",
  },
  {
    id: "shadcn",
    aliases: ["shadcn ui", "shadcn/ui"],
    sourceType: "url",
    source: "https://ui.shadcn.com/docs",
    description: "shadcn/ui component documentation",
    sourceScope: "builtin",
  },
];

function normalizeRegistryText(input: string): string {
  return input.trim().toLowerCase();
}

function dedupeAliases(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeRegistryText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeRegistryEntry(raw: DocsRegistryEntry): DocsRegistryEntry | null {
  const id = normalizeRegistryText(raw.id);
  if (!id) return null;
  if (raw.sourceType !== "bundle" && raw.sourceType !== "url") return null;
  const source = raw.source?.trim();
  if (!source) return null;
  const aliases = dedupeAliases([...(raw.aliases ?? []), id]);
  return {
    id,
    aliases,
    sourceType: raw.sourceType,
    source,
    description: raw.description?.trim() || undefined,
    sourceScope: raw.sourceScope,
  };
}

async function readUserRegistryEntries(): Promise<DocsRegistryEntry[]> {
  const p = docsRegistryPath();
  if (!existsSync(p)) return [];
  try {
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw) as UserDocsRegistryFile;
    if (!Array.isArray(parsed.entries)) return [];
    return parsed.entries
      .map((entry) => normalizeRegistryEntry(entry))
      .filter((entry): entry is DocsRegistryEntry => Boolean(entry))
      .map((entry) => ({ ...entry, sourceScope: "user-local" as const }));
  } catch {
    return [];
  }
}

async function installedBundleEntries(): Promise<DocsRegistryEntry[]> {
  const installed = await listInstalled();
  return installed.map((bundle) => {
    const id = normalizeRegistryText(bundle.manifest.name);
    const short = id.split("/").at(-1) ?? id;
    const aliases = dedupeAliases([id, short, bundle.manifest.bin ?? ""]);
    return {
      id,
      aliases,
      sourceType: "bundle" as const,
      source: bundle.manifest.name,
      description: `Installed bundle ${bundle.manifest.name}@${bundle.manifest.version}`,
      sourceScope: "installed-local" as const,
    };
  });
}

function scoreScope(scope: DocsRegistryEntry["sourceScope"]): number {
  switch (scope) {
    case "user-local":
      return 500;
    case "installed-local":
      return 400;
    case "builtin":
      return 100;
    default:
      return 0;
  }
}

function mergeByPrecedence(entries: DocsRegistryEntry[]): DocsRegistryEntry[] {
  const sorted = [...entries].sort((a, b) => {
    const sa = scoreScope(a.sourceScope);
    const sb = scoreScope(b.sourceScope);
    if (sa !== sb) return sb - sa;
    return a.id.localeCompare(b.id);
  });
  const byId = new Map<string, DocsRegistryEntry>();
  for (const raw of sorted) {
    const entry = normalizeRegistryEntry(raw);
    if (!entry) continue;
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, entry);
      continue;
    }
    byId.set(entry.id, {
      ...existing,
      aliases: dedupeAliases([...existing.aliases, ...entry.aliases]),
      description: existing.description ?? entry.description,
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function listDocsRegistryEntries(): Promise<DocsRegistryEntry[]> {
  const [bundles, userEntries] = await Promise.all([installedBundleEntries(), readUserRegistryEntries()]);
  return mergeByPrecedence([...userEntries, ...bundles, ...BUILTIN_DOCS_REGISTRY]);
}

export function scoreRegistryMatch(entry: DocsRegistryEntry, query: string): number {
  const q = normalizeRegistryText(query);
  if (!q) return 0;
  if (entry.id === q) return 100;
  if (entry.aliases.includes(q)) return 90;
  if (entry.id.includes(q)) return 70;
  const aliasPartial = entry.aliases.some((alias) => alias.includes(q));
  if (aliasPartial) return 60;
  if (entry.description?.toLowerCase().includes(q)) return 40;
  return 0;
}

export async function searchDocsRegistry(query: string): Promise<DocsRegistryEntry[]> {
  const entries = await listDocsRegistryEntries();
  return entries
    .map((entry) => ({ entry, score: scoreRegistryMatch(entry, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => (b.score === a.score ? a.entry.id.localeCompare(b.entry.id) : b.score - a.score))
    .map((item) => item.entry);
}

export async function resolveDocsRegistryEntry(query: string): Promise<DocsRegistryEntry | null> {
  const entries = await listDocsRegistryEntries();
  let best: { entry: DocsRegistryEntry; score: number } | null = null;
  for (const entry of entries) {
    const score = scoreRegistryMatch(entry, query);
    if (score <= 0) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        (scoreScope(entry.sourceScope) > scoreScope(best.entry.sourceScope) ||
          (scoreScope(entry.sourceScope) === scoreScope(best.entry.sourceScope) &&
            entry.id.localeCompare(best.entry.id) < 0)))
    ) {
      best = { entry, score };
    }
  }
  return best?.entry ?? null;
}

export async function resolveDocsEntryWithFallback(query: string): Promise<DocsResolveResult | null> {
  const entry = await resolveDocsRegistryEntry(query);
  if (!entry) return null;
  return {
    entry,
    resolvedFrom: "local",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Placeholder — d0 does not run a bundle download service. Use `d0 add --local <path>` for now.
 */
export async function fetchBundleMeta(
  _name: string,
  _version?: string,
): Promise<RegistryBundleMeta> {
  throw new RegistryError(
    "Registry downloads are not available. Use: d0 add --local <path-to-bundle-dir>",
  );
}

export async function publishBundle(_tarballPath: string, _token?: string): Promise<void> {
  throw new RegistryError(
    "d0 publish is not wired to a live registry. Use d0 build to produce a .d0.tgz artifact.",
  );
}
