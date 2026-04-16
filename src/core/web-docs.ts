import TurndownService from "turndown";
import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

export interface WebDocPage {
  url: string;
  title: string;
  markdown: string;
}

export interface WebDocHit {
  url: string;
  title: string;
  snippet: string;
}

/** Controls URL discovery when the site ships `/llms.txt` (often a full doc dump, not a curated link list). */
export type ListDocUrlsOptions = {
  /** If true, keep links to other origins (OAuth vendor docs, GitHub, etc.). Default: only `input` URL's origin. */
  llmsIncludeExternal?: boolean;
};

const indexCache = new Map<string, { ts: number; pages: string[] }>();
const pageCache = new Map<string, { ts: number; page: WebDocPage }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
/** Cap merged discovery (llms + sitemap + nav); sitemaps alone can list hundreds of doc URLs. */
const MAX_DISCOVERED_URLS = 5000;
const MAX_SITEMAP_NESTED = 40;
/**
 * When the sitemap lists at least this many URLs, treat it as authoritative for **in-page nav** links:
 * homepage `<a href>` often includes marketing shortcuts (e.g. `/faq`) that duplicate real doc paths
 * (`/docs/faq`) and are not in the sitemap.
 */
const MIN_SITEMAP_URLS_TO_FILTER_NAV = 12;

function now(): number {
  return Date.now();
}

