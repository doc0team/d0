import type { DocNode, DocStoreManifest } from "./doc-store.js";

function normalizeListPath(p: string): string {
  const t = p.trim();
  if (!t || t === ".") return "/";
  const n = t.replace(/\\/g, "/");
  return n.startsWith("/") ? n : `/${n}`;
}

function findNode(root: DocNode, nodePath: string): DocNode | null {
  const target = normalizeListPath(nodePath);
  if (target === "/") return root;
  let cur: DocNode = root;
  const parts = target.split("/").filter(Boolean);
  let built = "";
  for (const seg of parts) {
    built = built === "" ? `/${seg}` : `${built}/${seg}`;
    const next = cur.children.find((ch) => ch.path === built) ?? null;
    if (!next) return null;
    cur = next;
  }
  return cur.path === target ? cur : null;
}

export function listDocStoreChildren(manifest: DocStoreManifest, nodePath: string): DocNode[] {
  const target = normalizeListPath(nodePath);
  const node = findNode(manifest.tree, target);
  return node?.children ?? [];
}

export function docStorePagePathKeyForUrl(manifest: DocStoreManifest, url: string): string | null {
  try {
    const u = new URL(url);
    let p = u.pathname || "/";
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    const base = p || "/";
    const key = u.search ? `${base}${u.search}` : base;
    return manifest.pages[key] ? key : null;
  } catch {
    return null;
  }
}
