# d0 — AI-Native Documentation Runtime

## Overview

d0 is a system for making documentation universally accessible to both humans and AI agents without requiring authors to rewrite their docs.

It consists of:

* **Ingestion Layer** — Converts any docs site into a structured, navigable format
* **TUI (Terminal UI)** — Allows humans to browse docs cleanly
* **MCP Server** — Allows AI agents to access docs programmatically
* **Registry** — Maps identifiers (e.g. `"stripe"`) to canonical documentation sources

---

## Core Philosophy

* Do **not** rewrite docs
* Do **not** require authors to adopt new formats
* Do **not** rely on agents scraping websites

Instead:

> Convert existing docs into a clean, structured, locally accessible system.

---

## System Architecture

```
Docs URL
   ↓
Ingestion (crawl + normalize)
   ↓
Structured Store (tree + pages)
   ↓
 ┌──────────────┐      ┌──────────────┐
 │     TUI      │      │     MCP      │
 │ (for humans) │      │ (for agents) │
 └──────────────┘      └──────────────┘
```

---

## Ingestion Model

d0 ingests any documentation site and converts it into:

* A **tree structure** (like a filesystem)
* Cleaned **page content**
* Extracted **code blocks**

### Important Constraints

* No attempt at deep semantic normalization
* No universal schema across all docs
* Only extract:

  * headings
  * hierarchy
  * paragraphs
  * code blocks

### Output Shape

```ts
type DocNode = {
  id: string
  title: string
  path: string
  content: string
  children: DocNode[]
}
```

---

## MCP Layer (Agent Interface)

Agents interact with d0 via MCP.

### Key Principle

> Treat documentation as a **filesystem**, not a knowledge base.

---

## MCP Tools

### 1. Open Documentation

```json
{
  "name": "open_docs",
  "description": "Open documentation by identifier",
  "args": {
    "package": "string"
  }
}
```

---

### 2. List Nodes

```json
{
  "name": "list_nodes",
  "description": "List child nodes in a documentation tree",
  "args": {
    "doc_id": "string",
    "path": "string"
  }
}
```

---

### 3. Read Node

```json
{
  "name": "read_node",
  "description": "Read a specific documentation page",
  "args": {
    "doc_id": "string",
    "path": "string"
  }
}
```

---

### 4. Search Nodes (lightweight)

```json
{
  "name": "search_nodes",
  "description": "Search documentation titles/headings",
  "args": {
    "doc_id": "string",
    "query": "string"
  }
}
```

---

### 5. Discover Docs

```json
{
  "name": "search_docs",
  "description": "Find documentation sources by name or topic",
  "args": {
    "query": "string"
  }
}
```

---

## Registry System

### Purpose

Agents should **never deal with URLs**.

Instead, they use identifiers:

```txt
open_docs("stripe")
```

fuzzy can be used here. stripe-api = stripe, stripe payments = stripe

---

### Registry Entry Format

```json
{
  "stripe": {
    "url": "https://docs.stripe.com",
    "aliases": ["stripe", "stripe api"],
    "trust": "verified" -- Need to find a system to handle this.
  }
}
```

---

### Resolution Flow

```
Agent → "stripe"
      ↓
Registry lookup
      ↓
Canonical URL
      ↓
Ingestion / Cache
```

---

### Registry Types

#### 1. Global Registry (default)

* Maintained by d0
* High-quality, verified entries
* Used automatically by all users

#### 2. User Registry

* Local overrides or additions
* Example:

  ```
  d0 add my-api https://internal/docs
  ```

#### 3. Community Registry (optional)

* Shared but unverified
* Lower trust level

---

## Discovery Problem (Critical)

Agents do not know what exists in the registry by default.

### Solution

Provide discovery tools:

* `search_docs(query)`
* `list_docs()`

Agents must:

1. Search for a docs source
2. Resolve identifier
3. Open docs

---

## Caching & Freshness

### Strategy: Stale-While-Revalidate

1. Return cached docs instantly
2. Refresh in background if stale

---

### Update Signals

* `ETag` / `Last-Modified`
* `sitemap.xml`
* content hashing
* TTL fallback

---

### Manual Refresh

```bash
d0 refresh stripe
```

---

## Trust & Security Model

### Problem

Docs can contain:

* malicious code examples
* prompt injection
* unsafe instructions

---

### Trust Levels

```json
{
  "stripe": { "trust": "verified" },
  "small-oss": { "trust": "unverified" }
}
```

---

### Rules

* Agents should prefer **verified** sources
* Unverified sources are allowed but flagged
* User-added sources are implicitly trusted

---

### Sanitization

During ingestion:

* strip scripts
* remove unsafe HTML
* normalize content

---

### Code Risk Detection (heuristic)

Flag patterns like:

* `process.env`
* `exec(`
* `child_process`
* external network calls

You don't block them - you label them.

---

### Important Principle

> Documentation is **reference**, not executable instruction.

---

## Design Constraints

### DO

* Keep structure simple (tree + content)
* Make everything deterministic
* Optimize for token efficiency
* Use identifiers, not URLs
* Provide discovery mechanisms

---

### DO NOT

* Attempt full semantic normalization
* Require doc authors to rewrite content
* Rely on agents guessing URLs
* Block on perfect parsing
* Assume trust by default

---

## Product Definition

d0 is:

> A **local, structured documentation runtime** with:
>
> * a human interface (TUI)
> * an agent interface (MCP)
> * a registry-backed resolution system

---

## Key Insight

You are not building:

* a docs site
* a search engine
* an AI assistant

You are building:

> **Infrastructure for how documentation is accessed**

---

## Final Mental Model

```
Identifier ("stripe")
        ↓
Registry (DNS for docs)
        ↓
Docs URL
        ↓
Ingestion → Structured Tree
        ↓
 ┌──────────────┐
 │     TUI      │
 └──────────────┘
        ↓
 ┌──────────────┐
 │     MCP      │
 └──────────────┘
        ↓
      Agent
```

---

## Bottom Line

* Agents should never scrape docs
* Docs should not need rewriting
* URLs should be abstracted away
* Structure should be minimal but consistent
* Trust must be explicit

d0 becomes the **default interface between documentation and AI systems**.