function fromCache<T>(entry: { ts: number; value: T } | undefined): T | null {
  if (!entry) return null;
  if (now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.value;
}

/** LDH label (letters, digits, hyphen) — not leading/trailing hyphen. */
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

/**
 * True for `host.tld` or `a.b.c.tld` plus optional `/path…` without a scheme.
 * The old `one.two` regex only allowed two labels (`sub.tld`), so `docs.stack-auth.com` failed.
 */
function isBareHttpHostInput(trimmed: string): boolean {
  if (/[^a-z0-9./:?#-]/i.test(trimmed.replace(/[/?#].*/s, ""))) return false;
  const hostAndMore = trimmed.split(/[/?#]/)[0] ?? "";
  if (!hostAndMore.includes(".")) return false;
  const host = hostAndMore.includes(":") ? hostAndMore.slice(0, hostAndMore.indexOf(":")) : hostAndMore;
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1]!;
  if (tld.length < 2 || !/^[a-z]+$/i.test(tld)) return false;
  for (let i = 0; i < labels.length - 1; i++) {
    const lab = labels[i]!;
    if (lab.length > 63 || !HOST_LABEL.test(lab)) return false;
  }
  return true;
}

function normalizeInputUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("URL cannot be empty");
  if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed);
  if (isBareHttpHostInput(trimmed)) return new URL(`https://${trimmed}`);
  throw new Error(`Invalid URL: ${input}`);
}

/** Same rules as `listDocUrls` / `readDocUrl` — use anywhere you need `new URL(...)` for user-entered browse targets. */
export function resolveBrowseBaseUrl(input: string): URL {
  return normalizeInputUrl(input);
}

function cleanUrl(raw: string, base: URL): string | null {
  try {
    const u = new URL(raw, base);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    u.hash = "";
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|map|pdf|zip)$/i.test(u.pathname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Compare sitemap vs nav links without trailing-slash mismatches. */
function pageUrlMatchKey(url: string): string {
  try {
    const u = new URL(url);
    let p = u.pathname;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    u.pathname = p || "/";
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function pickDocFragment($: cheerio.CheerioAPI): Cheerio<AnyNode> {
  const tryRoots: Cheerio<AnyNode>[] = [
    $("main article").first() as Cheerio<AnyNode>,
    $("[role='main']").first() as Cheerio<AnyNode>,
    $("article").first() as Cheerio<AnyNode>,
    $("main .prose").first() as Cheerio<AnyNode>,
    $("main").first() as Cheerio<AnyNode>,
    $("#content").first() as Cheerio<AnyNode>,
    $("body").first() as Cheerio<AnyNode>,
  ];
  for (const el of tryRoots) {
    if (el.length > 0) return el.clone();
  }
  return $("body").first() as Cheerio<AnyNode>;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "d0-docs-bot/0.1 (+https://github.com)",
      accept: "text/html, text/markdown, text/plain;q=0.9, */*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function fetchTextWithContentType(url: string): Promise<{ text: string; contentType: string }> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "d0-docs-bot/0.1 (+https://github.com)",
      accept: "text/html, text/markdown, text/plain;q=0.9, */*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return { text: await res.text(), contentType: res.headers.get("content-type") ?? "" };
}

function looksLikeHtmlDocument(t: string): boolean {
  const s = t.slice(0, 1200).trimStart();
  return /^<!DOCTYPE html/i.test(s) || /^<html[\s>]/i.test(s) || (/<head[\s>]/i.test(s) && /<body[\s>]/i.test(s));
}

/** True when the response is likely MD/MDX source, not an HTML document. */
function isProbablyRawMarkdown(body: string, contentType: string): boolean {
  if (/markdown|\/(x-)?mdx?/i.test(contentType)) return true;
  if (looksLikeHtmlDocument(body)) return false;
  const t = body.trimStart().slice(0, 2000);
  if (/^---\s*$/m.test(t)) return true;
  if (/^#\s/m.test(t)) return true;
  if (/^\s*import\s[\s\S]{0,200}from\s+["']/.test(t)) return true;
  if (/^\s*export\s+(default\s+)?(function|const|async)/m.test(t)) return true;
  return false;
}

function stripYamlFrontmatter(text: string): string {
  const t = text.trimStart();
  if (!t.startsWith("---")) return text;
  const end = t.indexOf("\n---", 3);
  if (end < 0) return text;
  return t.slice(end + 4).trimStart();
}

function normalizeRawMarkdown(text: string): string | null {
  const t = text.trim();
  if (t.length < 8) return null;
  if (looksLikeHtmlDocument(t)) return null;
  return stripYamlFrontmatter(t).trim();
}

function titleFromFirstMarkdownHeading(markdown: string, fallback: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1]!.trim() : fallback;
}

function isPlaceholderDocMarkdown(markdown: string): boolean {
  if (!markdown.trim()) return true;
  return /_No parsable content found\._/i.test(markdown);
}

/** When the pretty URL serves empty/SPA HTML, many doc hosts expose the same path with `.mdx` / `.md`. */
async function tryFetchMarkdownSibling(canonicalUrl: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(canonicalUrl);
  } catch {
    return null;
  }
  const path = u.pathname.replace(/\/+$/, "");
  if (!path || path === "/") return null;
  if (/\.(md|mdx|markdown)$/i.test(path)) return null;

  for (const ext of [".mdx", ".md"]) {
    const candidate = new URL(`${u.origin}${path}${ext}${u.search}`);
    try {
      const text = await fetchText(candidate.toString());
      const md = normalizeRawMarkdown(text);
      if (md) return md;
    } catch {
      /* try next */
    }
  }
  return null;
}

function extractCandidateLinks(html: string, base: URL): string[] {
  const $ = cheerio.load(html);
  const out = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const cleaned = cleanUrl(href, base);
    if (!cleaned) return;
    const u = new URL(cleaned);
    if (u.origin !== base.origin) return;
    if (u.pathname === "/" || u.pathname.length < 2) return;
    out.add(cleaned);
  });
  return [...out];
}

/** Where to fetch llms.txt (see https://llmstxt.org/ — root is standard; subpaths are allowed). */
function llmsTxtFetchUrls(base: URL): string[] {
  const root = new URL("/llms.txt", base).toString();
  const beside = new URL("llms.txt", base).toString();
  return root === beside ? [root] : [root, beside];
}

/**
 * Extract URLs from an llms.txt body: markdown links `[label](url)` (primary in the spec),
 * optional `<https://...>`, and lines that are (or start with) a bare absolute URL.
 */
function extractLlmsTxtUrls(text: string, base: URL): string[] {
  const out = new Set<string>();

  const push = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    try {
      const resolved = /^https?:\/\//i.test(trimmed) ? trimmed : new URL(trimmed, base).toString();
      const c = cleanUrl(resolved, base);
      if (c) out.add(c);
    } catch {
      /* ignore bad URLs */
    }
  };

  const mdLink = /\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLink.exec(text)) !== null) {
    push(m[2]!);
  }

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    const angle = t.match(/^<\s*(https?:\/\/[^>\s]+)\s*>$/i);
    if (angle) {
      push(angle[1]!);
      continue;
    }
    const bare = t.match(/^(https?:\/\/\S+)/i);
    if (bare) push(bare[1]!);
  }

  return [...out];
}

async function listFromLlmsTxt(base: URL): Promise<string[]> {
  for (const llmsUrl of llmsTxtFetchUrls(base)) {
    try {
      const text = await fetchText(llmsUrl);
      return extractLlmsTxtUrls(text, base);
    } catch {
      /* try next candidate */
    }
  }
  return [];
}

function extractSitemapLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]!.trim());
  }
  return out;
}

