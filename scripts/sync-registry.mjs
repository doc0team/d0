#!/usr/bin/env node
// Refreshes ./registry.json from the community registry repo. Run before `npm publish`
// so the shipped seed reflects the current community state.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  process.env.D0_COMMUNITY_REGISTRY_URL ??
  "https://raw.githubusercontent.com/doc0team/d0-registry/main/registry.json";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, "..", "registry.json");

console.log(`fetching ${SOURCE_URL}`);
const res = await fetch(SOURCE_URL);
if (!res.ok) {
  console.error(`fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const raw = await res.text();

// Validate it parses before overwriting.
try {
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed) ? parsed : parsed?.entries;
  if (!Array.isArray(entries)) {
    console.error("unexpected shape: no top-level array or `entries` array");
    process.exit(1);
  }
  console.log(`got ${entries.length} entries`);
} catch (e) {
  console.error("response is not valid JSON:", e.message);
  process.exit(1);
}

await writeFile(target, raw.endsWith("\n") ? raw : raw + "\n", "utf8");
console.log(`wrote ${target}`);
