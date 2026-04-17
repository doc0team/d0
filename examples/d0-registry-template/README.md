# d0-registry

Community-curated registry of documentation sources for [d0](https://github.com/doc0team/d0).

This is **one JSON file** on GitHub. PRs are the UI.

The live URL fetched by the `d0` CLI:

```
https://raw.githubusercontent.com/doc0team/d0-registry/main/registry.json
```

`d0` fetches it once per 24h, caches it at `~/.d0/community-registry.json`, and merges it into the local registry. Zero servers.

## Add a doc source

1. Fork this repo.
2. Edit `registry.json`. Add an entry like:

   ```json
   {
     "id": "tanstack-query",
     "aliases": ["tanstack query", "react query"],
     "sourceType": "url",
     "source": "https://tanstack.com/query/latest/docs",
     "description": "TanStack Query documentation"
   }
   ```

3. Open a PR. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the rules.

A GitHub Action validates the JSON shape on every PR.

## Entry format

| field         | required | notes                                                                                                |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `id`          | yes      | lowercase, hyphen-separated, unique. Matches what users type: `doc0 read stripe`.                      |
| `aliases`     | no       | Extra strings the CLI matches against. Keep them meaningful (not "api", "docs").                     |
| `sourceType`  | yes      | Always `"url"` in the community registry. Bundles are installed locally via `doc0 install`.           |
| `source`      | yes      | The docs root URL. Prefer ones that expose `/llms.txt` or `/llms-full.txt` for fast MCP access.     |
| `description` | no       | Short one-liner. Shows up in `doc0 ls` and MCP `list_docs`.                                            |

## Why a single JSON file

- **No infra.** Raw GitHub URL is the CDN.
- **PRs are curation.** Reviewable, blameable, revertable.
- **Users opt in** — they can also override or disable via `~/.d0rc`.
- **Graduates cleanly** — if this file outgrows Markdown-review scale, we move to a real backend and the CLI swaps the URL. Nothing else changes.

## Override / disable

Users can point `d0` at their own fork:

```yaml
# ~/.d0rc
registryUrl: https://raw.githubusercontent.com/your-org/your-registry/main/registry.json
```

Or disable it and rely only on the seed that ships with `d0` + user-local entries:

```yaml
# ~/.d0rc
registryUrl: false
```

Or via env: `D0_REGISTRY_URL=off`.
