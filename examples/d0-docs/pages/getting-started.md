# Getting started with doc0

**doc0** is documentation you install like software: scoped bundles, a manifest (`d0.json`), and the same CLI for humans (TUI) and machines (`--json` / raw).

## Install a bundle

```bash
doc0 add --local ./path/to/bundle
```

## Browse

```bash
doc0 @acme/docs
```

Use **j** / **k** to move, **Enter** to open a page, **/** to search, **q** to quit.

## Agent-friendly output

```bash
doc0 @acme/docs search "webhooks" --json
doc0 @acme/docs read api/webhooks --raw
```
