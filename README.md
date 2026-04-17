# d0

Terminal-native documentation: humans browse in a TUI; agents run the same CLI with `--json` / raw output, or talk to the **MCP server**.

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
# Point d0 at any markdown folder — name + version inferred from package.json when present.
d0 add ./my-docs
d0 @local/my-docs

# Or install a packaged bundle dir that ships with d0.json.
d0 add --local ./examples/example-lib
d0 @example/lib
# TUI: j/k scroll, Enter open, / search, h back, l forward, q quit

# See which of your project's deps have built-in docs coverage.
d0 suggest

# Verify every registry entry (bundles installed, URLs serve llms.txt / llms-full.txt / sitemap).
d0 doctor

d0 @example/lib search webhooks --json
d0 @example/lib read api/webhooks --raw
d0 ls --json
```

## Commands

| Command | Description |
|--------|-------------|
| `d0 add <path>` | **Instant bundle.** Point at any folder of markdown — d0 scans `.md` / `.mdx`, infers name from `package.json` (or `@local/<dirname>`), bundles, and installs in one step. Pass `--name @scope/x` to override. |
| `d0 add --local <dir>` | Install an existing bundle directory that already has `d0.json` (strict). |
| `d0 add <@scope/name>` | Registry name (network registry not live yet). |
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
| `d0 ingest url <url>` | Ingest discovered pages into `~/.d0/docs-store/<id>/` |
| `d0 ingest bundle <bundle>` | Ingest an installed bundle into the local docs store |
| `d0 doctor` | Verify every registry entry: bundles exist, URLs serve `/llms.txt` / `/llms-full.txt` / sitemap. |
| `d0 suggest [dir]` | Scan `./package.json` deps and report which have d0 registry coverage. |
| `d0 mcp` | MCP server on stdio. `--installed-only` hides built-in URL sources; only user-added entries + installed bundles are exposed. |
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
d0 mcp install --project      # use ./.cursor/mcp.json in this repo
d0 mcp install --dry-run      # print JSON only
```

Restart Cursor after install. See [Cursor MCP docs](https://cursor.com/docs/mcp).

### Tools

Four tools, designed to minimize round-trips in an agent loop:

| Tool | Purpose |
|------|---------|
| `find_docs(query)` | Registry search. Returns matches + for the top match: root tree inline and whether `/llms-full.txt` is available. Usually one call is enough to start navigating. |
| `read_docs(id, path?, full?)` | Read docs by registry id. No `path` → root tree; dir path → subtree; page URL/slug → page markdown. `full=true` → whole `/llms-full.txt` markdown; `full="heading substring"` → a single matching chunk. Pages are cached on first read. |
| `grep_docs(id, query)` | Search within a source. Uses the local cache of pages you've read; for uncached URL docs falls back to bounded live search (cap via `D0_MCP_SEARCH_MAX_FETCH`). |
| `list_docs()` | List all registry entries. |

**Tool-flow guidance for agents**

1. `find_docs("stripe webhooks")` — one call returns the id, the root tree, and an `llms_full_available` flag.
2. If `llms_full_available` is true: `read_docs("stripe", null, true)` returns the entire docs site in one HTTP hit, or `read_docs("stripe", null, "webhook")` returns just the matching section. This is the fast path for most modern doc sites.
3. Otherwise navigate: `read_docs("stripe", "/api/webhooks")`. Every page you read is cached under `~/.d0/docs-store/<id>/` so subsequent `grep_docs` calls are local.
4. Use `grep_docs` once pages are cached, or for sites without `/llms-full.txt` when you need text search.

### Registry

Registry entries resolve from, in order of precedence:

1. User overrides: `~/.d0/docs-registry.json`
2. Installed bundles (anything added via `d0 add`)
3. Built-in defaults (curated list shipped with the CLI)

To add a source: `d0 add <id> <url>` *(or edit `~/.d0/docs-registry.json` manually)*. There is no network call to a remote registry service.

## URL docs completeness (env)

Large doc sites can return tens of thousands of URLs from sitemaps and `llms.txt`. d0 caps work in layers so runs stay predictable; raise caps when you want maximum coverage (more time, disk, and HTTP load).

| Variable | What it controls | Default |
|----------|------------------|---------|
| `D0_MAX_DISCOVERED_URLS` | Max URLs kept after merging `llms.txt`, sitemaps, and nav discovery | `50000` |
| `D0_MAX_SITEMAP_NESTED` | Max nested sitemap index pages to follow | `200` |
| `D0_SEARCH_MAX_FETCH` | Live `searchDocUrls` (CLI/TUI): max pages to fetch and scan for a query (`0` = all discovered up to `D0_MAX_DISCOVERED_URLS`) | `10000` |
| `D0_MCP_SEARCH_MAX_FETCH` | MCP `search_nodes` live URL search: max pages to consider (uses URL-ranking + early exit; avoids multi-hour scans on huge sites) | `80` |
| `D0_SEARCH_FETCH_CONCURRENCY` | Parallelism for that live search fetch pass | `8` |
| `D0_INGEST_MAX_PAGES` | `ingestUrlToDocStore` / CLI ingest: max pages after dedupe (`0` = all discovered up to `D0_MAX_DISCOVERED_URLS`) | `50000` |
| `D0_INGEST_FETCH_CONCURRENCY` | Parallelism when writing ingested markdown pages | `8` |
| `D0_LLMS_FULL_CHUNK_MAX_CHARS` | Max characters per `llms-full.txt` chunk (paragraph-bounded; continuation chunks share the heading as `(part N/M)`) | `8000` |
| `D0_MCP_INSTALLED_ONLY` | Set to `1` to hide built-in URL registry entries in MCP (equivalent to `d0 mcp --installed-only`) | unset |

CLI: `d0 ingest url` accepts `--max-pages` (same semantics: `0` means no extra cap beyond discovery).

## License

MIT
