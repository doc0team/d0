# Bundle format (`d0.json`)

- **name** — scoped id, e.g. `@acme/docs`
- **version** — bundle version (your semver)
- **library** — optional `{ "name": "stripe", "versions": ">=2024" }`
- **bin** — optional CLI alias (shim in `~/.d0/bin`)
- **structure** — map of slug → path relative to bundle root

Example:

```json
{
  "name": "@acme/docs",
  "version": "1.0.0",
  "structure": {
    "guides/quickstart": "pages/guides/quickstart.md"
  }
}
```
