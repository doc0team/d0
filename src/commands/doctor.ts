import { stat } from "node:fs/promises";
import { findInstalledBundle } from "../core/storage.js";
import { listDocsRegistryEntries, type DocsRegistryEntry } from "../core/registry-client.js";
import { probeDocsSource } from "../core/web-docs.js";

type BundleCheck = {
  kind: "bundle";
  entry: DocsRegistryEntry;
  status: "ok" | "fail";
  installedAt?: string;
  error?: string;
};

type UrlCheck = {
  kind: "url";
  entry: DocsRegistryEntry;
  status: "ok" | "warn" | "fail";
  reachable: boolean;
  httpStatus?: number;
  llmsFull: boolean;
  llmsFullChunks?: number;
  llmsTxt: boolean;
  llmsTxtUrls?: number;
  sitemap: boolean;
  sitemapUrls?: number;
  error?: string;
};

type Check = BundleCheck | UrlCheck;

async function checkBundle(entry: DocsRegistryEntry): Promise<BundleCheck> {
  try {
    const ref = await findInstalledBundle(entry.source);
    if (!ref) {
      return { kind: "bundle", entry, status: "fail", error: "bundle not installed" };
    }
    const st = await stat(ref.root);
    if (!st.isDirectory()) {
      return { kind: "bundle", entry, status: "fail", error: "install path is not a directory" };
    }
    return { kind: "bundle", entry, status: "ok", installedAt: ref.root };
  } catch (err) {
    return {
      kind: "bundle",
      entry,
      status: "fail",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkUrl(entry: DocsRegistryEntry): Promise<UrlCheck> {
  try {
    const probe = await probeDocsSource(entry.source);
    const hasFast = probe.llmsFullTxt.available || probe.llmsTxt.available;
    let status: UrlCheck["status"];
    if (!probe.reachable) status = "fail";
    else if (hasFast || probe.sitemap.available) status = "ok";
    else status = "warn";
    return {
      kind: "url",
      entry,
      status,
      reachable: probe.reachable,
      ...(probe.status !== undefined ? { httpStatus: probe.status } : {}),
      llmsFull: probe.llmsFullTxt.available,
      ...(probe.llmsFullTxt.chunkCount !== undefined ? { llmsFullChunks: probe.llmsFullTxt.chunkCount } : {}),
      llmsTxt: probe.llmsTxt.available,
      ...(probe.llmsTxt.urlCount !== undefined ? { llmsTxtUrls: probe.llmsTxt.urlCount } : {}),
      sitemap: probe.sitemap.available,
      ...(probe.sitemap.urlCount !== undefined ? { sitemapUrls: probe.sitemap.urlCount } : {}),
      ...(probe.error ? { error: probe.error } : {}),
    };
  } catch (err) {
    return {
      kind: "url",
      entry,
      status: "fail",
      reachable: false,
      llmsFull: false,
      llmsTxt: false,
      sitemap: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function formatMarker(status: "ok" | "warn" | "fail"): string {
  if (status === "ok") return "[ok]  ";
  if (status === "warn") return "[warn]";
  return "[fail]";
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function renderCheck(c: Check): string {
  const marker = formatMarker(c.status);
  const id = pad(c.entry.id, 18);
  const src = pad(c.entry.source, 42);
  if (c.kind === "bundle") {
    if (c.status === "ok") return `${marker} ${id} ${src} installed`;
    return `${marker} ${id} ${src} ${c.error ?? "error"}`;
  }
  const bits: string[] = [];
  if (!c.reachable) {
    return `${marker} ${id} ${src} unreachable${c.httpStatus ? ` (HTTP ${c.httpStatus})` : ""}${c.error ? `: ${c.error}` : ""}`;
  }
  if (c.llmsFull) bits.push(`llms-full.txt (${c.llmsFullChunks ?? 0} chunks)`);
  else if (c.llmsTxt) bits.push(`llms.txt (${c.llmsTxtUrls ?? 0} urls)`);
  else bits.push("no llms.txt");
  if (c.sitemap) bits.push(`sitemap (${c.sitemapUrls ?? 0})`);
  return `${marker} ${id} ${src} ${bits.join(", ")}`;
}

export async function cmdDoctor(opts: { json?: boolean }): Promise<void> {
  const entries = await listDocsRegistryEntries();
  const results = await Promise.all(
    entries.map((entry) => (entry.sourceType === "bundle" ? checkBundle(entry) : checkUrl(entry))),
  );

  if (opts.json) {
    console.log(JSON.stringify({ total: results.length, checks: results }, null, 2));
    return;
  }

  console.log(`doc0 doctor — ${results.length} registry entries\n`);
  for (const r of results) console.log(renderCheck(r));

  const okCount = results.filter((r) => r.status === "ok").length;
  const warnCount = results.filter((r) => r.status === "warn").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  console.log(`\nSummary: ${okCount} ok, ${warnCount} warn, ${failCount} fail`);

  if (failCount > 0) process.exitCode = 1;
}
