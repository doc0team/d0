# doc0

Terminal-native documentation: humans browse in a TUI; agents run the same CLI with `--json` / raw output, or talk to the **MCP server**.

`doc0` is the primary command; `d0` is installed as a short alias. Everything below works with either.

## Install

```bash
npm install -g doc0
```

Interactive browse (`doc0 @scope/pkg`, `doc0 browse …`) uses the **Ink** + React TUI only — **Node 22+** and `npm install` are enough; there is no Rust or native binary.

Use **`doc0 browse --external <url>`** for live docs URLs when you want off-site links from `llms.txt` included in discovery.

Experimental secondary track: **`doc0 browse-opentui`** runs a parallel OpenTUI shell (requires [Bun](https://bun.sh/)).

From source:

```bash
npm install
npm run build
node dist/index.js --help
```

Add `~/.d0/bin` to your `PATH` to use named bundle CLIs (e.g. `stripe-docs`) after `doc0 add`.

## Quick start

```bash
# Point doc0 at any markdown folder — name + version inferred from package.json when present.
doc0 add ./my-docs
doc0 @local/my-docs

# Or install a packaged bundle dir that ships with d0.json.
doc0 add --local ./examples/example-lib
doc0 @example/lib
# TUI: j/k scroll, Enter open, / search, h back, l forward, q quit

# See which of your project's deps have built-in docs coverage.
doc0 suggest

# Verify every registry entry (bundles installed, URLs serve llms.txt / llms-full.txt / sitemap).
doc0 doctor

doc0 @example/lib search webhooks --json
doc0 @example/lib read api/webhooks --raw
doc0 ls --json
```

## Commands

| Command | Description |
|--------|-------------|
| `doc0 add <path>` | **Instant bundle.** Point at any folder of markdown — doc0 scans `.md` / `.mdx`, infers name from `package.json` (or `@local/<dirname>`), bundles, and installs in one step. Pass `--name @scope/x` to override. |
| `doc0 add --local <dir>` | Install an existing bundle directory that already has `d0.json` (strict). |
| `doc0 add <@scope/name>` | Registry name (network registry not live yet). |
| `doc0 remove <name>` | Remove an installed bundle |
| `doc0 ls` | List installed bundles |
| `doc0 <bundle>` | Open Ink interactive browser (TTY) |
| `doc0 <bundle> ls` | List pages (slugs) |
| `doc0 <bundle> read <slug>` | Read one page |
| `doc0 <bundle> search <query>` | Full-text search |
| `doc0 browse-opentui` | Experimental secondary OpenTUI launcher (Bun required) |
| `doc0 init --name @scope/pkg [dir]` | Scaffold a new bundle |
| `doc0 build [dir]` | Validate and write `dist/<name>-<ver>.d0.tgz` |
| `doc0 import <src> --name @scope/pkg [--out dir]` | Import markdown tree or single file |
| `doc0 update [--check]` | Self-update the CLI from npm. `--check` reports without installing. |
| `doc0 ingest url <url>` | Ingest discovered pages into `~/.d0/docs-store/<id>/` |
| `doc0 ingest bundle <bundle>` | Ingest an installed bundle into the local docs store |
| `doc0 doctor` | Verify every registry entry: bundles exist, URLs serve `/llms.txt` / `/llms-full.txt` / sitemap. |
| `doc0 suggest [dir]` | Scan `./package.json` deps and report which have doc0 registry coverage. |
| `doc0 mcp` | MCP server on stdio. `--installed-only` hides built-in URL sources; only user-added entries + installed bundles are exposed. |
| `doc0 mcp install` | Add doc0 to Cursor `mcp.json` (merge; backs up existing file) |

Flags: `--json` and `--raw` where documented; without a TTY, `read` defaults to raw markdown and `search`/`ls` default to JSON when `outputFormat` is `auto` in `~/.d0rc`.

## Bundle format

See `examples/example-lib/d0.json` — `structure` maps stable slugs to markdown paths. Bundle `name` must be scoped (`@org/name`).

## MCP

Run the server on stdio:

```bash
doc0 mcp
```

**Cursor:** merge doc0 into Cursor’s MCP config (global `~/.cursor/mcp.json` by default):

```bash
doc0 mcp install
doc0 mcp install --yes          # replace existing mcpServers.d0
doc0 mcp install --project      # use ./.cursor/mcp.json in this repo
doc0 mcp install --dry-run      # print JSON only
```

Restart Cursor after install. See [Cursor MCP docs](https://cursor.com/docs/mcp). The entry is registered under `mcpServers.d0` (historical key — kept stable across the `d0` → `doc0` rename).

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
2. Installed bundles (anything added via `doc0 add`)
3. **Community registry** — a single JSON file on GitHub, fetched once a day and cached at `~/.d0/community-registry.json`
4. **Shipped seed** — `registry.json` bundled with the npm package (offline / first-run fallback)

#### Community registry

Every `doc0` install points at the community registry by default:

```
https://raw.githubusercontent.com/doc0team/d0-registry/main/registry.json
```

That repo is a single JSON file. PRs are the curation UI — no servers, no accounts. See the template at `examples/d0-registry-template/` for the README, contributing rules, and validation workflow that go in that repo.

The shipped seed (`registry.json` at the root of this package) is a point-in-time snapshot of the community file, refreshed before each publish via `npm run sync-registry`. It exists so `doc0` works on a fresh install with no network and so first-run latency is zero. Community entries with the same id override seed entries, so stale seed data is fixed by a one-line PR to `d0-registry`.

Commands:

```bash
doc0 registry status        # show configured URL + cache state
doc0 registry sync          # force-refresh the cache right now
```

Control it from `~/.d0rc`:

```yaml
# Point at your own fork / private mirror
registryUrl: https://raw.githubusercontent.com/myorg/d0-registry/main/registry.json

# Or disable entirely (shipped seed only, no network call)
registryUrl: false
```

Or from the environment (wins over `~/.d0rc`):

```bash
D0_REGISTRY_URL=off doc0 ls                 # disable for this run
D0_REGISTRY_URL=https://… doc0 stripe       # override for this run
```

Fetch failures fall back to the last-known-good cache, then to the shipped seed, so doc0 keeps working offline.

Format of the JSON file (array or `{ "entries": [...] }`):

```json
{
  "entries": [
    {
      "id": "stripe",
      "aliases": ["stripe api", "stripe docs"],
      "sourceType": "url",
      "source": "https://docs.stripe.com",
      "description": "Stripe API documentation"
    }
  ]
}
```

Bootstrapping a new `d0-registry` repo: copy `registry.json` from this package root, plus the files under `examples/d0-registry-template/` (README, CONTRIBUTING, GitHub Actions workflow).

#### Local override

To add or override a single source without touching the community file, edit `~/.d0/docs-registry.json`:

```json
{
  "entries": [
    { "id": "my-docs", "aliases": ["mydocs"], "sourceType": "url", "source": "https://example.com/docs" }
  ]
}
```

There is still no doc0-hosted registry service. Everything resolves from the shipped seed + a GitHub-hosted JSON file + your local files.

## URL docs completeness (env)

Large doc sites can return tens of thousands of URLs from sitemaps and `llms.txt`. doc0 caps work in layers so runs stay predictable; raise caps when you want maximum coverage (more time, disk, and HTTP load).

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
| `D0_MCP_INSTALLED_ONLY` | Set to `1` to hide community + seed URL entries in MCP (equivalent to `doc0 mcp --installed-only`) | unset |
| `D0_REGISTRY_URL` | Override the community registry URL. Disable tokens: `off` / `false` / `disabled` / `""`. | default URL |
| `D0_COMMUNITY_REGISTRY_TTL_MS` | How long to trust `~/.d0/community-registry.json` before re-fetching | `86400000` (24h) |
| `D0_DEBUG` | Set to `1` to surface community-registry fetch failures in MCP mode (stderr is otherwise silent there) | unset |

CLI: `doc0 ingest url` accepts `--max-pages` (same semantics: `0` means no extra cap beyond discovery).

## License

MIT
