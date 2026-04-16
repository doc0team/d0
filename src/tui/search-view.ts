import type { SearchHit } from "../core/search-engine.js";

export function formatSearchResults(hits: SearchHit[]): string {
  if (!hits.length) return "No results.";
  return hits.map((h, i) => `${i + 1}. ${h.slug} — ${h.title}\n   ${h.snippet}`).join("\n\n");
}