/** Page URLs from `/sitemap.xml` (plain urlset or sitemap index pointing at nested maps). */
async function listFromSitemap(base: URL): Promise<string[]> {
  const origin = base.origin;
  const primary = new URL("/sitemap.xml", base).toString();
  let rootXml: string;
  try {
    rootXml = await fetchText(primary);
  } catch {
    return [];
  }

  const urlsetParts: string[] = [];
  if (/<sitemapindex[\s>]/i.test(rootXml)) {
    const nested = extractSitemapLocs(rootXml).filter((u) => {
      try {
        return new URL(u).origin === origin;
      } catch {
        return false;
      }
    });
    const limited = nested.slice(0, MAX_SITEMAP_NESTED);
    const fetched = await Promise.all(limited.map((u) => fetchText(u).catch(() => "")));
    urlsetParts.push(...fetched.filter(Boolean));
  } else {
    urlsetParts.push(rootXml);
  }

  const pages = new Set<string>();
  for (const part of urlsetParts) {
    for (const raw of extractSitemapLocs(part)) {
      const c = cleanUrl(raw, base);
      if (!c) continue;
      try {
        const u = new URL(c);
        if (u.origin !== origin) continue;
        if (u.pathname === "/" || u.pathname.length < 2) continue;
        pages.add(c);
      } catch {
        /* skip */
      }
      if (pages.size >= MAX_DISCOVERED_URLS) break;
    }
    if (pages.size >= MAX_DISCOVERED_URLS) break;
  }

  return [...pages];
}

export async function listDocUrls(input: string, opts?: ListDocUrlsOptions): Promise<string[]> {
  const base = normalizeInputUrl(input);
  const includeExternal = opts?.llmsIncludeExternal === true;
  const cacheKey = `${base.origin}${base.pathname}|v3-nav|${includeExternal ? "x" : "o"}`;
  const cached = fromCache(indexCache.get(cacheKey) ? { ts: indexCache.get(cacheKey)!.ts, value: indexCache.get(cacheKey)!.pages } : undefined);
  if (cached) return cached;

  const origin = base.origin;
  const merged = new Set<string>([base.toString()]);
  const sitemapMatchKeys = new Set<string>();

  const [llmsRaw, sitemapUrls, seedHtml] = await Promise.all([
    listFromLlmsTxt(base),
    listFromSitemap(base),
    fetchText(base.toString()).catch(() => ""),
  ]);
  const navLinks = seedHtml ? extractCandidateLinks(seedHtml, base) : [];

  for (const u of sitemapUrls) {
    merged.add(u);
    sitemapMatchKeys.add(pageUrlMatchKey(u));
  }

  for (const u of llmsRaw) {
    try {
      if (includeExternal || new URL(u).origin === origin) merged.add(u);
    } catch {
      /* skip */
    }
  }

  const strictNav =
    sitemapUrls.length >= MIN_SITEMAP_URLS_TO_FILTER_NAV && sitemapMatchKeys.size > 0;
  for (const u of navLinks) {
    if (strictNav && !sitemapMatchKeys.has(pageUrlMatchKey(u))) continue;
    merged.add(u);
  }

  const pages = [...merged].slice(0, MAX_DISCOVERED_URLS);
  indexCache.set(cacheKey, { ts: now(), pages });
  return pages;
}

