/**
 * Hierarchical navigation rows for same-origin doc URLs (path prefix tree).
 */

export type UrlNavRow =
  | { kind: "dir"; pathKey: string; label: string; depth: number; leafCount: number }
  | { kind: "page"; url: string; label: string; depth: number };

export type PathTrieNode = {
  segment: string;
  /** Prefix pathname from site root, e.g. `/api/admin` */
  pathKey: string;
  urlsHere: string[];
  children: Map<string, PathTrieNode>;
};

function normalizePathname(pathname: string): string {
  let p = pathname || "/";
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep raw */
  }
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

function childPathKey(parentKey: string, segment: string): string {
  if (!parentKey || parentKey === "/") return `/${segment}`;
  return `${parentKey}/${segment}`;
}

export function buildPathTrie(pages: string[], origin: string): PathTrieNode {
  const root: PathTrieNode = {
    segment: "",
    pathKey: "",
    urlsHere: [],
    children: new Map(),
  };

  const baseOrigin = (() => {
    try {
      return new URL(origin).origin;
    } catch {
      return origin;
    }
  })();

  for (const pageUrl of pages) {
    let u: URL;
    try {
      u = new URL(pageUrl);
    } catch {
      continue;
    }
    if (u.origin !== baseOrigin) continue;
    const pathname = normalizePathname(u.pathname);
    if (pathname === "/") {
      root.urlsHere.push(pageUrl);
      continue;
    }
    const segments = pathname.slice(1).split("/").filter(Boolean);
    let node = root;
    let pathKey = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      pathKey = childPathKey(pathKey === "" ? "" : pathKey, seg);
      if (!node.children.has(seg)) {
        node.children.set(seg, {
          segment: seg,
          pathKey: pathKey === "" ? `/${seg}` : pathKey,
          urlsHere: [],
          children: new Map(),
        });
      }
      node = node.children.get(seg)!;
      if (i === segments.length - 1) {
        node.urlsHere.push(pageUrl);
      }
    }
  }

  return root;
}

export function countLeavesInSubtree(node: PathTrieNode): number {
  let n = node.urlsHere.length;
  for (const ch of node.children.values()) n += countLeavesInSubtree(ch);
  return n;
}

/** Auto-expand first path segment (e.g. `/api`) when it has nested pages. */
export function defaultExpandedPrefixes(trie: PathTrieNode): Set<string> {
  const s = new Set<string>();
  for (const ch of trie.children.values()) {
    if (ch.children.size > 0) s.add(ch.pathKey);
  }
  return s;
}

export function firstPageUrlInRows(rows: UrlNavRow[]): string | undefined {
  for (const r of rows) {
    if (r.kind === "page") return r.url;
  }
  return undefined;
}

function labelPageRelativeToAncestor(url: string, ancestorPathKey: string): string {
  try {
    const p = normalizePathname(new URL(url).pathname);
    if (!ancestorPathKey) {
      return p.startsWith("/") ? (p.slice(1) || "/") : p;
    }
    if (p === ancestorPathKey) return ".";
    const prefix = ancestorPathKey.endsWith("/") ? ancestorPathKey : `${ancestorPathKey}/`;
    if (p.startsWith(prefix)) return p.slice(prefix.length) || ".";
    const parts = p.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? p;
  } catch {
    return url;
  }
}

export function flattenPathTrie(trie: PathTrieNode, expanded: ReadonlySet<string>): UrlNavRow[] {
  const out: UrlNavRow[] = [];

  function visit(node: PathTrieNode, depth: number): void {
    const keys = [...node.children.keys()].sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      const child = node.children.get(key)!;
      const hasChildren = child.children.size > 0;
      const { urlsHere } = child;

      if (!hasChildren) {
        if (urlsHere.length === 1) {
          out.push({
            kind: "page",
            url: urlsHere[0]!,
            label: labelPageRelativeToAncestor(urlsHere[0]!, node.pathKey),
            depth,
          });
        } else if (urlsHere.length > 1) {
          for (const u of [...urlsHere].sort()) {
            const q = (() => {
              try {
                const s = new URL(u).search;
                return s ? s : "";
              } catch {
                return "";
              }
            })();
            out.push({
              kind: "page",
              url: u,
              label: `${child.segment}${q || ""}`.slice(0, 200),
              depth,
            });
          }
        }
        continue;
      }

      out.push({
        kind: "dir",
        pathKey: child.pathKey,
        label: child.segment,
        depth,
        leafCount: countLeavesInSubtree(child),
      });

      if (!expanded.has(child.pathKey)) continue;

      for (const u of [...urlsHere].sort()) {
        out.push({
          kind: "page",
          url: u,
          label: labelPageRelativeToAncestor(u, child.pathKey),
          depth: depth + 1,
        });
      }
      visit(child, depth + 1);
    }
  }

  visit(trie, 0);

  for (const u of [...trie.urlsHere].sort()) {
    let lab = "/";
    try {
      lab = normalizePathname(new URL(u).pathname) || "/";
    } catch {
      /* keep */
    }
    out.push({ kind: "page", url: u, label: lab, depth: 0 });
  }

  return out;
}

/** Single-line label for the nav pane; caller passes max grapheme-ish length (columns). */
export function formatUrlNavRowText(
  row: UrlNavRow,
  expanded: ReadonlySet<string>,
  maxLen: number,
): string {
  const depth = row.depth;
  const indent = "  ".repeat(depth);
  const chevron = row.kind === "dir" ? (expanded.has(row.pathKey) ? "v " : "> ") : "  ";
  const suffix = row.kind === "dir" ? ` · ${row.leafCount}` : "";
  const raw = `${indent}${chevron}${row.label}${suffix}`;
  if (raw.length <= maxLen) return raw;
  const keep = Math.max(4, maxLen - 1);
  return `${raw.slice(0, keep)}…`;
}
