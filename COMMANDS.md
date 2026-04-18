# doc0 — command reference

Quick reference for the commands shown in this project’s setup and docs.

## Build and run the CLI (from source)

```powershell
cd C:\Users\madis\source\d0
npm install
npm run build
```

Use either the global-style name (if linked/installed) or `node` directly:

```powershell
node dist/index.js --help
```

## Install bundles (local)

**Example library** (`@example/lib`):

```powershell
doc0 add --local ./examples/example-lib
```

**doc0’s own docs** (`@d0/docs`):

```powershell
doc0 add --local ./examples/d0-docs
```

If `doc0` is not on your `PATH`, prefix with `node dist/index.js`:

```powershell
node dist/index.js add --local ./examples/d0-docs
```

## TUI (interactive browser)

Requires a **real terminal** (stdin and stdout must be a TTY). IDE “Run” panels or piped output will not work.

**Open the TUI** for an installed bundle:

```powershell
doc0 @example/lib
doc0 @d0/docs
```

**Registry id** (URL-backed entry from `registry.json` — no `doc0 add` required):

```powershell
doc0 browse astro
doc0 astro
```

**Keyboard (vim-style):**

| Key | Action |
|-----|--------|
| `j` / `k` | Move down / up |
| `Enter` | Open selected page or search result |
| `/` | Search |
| `h` | Back (history or leave search results) |
| `l` | Forward in history |
| `q` | Quit |
| `g` | Top of page (read mode) |
| `G` | Bottom of page (read mode) |
| `b` | Back to table of contents from read/search results |
| `Esc` | Cancel search prompt |

## Non-TUI: list and read pages

```powershell
doc0 @d0/docs ls
doc0 @d0/docs read getting-started --raw
```

**Agent-friendly JSON** (e.g. search):

```powershell
doc0 @example/lib search webhooks --json
doc0 ls --json
```

## Other useful commands

```powershell
doc0 ls
doc0 remove @d0/docs
doc0 build examples/example-lib
doc0 init --name @acme/my-docs .
doc0 import <path-to-md-dir> --name @acme/imported --out ./imported-bundle
doc0 mcp
doc0 update --check                 # see if a newer doc0 is on npm
doc0 update                         # self-update (runs npm install -g doczero@latest)
```

### `doc0 mcp` (stdio MCP server)

Running `doc0 mcp` in a terminal **looks idle** on purpose: the server speaks **JSON-RPC on stdin/stdout** and must not print normal logs to stdout (that would break the protocol). It blocks until the client disconnects.

- **Use it from an MCP host** (e.g. Cursor): configure a server that **spawns** `doc0 mcp` (or `node …/dist/index.js mcp`) and connects stdio.
- After a rebuild, you should see a **one-line message on stderr** when the server starts, explaining that it is listening.

## Named CLI shims

After `doc0 add` of a bundle that defines `"bin"` in `d0.json` (e.g. `example-lib-docs`), shims are written under:

`%USERPROFILE%\.d0\bin`

Add that folder to your **PATH** to run the shim name directly (e.g. `example-lib-docs` on Windows with `.cmd`).
