import type { D0Config } from "./config.js";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { docsRegistryPath, globalDocsRegistryCachePath, listInstalled } from "./storage.js";

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
  sourceScope?: "user-local" | "installed-local" | "cached-global" | "live-global" | "builtin";
}

export interface DocsResolveResult {
  entry: DocsRegistryEntry;
  resolvedFrom: "local" | "cache" | "global";
  registryRevision?: string;
  fetchedAt: string;
}

interface UserDocsRegistryFile {
  entries?: DocsRegistryEntry[];
}

interface GlobalDocsRegistryFile {
  revision?: string;
  fetchedAt: string;
  entries: DocsRegistryEntry[];
}

const GLOBAL_DOCS_CACHE_TTL_MS = 10 * 60 * 1000;

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

async function readGlobalRegistryCache(): Promise<GlobalDocsRegistryFile | null> {
  const p = globalDocsRegistryCachePath();
  if (!existsSync(p)) return null;
  try {
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw) as GlobalDocsRegistryFile;
    if (!Array.isArray(parsed.entries) || typeof parsed.fetchedAt !== "string") return null;
    const entries = parsed.entries
      .map((entry) => normalizeRegistryEntry(entry))
      .filter((entry): entry is DocsRegistryEntry => Boolean(entry))
      .map((entry) => ({ ...entry, sourceScope: "cached-global" as const }));
    return { entries, fetchedAt: parsed.fetchedAt, revision: parsed.revision };
  } catch {
    return null;
  }
}

async function writeGlobalRegistryCache(data: GlobalDocsRegistryFile): Promise<void> {
  const p = globalDocsRegistryCachePath();
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2), "utf8");
}

function isFreshCache(cache: GlobalDocsRegistryFile): boolean {
  const ts = Date.parse(cache.fetchedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= GLOBAL_DOCS_CACHE_TTL_MS;
}

function parseGlobalEntries(payload: unknown, scope: DocsRegistryEntry["sourceScope"]): DocsRegistryEntry[] {
  const entriesRaw = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { entries?: unknown[] }).entries)
      ? (payload as { entries: unknown[] }).entries
      : [];
  return entriesRaw
    .map((entry) => normalizeRegistryEntry(entry as DocsRegistryEntry))
    .filter((entry): entry is DocsRegistryEntry => Boolean(entry))
    .map((entry) => ({ ...entry, sourceScope: scope }));
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "d0-registry-client/0.1",
    },
  });
  if (!res.ok) {
    throw new RegistryError(`Global registry request failed (${res.status}) at ${url}`);
  }
  return res.json();
}

function scoreScope(scope: DocsRegistryEntry["sourceScope"]): number {
  switch (scope) {
    case "user-local":
      return 500;
    case "installed-local":
      return 400;
    case "cached-global":
      return 300;
    case "live-global":
      return 200;
    case "builtin":
      return 100;
    default:
      return 0;
  }
}

function precedenceSort(a: DocsRegistryEntry, b: DocsRegistryEntry): number {
  const sa = scoreScope(a.sourceScope);
  const sb = scoreScope(b.sourceScope);
  if (sa !== sb) return sb - sa;
  return a.id.localeCompare(b.id);
}

function mergeByPrecedence(entries: DocsRegistryEntry[]): DocsRegistryEntry[] {
  const sorted = [...entries].sort(precedenceSort);
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

export async function fetchGlobalDocsRegistry(
  config: D0Config,
): Promise<{ entries: DocsRegistryEntry[]; revision?: string; fetchedAt: string }> {
  const query = encodeURIComponent("a");
  const url = `${config.registryUrl.replace(/\/+$/, "")}/docs/search?q=${query}`;
  const payload = await fetchJson(url);
  const revision =
    payload && typeof payload === "object" && typeof (payload as { revision?: unknown }).revision === "string"
      ? ((payload as { revision: string }).revision ?? undefined)
      : undefined;
  const entries = parseGlobalEntries(payload, "live-global");
  const fetchedAt = new Date().toISOString();
  await writeGlobalRegistryCache({ entries, revision, fetchedAt });
  return { entries, revision, fetchedAt };
}

export async function searchGlobalDocsRegistry(
  config: D0Config,
  query: string,
): Promise<{ entries: DocsRegistryEntry[]; revision?: string; fetchedAt: string; fromCache: boolean }> {
  const base = config.registryUrl.replace(/\/+$/, "");
  const url = `${base}/docs/search?q=${encodeURIComponent(query)}`;
  try {
    const payload = await fetchJson(url);
    const revision =
      payload && typeof payload === "object" && typeof (payload as { revision?: unknown }).revision === "string"
        ? ((payload as { revision: string }).revision ?? undefined)
        : undefined;
    const entries = parseGlobalEntries(payload, "live-global");
    const fetchedAt = new Date().toISOString();
    await writeGlobalRegistryCache({ entries, revision, fetchedAt });
    return { entries, revision, fetchedAt, fromCache: false };
  } catch {
    const cached = await readGlobalRegistryCache();
    if (!cached) return { entries: [], revision: undefined, fetchedAt: new Date().toISOString(), fromCache: true };
    const filtered = cached.entries
      .map((entry) => ({ entry, score: scoreRegistryMatch(entry, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => (b.score === a.score ? a.entry.id.localeCompare(b.entry.id) : b.score - a.score))
      .map((item) => ({ ...item.entry, sourceScope: "cached-global" as const }));
    return { entries: filtered, revision: cached.revision, fetchedAt: cached.fetchedAt, fromCache: true };
  }
}

export async function resolveGlobalDocsRegistryEntry(
  config: D0Config,
  query: string,
): Promise<{ entry: DocsRegistryEntry | null; revision?: string; fetchedAt: string; fromCache: boolean }> {
  const result = await searchGlobalDocsRegistry(config, query);
  const entry = result.entries[0] ?? null;
  return { entry, revision: result.revision, fetchedAt: result.fetchedAt, fromCache: result.fromCache };
}

export async function listDocsRegistryEntries(config?: D0Config): Promise<DocsRegistryEntry[]> {
  const [bundles, userEntries] = await Promise.all([installedBundleEntries(), readUserRegistryEntries()]);
  const local = mergeByPrecedence([...userEntries, ...bundles, ...BUILTIN_DOCS_REGISTRY]);
  if (!config) return local;
  const cached = await readGlobalRegistryCache();
  const cachedEntries = cached?.entries ?? [];
  const liveEntries =
    cached && isFreshCache(cached)
      ? []
      : await fetchGlobalDocsRegistry(config)
          .then((x) => x.entries)
          .catch(() => []);
  return mergeByPrecedence([...local, ...cachedEntries, ...liveEntries]);
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

export async function resolveDocsEntryWithFallback(config: D0Config, query: string): Promise<DocsResolveResult | null> {
  const localEntries = await listDocsRegistryEntries();
  let best: { entry: DocsRegistryEntry; score: number } | null = null;
  for (const entry of localEntries) {
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
  if (best) {
    return {
      entry: best.entry,
      resolvedFrom: "local",
      fetchedAt: new Date().toISOString(),
    };
  }

  const global = await resolveGlobalDocsRegistryEntry(config, query);
  if (!global.entry) return null;
  return {
    entry: global.entry,
    resolvedFrom: global.fromCache ? "cache" : "global",
    registryRevision: global.revision,
    fetchedAt: global.fetchedAt,
  };
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
