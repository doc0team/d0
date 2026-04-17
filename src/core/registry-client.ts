import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { communityRegistryCachePath, d0Home, docsRegistryPath, listInstalled } from "./storage.js";
import { DEFAULT_COMMUNITY_REGISTRY_URL, loadConfig, type D0Config } from "./config.js";

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
  sourceScope?: "user-local" | "installed-local" | "community" | "builtin";
}

export interface CommunityRegistryCache {
  url: string;
  fetchedAt: string;
  entries: DocsRegistryEntry[];
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
 * Seed registry shipped inside the npm package as `registry.json`. Loaded from disk on demand
 * (memoized per process). Sources at ship time are a snapshot of the community registry; the
 * community URL overrides them live, but this file is what makes doc0 work offline / on first
 * run before the community fetch completes.
 */
let seedRegistryCache: DocsRegistryEntry[] | null = null;

function packageRegistryJsonPath(): string {
  // This file ships to consumers at `<pkg>/dist/core/registry-client.js`, so registry.json is
  // two levels up. In dev (tsx, running from src/) registry.json is also two levels up.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "..", "..", "registry.json"),
    path.resolve(here, "..", "registry.json"),
    path.resolve(process.cwd(), "registry.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}

async function loadSeedRegistry(): Promise<DocsRegistryEntry[]> {
  if (seedRegistryCache) return seedRegistryCache;
  try {
    const raw = await readFile(packageRegistryJsonPath(), "utf8");
    const parsed = JSON.parse(raw);
    const entries = parseCommunityRegistryPayload(parsed).map((e) => ({ ...e, sourceScope: "builtin" as const }));
    seedRegistryCache = entries;
    return entries;
  } catch {
    seedRegistryCache = [];
    return [];
  }
}

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

/** 24 hours. Override with D0_COMMUNITY_REGISTRY_TTL_MS. */
function communityRegistryTtlMs(): number {
  const raw = process.env.D0_COMMUNITY_REGISTRY_TTL_MS?.trim();
  if (!raw) return 24 * 60 * 60 * 1000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 24 * 60 * 60 * 1000;
}

function parseCommunityRegistryPayload(raw: unknown): DocsRegistryEntry[] {
  const entries: unknown = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { entries?: unknown }).entries)
      ? (raw as { entries: unknown[] }).entries
      : [];
  if (!Array.isArray(entries)) return [];
  const out: DocsRegistryEntry[] = [];
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const rec = e as Record<string, unknown>;
    const entry: DocsRegistryEntry = {
      id: String(rec.id ?? ""),
      aliases: Array.isArray(rec.aliases) ? rec.aliases.filter((a): a is string => typeof a === "string") : [],
      sourceType: rec.sourceType === "bundle" ? "bundle" : "url",
      source: String(rec.source ?? ""),
      description: typeof rec.description === "string" ? rec.description : undefined,
      sourceScope: "community",
    };
    const normalized = normalizeRegistryEntry(entry);
    if (normalized) out.push({ ...normalized, sourceScope: "community" });
  }
  return out;
}

async function readCommunityRegistryCache(): Promise<CommunityRegistryCache | null> {
  const p = communityRegistryCachePath();
  if (!existsSync(p)) return null;
  try {
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw) as CommunityRegistryCache;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entries)) return null;
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : "",
      entries: parseCommunityRegistryPayload({ entries: parsed.entries }),
    };
  } catch {
    return null;
  }
}

async function writeCommunityRegistryCache(cache: CommunityRegistryCache): Promise<void> {
  await mkdir(path.dirname(communityRegistryCachePath()), { recursive: true }).catch(() => undefined);
  await mkdir(d0Home(), { recursive: true }).catch(() => undefined);
  await writeFile(communityRegistryCachePath(), JSON.stringify(cache, null, 2) + "\n", "utf8");
}

