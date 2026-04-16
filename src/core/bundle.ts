import { readFile } from "node:fs/promises";
import path from "node:path";
import type { D0Manifest } from "./manifest.js";
import { readManifest } from "./manifest.js";

export interface LoadedBundle {
  root: string;
  manifest: D0Manifest;
}

export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleError";
  }
}

export async function loadBundle(bundleRoot: string): Promise<LoadedBundle> {
  const manifest = await readManifest(bundleRoot);
  for (const [slug, rel] of Object.entries(manifest.structure)) {
    const abs = path.resolve(bundleRoot, rel);
    if (!abs.startsWith(path.resolve(bundleRoot))) {
      throw new BundleError(`structure["${slug}"] escapes bundle root`);
    }
    try {
      await readFile(abs, "utf8");
    } catch {
      throw new BundleError(`Missing or unreadable page file for "${slug}": ${rel}`);
    }
  }
  return { root: path.resolve(bundleRoot), manifest };
}

export function resolvePagePath(bundle: LoadedBundle, slug: string): string {
  const rel = bundle.manifest.structure[slug];
  if (!rel) throw new BundleError(`Unknown page slug: "${slug}"`);
  return path.join(bundle.root, rel);
}

export async function readPageMarkdown(bundle: LoadedBundle, slug: string): Promise<string> {
  const p = resolvePagePath(bundle, slug);
  return readFile(p, "utf8");
}

export function listSlugs(bundle: LoadedBundle): string[] {
  return Object.keys(bundle.manifest.structure).sort((a, b) => a.localeCompare(b));
}

export function slugTree(slugs: string[]): string[] {
  return [...slugs].sort((a, b) => a.localeCompare(b));
}
