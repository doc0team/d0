import { fetchHostedEntry } from "../core/hosted-client.js";
import type { D0Config } from "../core/config.js";

type Manifest = { pages?: Record<string, { relPath?: string; title?: string }> };

async function fetchManifest(url: string): Promise<Manifest> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as Manifest;
}

function pageHash(relPath?: string): string {
  if (!relPath) return "";
  const m = relPath.match(/p_([a-f0-9]{16,64})\.md$/i);
  return m?.[1] ?? relPath;
}

export async function cmdDiff(
  id: string,
  versionA: string,
  versionB: string,
  opts: { json?: boolean; drill?: string },
  config: D0Config,
): Promise<void> {
  const entry = await fetchHostedEntry(id, config);
  if (!entry?.versions) {
    console.error(`doc0 diff: no hosted entry for ${id}`);
    process.exitCode = 1;
    return;
  }
  const a = entry.versions[versionA];
  const b = entry.versions[versionB];
  if (!a?.manifestUrl || !b?.manifestUrl) {
    console.error(`doc0 diff: missing manifest for ${id} versions ${versionA} / ${versionB}`);
    process.exitCode = 1;
    return;
  }
  const [ma, mb] = await Promise.all([fetchManifest(a.manifestUrl), fetchManifest(b.manifestUrl)]);
  const pagesA = ma.pages ?? {};
  const pagesB = mb.pages ?? {};
  const keysA = new Set(Object.keys(pagesA));
  const keysB = new Set(Object.keys(pagesB));
  const added = [...keysB].filter((k) => !keysA.has(k)).sort();
  const removed = [...keysA].filter((k) => !keysB.has(k)).sort();
  const changed = [...keysA]
    .filter((k) => keysB.has(k) && pageHash(pagesA[k]?.relPath) !== pageHash(pagesB[k]?.relPath))
    .sort();

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          id,
          from: versionA,
          to: versionB,
          added: added.map((k) => ({ path: k, title: pagesB[k]?.title })),
          removed: removed.map((k) => ({ path: k, title: pagesA[k]?.title })),
          changed: changed.map((k) => ({ path: k, title: pagesB[k]?.title ?? pagesA[k]?.title })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`doc0 diff ${id} ${versionA}..${versionB}`);
  console.log(`added: ${added.length} · removed: ${removed.length} · changed: ${changed.length}`);

  const drill = opts.drill?.trim();
  if (drill) {
    const key = drill.startsWith("/") ? drill : `/${drill}`;
    if (!keysA.has(key) && !keysB.has(key)) {
      console.log(`\nNo page "${key}" in either version.`);
      return;
    }
    console.log(`\nDrill: ${key}`);
    console.log(`- ${versionA}: ${pagesA[key]?.title ?? "(missing)"} · ${pagesA[key]?.relPath ?? "-"}`);
    console.log(`- ${versionB}: ${pagesB[key]?.title ?? "(missing)"} · ${pagesB[key]?.relPath ?? "-"}`);
    return;
  }

  const preview = (label: string, keys: string[], pages: Record<string, { title?: string }>) => {
    if (!keys.length) return;
    console.log(`\n${label}:`);
    for (const k of keys.slice(0, 20)) console.log(`- ${k} ${pages[k]?.title ? `(${pages[k]!.title})` : ""}`);
    if (keys.length > 20) console.log(`... and ${keys.length - 20} more`);
  };

  preview("Added", added, pagesB);
  preview("Removed", removed, pagesA);
  preview("Changed", changed, pagesB);
}