export async function readDocUrl(input: string): Promise<WebDocPage> {
  const url = normalizeInputUrl(input).toString();
  const cached = pageCache.get(url);
  const cachedValue = fromCache(cached ? { ts: cached.ts, value: cached.page } : undefined);
  if (cachedValue) return cachedValue;

  const { text: body, contentType } = await fetchTextWithContentType(url);

  if (isProbablyRawMarkdown(body, contentType)) {
    const raw = normalizeRawMarkdown(body);
    if (raw) {
      const title = titleFromFirstMarkdownHeading(raw, url);
      const page = { url, title, markdown: raw };
      pageCache.set(url, { ts: now(), page });
      return page;
    }
  }

  const html = body;
  const $ = cheerio.load(html);
  $("script, style, nav, footer, noscript").remove();
  const title =
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    url;

  const fragment = pickDocFragment($);
  fragment.find("button, aside, [role='navigation'], [data-toc], .toc").remove();

  const main = fragment.html()?.trim() || "";

  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  let markdown = turndown.turndown(main).trim();

  if (isPlaceholderDocMarkdown(markdown)) {
    const sibling = await tryFetchMarkdownSibling(url);
    if (sibling) markdown = sibling;
  }

  if (!markdown.trim() || isPlaceholderDocMarkdown(markdown)) {
    const page = { url, title, markdown: `# ${title}\n\n_No parsable content found._` };
    pageCache.set(url, { ts: now(), page });
    return page;
  }

  const resolvedTitle = titleFromFirstMarkdownHeading(markdown, title);
  const page = { url, title: resolvedTitle, markdown };
  pageCache.set(url, { ts: now(), page });
  return page;
}

function snippetFor(markdown: string, query: string): string {
  const plain = markdown.replace(/[#>*_`-]/g, " ").replace(/\s+/g, " ").trim();
  const q = query.toLowerCase();
  const i = plain.toLowerCase().indexOf(q);
  if (i < 0) return plain.slice(0, 180) + (plain.length > 180 ? "..." : "");
  const start = Math.max(0, i - 60);
  const end = Math.min(plain.length, i + q.length + 120);
  return (start > 0 ? "..." : "") + plain.slice(start, end) + (end < plain.length ? "..." : "");
}

export async function searchDocUrls(
  target: string,
  query: string,
  listOpts?: ListDocUrlsOptions,
): Promise<WebDocHit[]> {
  const pages = await listDocUrls(target, listOpts);
  const sample = pages.slice(0, 30);
  const docs = await Promise.all(
    sample.map(async (u) => {
      try {
        return await readDocUrl(u);
      } catch {
        return null;
      }
    }),
  );
  const q = query.toLowerCase();
  return docs
    .filter((d): d is WebDocPage => Boolean(d))
    .map((d) => ({
      url: d.url,
      title: d.title,
      markdown: d.markdown,
      score:
        (d.title.toLowerCase().includes(q) ? 3 : 0) +
        (d.url.toLowerCase().includes(q) ? 2 : 0) +
        (d.markdown.toLowerCase().includes(q) ? 1 : 0),
    }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((d) => ({ url: d.url, title: d.title, snippet: snippetFor(d.markdown, query) }));
}

export function isUrlLike(input: string): boolean {
  const t = input.trim();
  return /^https?:\/\//i.test(t) || isBareHttpHostInput(t);
}

