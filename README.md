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
| `d0 mcp` | MCP server on stdio (`search_docs`, `list_docs`, `open_docs`, `list_nodes`, `read_node`, `search_nodes`) |

Flags: `--json` and `--raw` where documented; without a TTY, `read` defaults to raw markdown and `search`/`ls` default to JSON when `outputFormat` is `auto` in `~/.d0rc`.

## Bundle format

See `examples/example-lib/d0.json` — `structure` maps stable slugs to markdown paths. Bundle `name` must be scoped (`@org/name`).

## MCP

Configure your client to run `d0 mcp`.

Tool flow:

1. Discover docs: `search_docs` or `list_docs`
2. Open a source: `open_docs` (returns `doc_id`)
3. Traverse/read/search within that source: `list_nodes`, `read_node`, `search_nodes`

Registry entries are resolved from:

- user registry overrides (`~/.d0/docs-registry.json`)
- installed bundles
- cached global registry snapshot (`~/.d0/cache/global-docs-registry.json`)
- live global registry via `registryUrl` (`~/.d0rc`)
- built-in defaults

Resolution is local-first with global fallback. `open_docs` can resolve a docs source from the global registry even when it is not installed locally. The MCP server still runs on the user's machine and queries the global registry over HTTPS when needed.

## License

MIT
