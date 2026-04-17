import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { D0Config } from "../core/config.js";
import { RegistryError, syncCommunityRegistry } from "../core/registry-client.js";
import { communityRegistryCachePath } from "../core/storage.js";

export async function cmdRegistrySync(opts: { json?: boolean }, config: D0Config): Promise<void> {
  if (!config.registryUrl) {
    const msg = "no registryUrl configured. Set `registryUrl` in ~/.d0rc or export D0_REGISTRY_URL.";
    if (opts.json) console.log(JSON.stringify({ error: msg }));
    else console.error(`doc0 registry sync: ${msg}`);
    process.exitCode = 1;
    return;
  }
  try {
    const cache = await syncCommunityRegistry(config);
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            url: cache.url,
            fetchedAt: cache.fetchedAt,
            entryCount: cache.entries.length,
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(`doc0 registry sync: fetched ${cache.entries.length} entries from ${cache.url}`);
    console.log(`Cached at ${communityRegistryCachePath()}`);
    console.log(`Fetched ${cache.fetchedAt}`);
  } catch (err) {
    const msg = err instanceof RegistryError || err instanceof Error ? err.message : String(err);
    if (opts.json) console.log(JSON.stringify({ error: msg }));
    else console.error(`doc0 registry sync: ${msg}`);
    process.exitCode = 1;
  }
}

export async function cmdRegistryStatus(opts: { json?: boolean }, config: D0Config): Promise<void> {
  const cachePath = communityRegistryCachePath();
  let cache: unknown = null;
  if (existsSync(cachePath)) {
    try {
      const raw = await readFile(cachePath, "utf8");
      cache = JSON.parse(raw);
    } catch {
      cache = null;
    }
  }
  const info = {
    registryUrl: config.registryUrl ?? null,
    cachePath,
    cached: cache ? (cache as { url?: string; fetchedAt?: string; entries?: unknown[] }) : null,
  };
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          registryUrl: info.registryUrl,
          cachePath: info.cachePath,
          cache: info.cached
            ? {
                url: info.cached.url ?? null,
                fetchedAt: info.cached.fetchedAt ?? null,
                entryCount: Array.isArray(info.cached.entries) ? info.cached.entries.length : 0,
              }
            : null,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(`registryUrl: ${info.registryUrl ?? "(unset)"}`);
  console.log(`cache path : ${info.cachePath}`);
  if (!info.cached) {
    console.log("cache      : (none) — run `doc0 registry sync` to fetch");
    return;
  }
  const count = Array.isArray(info.cached.entries) ? info.cached.entries.length : 0;
  console.log(`cache url  : ${info.cached.url ?? "(unknown)"}`);
  console.log(`fetched at : ${info.cached.fetchedAt ?? "(unknown)"}`);
  console.log(`entries    : ${count}`);
}
