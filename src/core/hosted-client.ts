import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";
import { cacheDir } from "./storage.js";
import { DEFAULT_HOSTED_INDEX_URL, type D0Config } from "./config.js";

const HOSTED_CACHE_TTL_MS = 60 * 60 * 1000;

export interface HostedBundleMeta {
  id: string;
  version: string;
  url: string;
  sha: string;
  embedModel?: string;
  manifestUrl?: string;
}

interface HostedVersionRecord {
  sha?: string;
  url?: string;
  embedModel?: string;
  manifestUrl?: string;
}

interface HostedEntryRecord {
  latest?: string;
  versions?: Record<string, HostedVersionRecord>;
}

function hostedCachePath(id: string): string {
  return path.join(cacheDir(), "hosted", `${id.toLowerCase()}.json`);
}

async function readCachedEntry(id: string): Promise<HostedEntryRecord | null> {
  const p = hostedCachePath(id);
  try {
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw) as { fetchedAt?: string; data?: HostedEntryRecord };
    if (!parsed?.fetchedAt || !parsed?.data) return null;
    const age = Date.now() - Date.parse(parsed.fetchedAt);
    if (!Number.isFinite(age) || age > HOSTED_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

async function writeCachedEntry(id: string, data: HostedEntryRecord): Promise<void> {
  const p = hostedCachePath(id);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify({ fetchedAt: new Date().toISOString(), data }, null, 2), "utf8");
}

export async function fetchHostedEntry(id: string, config?: D0Config): Promise<HostedEntryRecord | null> {
  const cached = await readCachedEntry(id);
  if (cached) return cached;

  const base = (config?.hostedIndexUrl ?? DEFAULT_HOSTED_INDEX_URL).replace(/\/+$/, "");
  const url = `${base}/${encodeURIComponent(id.toLowerCase())}.json`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const parsed = (await res.json()) as HostedEntryRecord;
    await writeCachedEntry(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function resolveHostedBundle(
  id: string,
  version?: string,
  config?: D0Config,
): Promise<HostedBundleMeta | null> {
  const normalized = id.trim().toLowerCase();
  if (!normalized) return null;
  const entry = await fetchHostedEntry(normalized, config);
  if (!entry?.versions || Object.keys(entry.versions).length === 0) return null;
  const pickedVersion = version?.trim() || entry.latest || Object.keys(entry.versions)[0];
  const record = entry.versions[pickedVersion];
  if (!record?.url || !record?.sha) return null;
  return {
    id: normalized,
    version: pickedVersion,
    url: record.url,
    sha: record.sha,
    embedModel: record.embedModel,
    manifestUrl: record.manifestUrl,
  };
}

export async function downloadHostedBundle(meta: HostedBundleMeta, destDir: string): Promise<void> {
  const res = await fetch(meta.url);
  if (!res.ok) {
    throw new Error(`hosted bundle download failed: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = createHash("sha256").update(buf).digest("hex");
  if (actual !== meta.sha) {
    throw new Error(`hosted bundle checksum mismatch for ${meta.id}@${meta.version}`);
  }
  await mkdir(destDir, { recursive: true });
  const archivePath = path.join(destDir, `${meta.sha}.d0.tgz`);
  await writeFile(archivePath, buf);
  await tar.x({ file: archivePath, cwd: destDir });
}
