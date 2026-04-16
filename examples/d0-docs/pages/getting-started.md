# Getting started with d0

**d0** is documentation you install like software: scoped bundles, a manifest (`d0.json`), and the same CLI for humans (TUI) and machines (`--json` / raw).

## Install a bundle

```bash
d0 add --local ./path/to/bundle
```

## Browse

```bash
d0 @acme/docs
```

Use **j** / **k** to move, **Enter** to open a page, **/** to search, **q** to quit.

## Agent-friendly output

```bash
d0 @acme/docs search "webhooks" --json
d0 @acme/docs read api/webhooks --raw
```
