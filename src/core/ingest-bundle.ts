import { createHash } from "node:crypto";
import { loadBundle, readPageMarkdown, type LoadedBundle } from "./bundle.js";
import { normalizeDocMarkdown } from "./doc-normalize.js";
import {
  type DocNode,
  type DocPageRecord,
  type DocStoreManifest,
  storeIdForBundle,
  writeDocStoreManifest,
  writeDocStorePage,
} from "./doc-store.js";

function pageIdFromSlug(slug: string): string {
  const h = createHash("sha256").update(slug).digest("hex").slice(0, 16);
  return `b_${h}`;
}

type TrieNode = {
  segment: string;
  slug?: string;
  children: Map<string, TrieNode>;
};

function insertSlug(root: TrieNode, slug: string): void {
  const parts = slug.split("/").filter(Boolean);
  let node = root;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]!;
    if (!node.children.has(seg)) {
      node.children.set(seg, { segment: seg, children: new Map() });
    }
    node = node.children.get(seg)!;
    if (i === parts.length - 1) node.slug = slug;
  }
}

function trieToDocNode(node: TrieNode, pages: Record<string, DocPageRecord>, pathPrefix: string): DocNode {
  const path = pathPrefix === "" ? "/" : pathPrefix;
  const childKeys = [...node.children.keys()].sort((a, b) => a.localeCompare(b));
  const children = childKeys.map((k) => trieToDocNode(node.children.get(k)!, pages, `${pathPrefix}/${k}`));
  const pageRef = node.slug ? pages[`/${node.slug}`]?.path : undefined;
  const titleFromPage = node.slug ? pages[`/${node.slug}`]?.title : undefined;
  return {
    id: path.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "root",
    title: titleFromPage ?? (node.segment || "/"),
    path,
    content: "",
    children,
    pageRef,
  };
}

export async function ingestBundleToDocStore(bundleRoot: string): Promise<DocStoreManifest> {
  const bundle: LoadedBundle = await loadBundle(bundleRoot);
  const storeId = storeIdForBundle(bundle.manifest.name);
  const pages: Record<string, DocPageRecord> = {};

  const slugs = Object.keys(bundle.manifest.structure).sort();
  for (const slug of slugs) {
    const md = await readPageMarkdown(bundle, slug);
    const norm = normalizeDocMarkdown(md);
    const pathKey = `/${slug}`;
    const id = pageIdFromSlug(slug);
    const relPath = `pages/${id}.md`;
    await writeDocStorePage(storeId, relPath, norm.markdown);
    const titleMatch = norm.markdown.match(/^#\s+(.+)$/m);
    pages[pathKey] = {
      path: pathKey,
      title: titleMatch ? titleMatch[1]!.trim() : slug,
      relPath,
      codeBlocks: norm.codeBlocks.map((b) => ({ id: b.id, lang: b.lang, code: b.code })),
    };
  }

  const rootTrie: TrieNode = { segment: "", children: new Map() };
  const slugsByDepth = [...slugs].sort((a, b) => b.split("/").length - a.split("/").length);
  for (const slug of slugsByDepth) insertSlug(rootTrie, slug);
  const childKeys = [...rootTrie.children.keys()].sort((a, b) => a.localeCompare(b));
  const treeChildren = childKeys.map((k) => trieToDocNode(rootTrie.children.get(k)!, pages, `/${k}`));
  const tree: DocNode = {
    id: "root",
    title: "root",
    path: "/",
    content: "",
    children: treeChildren,
  };

  const manifest: DocStoreManifest = {
    version: 1,
    storeId,
    sourceType: "bundle",
    source: bundle.manifest.name,
    ingestedAt: new Date().toISOString(),
    tree,
    pages,
  };
  await writeDocStoreManifest(manifest);
  return manifest;
}
