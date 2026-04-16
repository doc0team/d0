# d0

Terminal-native documentation: humans browse in a TUI; agents run the same CLI with `--json` / raw output.

## Install

```bash
npm install -g d0
```

Interactive browse (`d0 @scope/pkg`, `d0 browse …`) uses the **Ink** + React TUI only — **Node 22+** and `npm install` are enough; there is no Rust or native binary.

Use **`d0 browse --external <url>`** for live docs URLs when you want off-site links from `llms.txt` included in discovery.

Experimental secondary track: **`d0 browse-opentui`** runs a parallel OpenTUI shell (requires [Bun](https://bun.sh/)).

From source:

```bash
npm install
npm run build
node dist/index.js --help
```

Add `~/.d0/bin` to your `PATH` to use named bundle CLIs (e.g. `stripe-docs`) after `d0 add`.

## Quick start

```bash
d0 add --local ./examples/example-lib
d0 @example/lib
# TUI: j/k scroll, Enter open, / search, h back, l forward, q quit

d0 @example/lib search webhooks --json
d0 @example/lib read api/webhooks --raw
d0 ls --json
```

## Commands

| Command | Description |
|--------|-------------|
| `d0 add --local <dir>` | Install a bundle from disk |
| `d0 remove <name>` | Remove an installed bundle |
| `d0 ls` | List installed bundles |
| `d0 <bundle>` | Open Ink interactive browser (TTY) |
| `d0 <bundle> ls` | List pages (slugs) |
| `d0 <bundle> read <slug>` | Read one page |
| `d0 <bundle> search <query>` | Full-text search |
| `d0 browse-opentui` | Experimental secondary OpenTUI launcher (Bun required) |
| `d0 init --name @scope/pkg [dir]` | Scaffold a new bundle |
| `d0 build [dir]` | Validate and write `dist/<name>-<ver>.d0.tgz` |
| `d0 publish [dir]` | Stub until registry is live |
| `d0 import <src> --name @scope/pkg [--out dir]` | Import markdown tree or single file |
| `d0 registry sync` | Refresh global registry metadata cache only (no bundle installs) |
| `d0 ingest url <url>` | Ingest discovered pages into `~/.d0/docs-store/<id>/` (metadata + normalized markdown) |
| `d0 ingest bundle <bundle>` | Ingest an installed bundle into the local docs store |
| `d0 index build-url <url> --out <file>` | Build a downloadable `d0-remote-search-index-v1` JSON (MiniSearch) for fast MCP search |
| `d0 mcp` | MCP server on stdio (`search_docs`, `list_docs`, `open_docs`, `list_nodes`, `read_node`, `search_nodes`) |
| `d0 mcp install` | Add d0 to Cursor `mcp.json` (merge; backs up existing file) |

Flags: `--json` and `--raw` where documented; without a TTY, `read` defaults to raw markdown and `search`/`ls` default to JSON when `outputFormat` is `auto` in `~/.d0rc`.

## Bundle format

See `examples/example-lib/d0.json` — `structure` maps stable slugs to markdown paths. Bundle `name` must be scoped (`@org/name`).

## MCP

Run the server on stdio:

```bash
d0 mcp
```

**Cursor:** merge d0 into Cursor’s MCP config (global `~/.cursor/mcp.json` by default):

```bash
d0 mcp install
d0 mcp install --yes          # replace existing mcpServers.d0
d0 mcp install --project        # use ./.cursor/mcp.json in this repo
d0 mcp install --dry-run        # print JSON only
```

Restart Cursor after install. See [Cursor MCP docs](https://cursor.com/docs/mcp).

Tool flow:

1. Discover docs: `search_docs` or `list_docs`
2. Open a source: `open_docs` (returns `doc_id` and `ingest_mode`). For **URL** docs, default is **lazy**: `open_docs` returns immediately; `list_nodes` uses full discovery (sitemap / `llms.txt` / nav); `read_node` fetches one page on demand and persists it in the background under `~/.d0/docs-store`. Pass `ingest: "full"` to block until the entire site is ingested (old behavior). Pass `ingest: false` for read-only / no writes (optional reuse of an existing local manifest).
3. Traverse/read/search within that source: `list_nodes`, `read_node`, `search_nodes` (`search_nodes` uses a remote index when resolved `searchIndexUrl` is set; otherwise lazy URL mode uses bounded live search, and `ingest: "full"` uses the local store index)

**Remote search index (registry CDN):** Entries may set **`searchIndexPath`** (path only, e.g. `indexes/stripe-v1.json`) or a full **`searchIndexUrl`**. Paths are resolved against **`registryIndexBaseUrl`** from `~/.d0rc` (default **`https://reg.document0.com`**). Optional **`searchIndexRevision`** busts the local file cache under `~/.d0/remote-search-index/`. Payload format: `d0-remote-search-index-v1` from `d0 index build-url`.

**Shipping on Vercel:** Use the **`reg-document0/`** app in this repo: it runs **`d0 index` logic** on a schedule, uploads to **Vercel Blob**, and serves **`/indexes/*`** (no large JSON in git). See `reg-document0/README.md`. After deploy, bump **`searchIndexRevision`** when you want clients to drop `~/.d0/remote-search-index/` cache. You can still use **`d0 index build-url`** locally to produce a one-off JSON file if needed.

Registry entries are resolved from:

- user registry overrides (`~/.d0/docs-registry.json`)
- installed bundles
- cached global registry snapshot (`~/.d0/cache/global-docs-registry.json`)
- live global registry via `registryUrl` (`~/.d0rc`)
- built-in defaults

Resolution is local-first with global fallback. `open_docs` can resolve a docs source from the global registry even when it is not installed locally. The MCP server still runs on the user's machine and queries the global registry over HTTPS when needed.

### `~/.d0rc` registry hosts

| Key | Role |
|-----|------|
| `registryUrl` | Docs metadata API (default `https://registry.d0.dev`) |
| `registryIndexBaseUrl` | CDN origin for pre-built search JSON when entries use `searchIndexPath` (default `https://reg.document0.com`) |

## URL docs completeness (env)

Large doc sites can return tens of thousands of URLs from sitemaps and `llms.txt`. d0 caps work in layers so runs stay predictable; raise caps when you want maximum coverage (more time, disk, and HTTP load).

| Variable | What it controls | Default |
|----------|------------------|---------|
| `D0_MAX_DISCOVERED_URLS` | Max URLs kept after merging `llms.txt`, sitemaps, and nav discovery | `50000` |
| `D0_MAX_SITEMAP_NESTED` | Max nested sitemap index pages to follow | `200` |
| `D0_SEARCH_MAX_FETCH` | Live `searchDocUrls` (CLI/TUI): max pages to fetch and scan for a query (`0` = all discovered up to `D0_MAX_DISCOVERED_URLS`) | `10000` |
| `D0_MCP_SEARCH_MAX_FETCH` | MCP `search_nodes` live URL search: max pages to consider (uses URL-ranking + early exit; avoids multi-hour scans on huge sites) | `200` |
| `D0_SEARCH_FETCH_CONCURRENCY` | Parallelism for that live search fetch pass | `8` |
| `D0_INGEST_MAX_PAGES` | `ingestUrlToDocStore` / MCP ingest: max pages after dedupe (`0` = all discovered up to `D0_MAX_DISCOVERED_URLS`) | `50000` |
| `D0_INGEST_FETCH_CONCURRENCY` | Parallelism when writing ingested markdown pages | `8` |

CLI: `d0 ingest url` accepts `--max-pages` (same semantics: `0` means no extra cap beyond discovery).

## License

MIT
