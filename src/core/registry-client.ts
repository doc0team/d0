import type { D0Config } from "./config.js";
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
}

interface UserDocsRegistryFile {
  entries?: DocsRegistryEntry[];
}

const BUILTIN_DOCS_REGISTRY: DocsRegistryEntry[] = [
  {
    id: "stripe",
    aliases: ["stripe api", "stripe docs"],
    sourceType: "url",
    source: "https://docs.stripe.com",
    description: "Stripe API documentation",
  },
  {
    id: "node",
    aliases: ["nodejs", "node.js", "node docs"],
    sourceType: "url",
    source: "https://nodejs.org/docs/latest/api/",
    description: "Node.js API reference",
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
      .filter((entry): entry is DocsRegistryEntry => Boolean(entry));
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
    };
  });
}

function mergeEntriesById(entries: DocsRegistryEntry[]): DocsRegistryEntry[] {
  const byId = new Map<string, DocsRegistryEntry>();
  for (const raw of entries) {
    const entry = normalizeRegistryEntry(raw);
    if (!entry) continue;
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, entry);
      continue;
    }
    byId.set(entry.id, {
      ...entry,
      aliases: dedupeAliases([...existing.aliases, ...entry.aliases]),
      description: entry.description ?? existing.description,
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function listDocsRegistryEntries(): Promise<DocsRegistryEntry[]> {
  const [bundles, userEntries] = await Promise.all([installedBundleEntries(), readUserRegistryEntries()]);
  return mergeEntriesById([...BUILTIN_DOCS_REGISTRY, ...bundles, ...userEntries]);
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
    if (!best || score > best.score || (score === best.score && entry.id.localeCompare(best.entry.id) < 0)) {
      best = { entry, score };
    }
  }
  return best?.entry ?? null;
}

/**
 * Stub registry client — real registry not live in v0.1.
 * Interface matches planned HTTP API.
 */
export async function fetchBundleMeta(
  _config: D0Config,
  _name: string,
  _version?: string,
): Promise<RegistryBundleMeta> {
  throw new RegistryError(
    "Registry downloads are not available yet. Use: d0 add --local <path-to-bundle-dir>",
  );
}

export async function publishBundle(
  _config: D0Config,
  _tarballPath: string,
  _token?: string,
): Promise<void> {
  throw new RegistryError(
    "d0 publish is not wired to a live registry yet. Use d0 build to produce a .d0.tgz artifact.",
  );
}