async function fetchCommunityRegistryPayload(url: string): Promise<DocsRegistryEntry[]> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "d0-cli/0.1",
      accept: "application/json, text/plain;q=0.9, */*;q=0.5",
    },
  });
  if (!res.ok) throw new RegistryError(`community registry fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RegistryError(`community registry did not return valid JSON (${url})`);
  }
  return parseCommunityRegistryPayload(parsed);
}

/** One warning per process per URL — avoids spamming every MCP tool call or CLI invocation. */
const warnedCommunityFetchFailures = new Set<string>();

function warnCommunityFetchFailureOnce(url: string, err: unknown): void {
  if (warnedCommunityFetchFailures.has(url)) return;
  warnedCommunityFetchFailures.add(url);
  // MCP mode already routes stderr into the host's log pane; keep silent there unless the user
  // explicitly asked to see it via D0_DEBUG=1.
  const isMcp = process.env.D0_MCP_INSTALLED_ONLY || process.argv.some((a) => a === "mcp");
  const debug = process.env.D0_DEBUG === "1" || process.env.D0_DEBUG === "true";
  if (isMcp && !debug) return;
  const msg = err instanceof Error ? err.message : String(err);
  const hint =
    url === DEFAULT_COMMUNITY_REGISTRY_URL
      ? " (default community registry; disable with `D0_REGISTRY_URL=off` or `registryUrl: false` in ~/.d0rc)"
      : "";
  console.error(`[d0] community registry fetch failed${hint}: ${msg}`);
}

/**
 * Return community registry entries. Uses cache when fresh (< TTL). When stale, attempts a
 * fetch; on network failure, falls back to stale cache so offline usage keeps working. Returns
 * [] when no `registryUrl` is configured (explicitly disabled) or when there is no cache and
 * the fetch fails.
 */
async function getCommunityRegistryEntries(config: D0Config): Promise<DocsRegistryEntry[]> {
  const url = config.registryUrl;
  if (!url) return [];
  const ttl = communityRegistryTtlMs();
  const cache = await readCommunityRegistryCache();
  const cacheFresh =
    cache && cache.url === url && cache.fetchedAt && Date.now() - Date.parse(cache.fetchedAt) <= ttl;
  if (cacheFresh && cache) return cache.entries;

  try {
    const entries = await fetchCommunityRegistryPayload(url);
    await writeCommunityRegistryCache({ url, fetchedAt: new Date().toISOString(), entries });
    return entries;
  } catch (err) {
    if (cache && cache.url === url) return cache.entries;
    warnCommunityFetchFailureOnce(url, err);
    return [];
  }
}

/** Force a refresh regardless of cache age. Throws on network/parse errors so the sync command can report them. */
export async function syncCommunityRegistry(config: D0Config): Promise<CommunityRegistryCache> {
  const url = config.registryUrl;
  if (!url) {
    throw new RegistryError("no registryUrl configured in ~/.d0rc (or D0_REGISTRY_URL)");
  }
  const entries = await fetchCommunityRegistryPayload(url);
  const cache: CommunityRegistryCache = { url, fetchedAt: new Date().toISOString(), entries };
  await writeCommunityRegistryCache(cache);
  return cache;
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
    case "community":
      return 200;
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

export interface ListDocsOptions {
  /** When true, omit built-in URL entries; only user overrides and installed bundles are returned. */
  installedOnly?: boolean;
}

export async function listDocsRegistryEntries(opts: ListDocsOptions = {}): Promise<DocsRegistryEntry[]> {
  const [bundles, userEntries, config, seedEntries] = await Promise.all([
    installedBundleEntries(),
    readUserRegistryEntries(),
    loadConfig(),
    loadSeedRegistry(),
  ]);
  if (opts.installedOnly) {
    return mergeByPrecedence([...userEntries, ...bundles]);
  }
  const communityEntries = await getCommunityRegistryEntries(config);
  return mergeByPrecedence([...userEntries, ...bundles, ...communityEntries, ...seedEntries]);
}

function isMcpInstalledOnly(): boolean {
  const raw = process.env.D0_MCP_INSTALLED_ONLY?.trim();
  return raw === "1" || raw?.toLowerCase() === "true";
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

export async function searchDocsRegistry(
  query: string,
  opts: ListDocsOptions = {},
): Promise<DocsRegistryEntry[]> {
  const entries = await listDocsRegistryEntries(opts);
  return entries
    .map((entry) => ({ entry, score: scoreRegistryMatch(entry, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => (b.score === a.score ? a.entry.id.localeCompare(b.entry.id) : b.score - a.score))
    .map((item) => item.entry);
}

export async function resolveDocsRegistryEntry(
  query: string,
  opts: ListDocsOptions = {},
): Promise<DocsRegistryEntry | null> {
  const entries = await listDocsRegistryEntries(opts);
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

/** Helper: registry list/search options derived from the current MCP environment. */
export function mcpRegistryOptions(): ListDocsOptions {
  return { installedOnly: isMcpInstalledOnly() };
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
 * Placeholder — doc0 does not run a bundle download service. Use `doc0 add --local <path>` for now.
 */
export async function fetchBundleMeta(
  _name: string,
  _version?: string,
): Promise<RegistryBundleMeta> {
  throw new RegistryError(
    "Registry downloads are not available. Use: doc0 add --local <path-to-bundle-dir>",
  );
}
