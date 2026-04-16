import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { docsStoreDir } from "./storage.js";

export interface DocCodeBlock {
  id: string;
  lang?: string;
  code: string;
}

export interface DocPageRecord {
  path: string;
  title: string;
  url?: string;
  relPath: string;
  codeBlocks: DocCodeBlock[];
}

export interface DocStoreManifest {
  version: 1;
  storeId: string;
  sourceType: "url" | "bundle";
  source: string;
  ingestedAt: string;
  tree: DocNode;
  pages: Record<string, DocPageRecord>;
}

export interface DocNode {
  id: string;
  title: string;
  path: string;
  content: string;
  children: DocNode[];
  pageRef?: string;
}

function stableStoreIdFromUrl(input: string): string {
  const u = input.trim().toLowerCase();
  return createHash("sha256").update(u).digest("hex").slice(0, 16);
}

export function docStoreRoot(storeId: string): string {
  return path.join(docsStoreDir(), storeId);
}

export function docStoreManifestPath(storeId: string): string {
  return path.join(docStoreRoot(storeId), "manifest.json");
}

export async function readDocStoreManifest(storeId: string): Promise<DocStoreManifest | null> {
  const p = docStoreManifestPath(storeId);
  if (!existsSync(p)) return null;
  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw) as DocStoreManifest;
  } catch {
    return null;
  }
}

export async function writeDocStoreManifest(manifest: DocStoreManifest): Promise<void> {
  const root = docStoreRoot(manifest.storeId);
  await mkdir(path.join(root, "pages"), { recursive: true });
  await writeFile(docStoreManifestPath(manifest.storeId), JSON.stringify(manifest, null, 2), "utf8");
}

export async function writeDocStorePage(storeId: string, relPath: string, markdown: string): Promise<void> {
  const root = docStoreRoot(storeId);
  const abs = path.join(root, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, markdown, "utf8");
}

export async function readDocStorePage(storeId: string, relPath: string): Promise<string> {
  const abs = path.join(docStoreRoot(storeId), relPath);
  return readFile(abs, "utf8");
}

export function storeIdForUrl(url: string): string {
  return stableStoreIdFromUrl(url);
}

export function storeIdForBundle(bundleName: string): string {
  return stableStoreIdFromUrl(`bundle:${bundleName.trim().toLowerCase()}`);
}
