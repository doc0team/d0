import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import type { D0Manifest } from "./manifest.js";
import { readManifest } from "./manifest.js";

export interface InstalledBundleRef {
  name: string;
  version: string;
  root: string;
  manifest: D0Manifest;
}

const D0_DIR = ".d0";
const BUNDLES = "bundles";
const BIN = "bin";
const INDEX = "index.json";

export function d0Home(): string {
  return path.join(os.homedir(), D0_DIR);
}

export function bundlesDir(): string {
  return path.join(d0Home(), BUNDLES);
}

export function binDir(): string {
  return path.join(d0Home(), BIN);
}

export function indexPath(): string {
  return path.join(d0Home(), INDEX);
}

interface IndexFile {
  bundles: Record<string, { version: string; path: string; bin?: string }>;
}

async function readIndex(): Promise<IndexFile> {
  const p = indexPath();
  if (!existsSync(p)) return { bundles: {} };
  try {
    const raw = await readFile(p, "utf8");
    const j = JSON.parse(raw) as IndexFile;
    if (!j || typeof j !== "object" || !j.bundles || typeof j.bundles !== "object") {
      return { bundles: {} };
    }
    return j;
  } catch {
    return { bundles: {} };
  }
}

async function writeIndex(idx: IndexFile): Promise<void> {
  await mkdir(d0Home(), { recursive: true });
  await writeFile(indexPath(), JSON.stringify(idx, null, 2), "utf8");
}

/** Index key: lowercase manifest name */
function indexKey(manifestName: string): string {
  return manifestName.toLowerCase();
}

export async function installBundleFromPath(
  sourceDir: string,
  manifest: D0Manifest,
): Promise<InstalledBundleRef> {
  const key = indexKey(manifest.name);
  const dirName = manifest.name.replace(/^@/, "").replace(/\//g, "__");
  const dest = path.join(bundlesDir(), dirName, manifest.version);
  await mkdir(path.dirname(dest), { recursive: true });
  if (existsSync(dest)) await rm(dest, { recursive: true, force: true });
  await cp(sourceDir, dest, { recursive: true, force: true });

  const idx = await readIndex();
  idx.bundles[key] = {
    version: manifest.version,
    path: dest,
    bin: manifest.bin,
  };
  await writeIndex(idx);

  return { name: manifest.name, version: manifest.version, root: dest, manifest };
}

export async function listInstalled(): Promise<InstalledBundleRef[]> {
  const idx = await readIndex();
  const out: InstalledBundleRef[] = [];
  for (const [, entry] of Object.entries(idx.bundles)) {
    if (!entry?.path) continue;
    if (!existsSync(entry.path)) continue;
    try {
      const manifest = await readManifest(entry.path);
      out.push({
        name: manifest.name,
        version: manifest.version,
        root: entry.path,
        manifest,
      });
    } catch {
      continue;
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function findInstalledBundle(nameOrBin: string): Promise<InstalledBundleRef | null> {
  const q = nameOrBin.trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  const idx = await readIndex();

  const tryPath = async (entry: { path: string } | undefined): Promise<InstalledBundleRef | null> => {
    if (!entry?.path || !existsSync(entry.path)) return null;
    const manifest = await readManifest(entry.path);
    return { name: manifest.name, version: manifest.version, root: entry.path, manifest };
  };

  const direct = idx.bundles[lower];
  const byIndex = await tryPath(direct);
  if (byIndex) return byIndex;

  const all = await listInstalled();
  const exactName = all.find((b) => b.manifest.name.toLowerCase() === lower);
  if (exactName) return exactName;

  const byBin = all.find((b) => b.manifest.bin?.toLowerCase() === lower);
  if (byBin) return byBin;

  const short = lower.startsWith("@") ? null : all.find((b) => b.manifest.name.toLowerCase().endsWith("/" + lower));
  return short ?? null;
}

export async function removeBundle(name: string): Promise<boolean> {
  const ref = await findInstalledBundle(name);
  if (!ref) return false;
  const idx = await readIndex();
  const key = indexKey(ref.manifest.name);
  delete idx.bundles[key];
  if (existsSync(ref.root)) await rm(ref.root, { recursive: true, force: true });
  await writeIndex(idx);
  return true;
}

export async function ensureD0Dirs(): Promise<void> {
  await mkdir(bundlesDir(), { recursive: true });
  await mkdir(binDir(), { recursive: true });
}
