import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import MiniSearch from "minisearch";
import type { DocsRegistryEntry } from "./registry-client.js";
import { d0Home } from "./storage.js";
import type { SearchDocument } from "./search-engine.js";
import { REMOTE_SEARCH_INDEX_MINI_OPTIONS } from "./search-engine.js";

export const REMOTE_SEARCH_INDEX_FORMAT_V1 = "d0-remote-search-index-v1" as const;

export type RemoteSearchIndexFileV1 = {
  format: typeof REMOTE_SEARCH_INDEX_FORMAT_V1;
  docId: string;
  baseUrl: string;
  revision: string;
  /** Serialized MiniSearch index (`mini.toJSON()`), re-loaded with {@link REMOTE_SEARCH_INDEX_MINI_OPTIONS}. */
  miniSearch: unknown;
};

const memory = new Map<string, MiniSearch<SearchDocument>>();
const inflight = new Map<string, Promise<MiniSearch<SearchDocument> | null>>();

function cacheDirForRemoteIndex(): string {
  return path.join(d0Home(), "remote-search-index");
}

function cacheFilePath(entry: DocsRegistryEntry): string {
  const rev = (entry.searchIndexRevision ?? "default").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64);
  const key = `${entry.searchIndexUrl}|${rev}`;
  const h = createHash("sha256").update(key).digest("hex").slice(0, 24);
  return path.join(cacheDirForRemoteIndex(), `${entry.id}-${h}.json`);
}

function memoryKey(entry: DocsRegistryEntry): string {
  return `${entry.id}|${entry.searchIndexRevision ?? "default"}|${entry.searchIndexUrl}`;
}

function parseIndexFile(text: string): MiniSearch<SearchDocument> {
  const parsed = JSON.parse(text) as RemoteSearchIndexFileV1;
  if (!parsed || parsed.format !== REMOTE_SEARCH_INDEX_FORMAT_V1) {
    throw new Error(`remote search index: expected format "${REMOTE_SEARCH_INDEX_FORMAT_V1}"`);
  }
  if (parsed.miniSearch == null) {
    throw new Error("remote search index: missing miniSearch payload");
  }
  return MiniSearch.loadJSON(JSON.stringify(parsed.miniSearch), {
    fields: [...REMOTE_SEARCH_INDEX_MINI_OPTIONS.fields],
    storeFields: [...REMOTE_SEARCH_INDEX_MINI_OPTIONS.storeFields],
    searchOptions: {
      boost: { ...REMOTE_SEARCH_INDEX_MINI_OPTIONS.searchOptions.boost },
      fuzzy: REMOTE_SEARCH_INDEX_MINI_OPTIONS.searchOptions.fuzzy,
      prefix: REMOTE_SEARCH_INDEX_MINI_OPTIONS.searchOptions.prefix,
    },
  });
}

async function fetchAndParse(entry: DocsRegistryEntry): Promise<MiniSearch<SearchDocument>> {
  const url = entry.searchIndexUrl!.trim();
  const res = await fetch(url, {
    headers: { "user-agent": "d0-remote-search-index/0.1" },
  });
  if (!res.ok) {
    throw new Error(`remote search index: HTTP ${res.status} for ${url}`);
  }
  const text = await res.text();
  const mini = parseIndexFile(text);
  const dir = cacheDirForRemoteIndex();
  await mkdir(dir, { recursive: true });
  const dest = cacheFilePath(entry);
  await writeFile(dest, text, "utf8");
  return mini;
}

/**
 * When the registry entry declares `searchIndexUrl`, download (or read cache) and return a
 * MiniSearch instance. Returns null if not configured. Throws on corrupt index; callers may catch.
 */
export async function loadRemoteSearchIndex(entry: DocsRegistryEntry): Promise<MiniSearch<SearchDocument> | null> {
  const url = entry.searchIndexUrl?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;

  const mkey = memoryKey(entry);
  const cached = memory.get(mkey);
  if (cached) return cached;

  const pending = inflight.get(mkey);
  if (pending) return pending;

  const work = (async (): Promise<MiniSearch<SearchDocument> | null> => {
    try {
      const p = cacheFilePath(entry);
      if (existsSync(p)) {
        const text = await readFile(p, "utf8");
        const mini = parseIndexFile(text);
        memory.set(mkey, mini);
        return mini;
      }
      const mini = await fetchAndParse(entry);
      memory.set(mkey, mini);
      return mini;
    } finally {
      inflight.delete(mkey);
    }
  })();

  inflight.set(mkey, work);
  return work;
}

export function buildRemoteIndexPayload(
  docId: string,
  baseUrl: string,
  revision: string,
  mini: MiniSearch<SearchDocument>,
): RemoteSearchIndexFileV1 {
  return {
    format: REMOTE_SEARCH_INDEX_FORMAT_V1,
    docId,
    baseUrl,
    revision,
    miniSearch: mini.toJSON() as object,
  };
}
