import MiniSearch from "minisearch";
import type { DocStoreManifest } from "./doc-store.js";
import { readDocStorePage } from "./doc-store.js";
import type { SearchDocument, SearchHit } from "./search-engine.js";
import { searchIndex } from "./search-engine.js";

export async function buildDocStoreSearchIndex(manifest: DocStoreManifest): Promise<MiniSearch<SearchDocument>> {
  const docs: SearchDocument[] = [];
  for (const [pathKey, rec] of Object.entries(manifest.pages)) {
    const md = await readDocStorePage(manifest.storeId, rec.relPath);
    const body = md.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
    docs.push({ id: pathKey, slug: pathKey.replace(/^\//, ""), title: rec.title, body });
  }
  const mini = new MiniSearch<SearchDocument>({
    fields: ["slug", "title", "body"],
    storeFields: ["slug", "title", "body"],
    searchOptions: {
      boost: { title: 3, slug: 2, body: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
  mini.addAll(docs);
  return mini;
}

export async function searchDocStore(
  manifest: DocStoreManifest,
  query: string,
  limit = 25,
): Promise<(SearchHit & { path: string })[]> {
  const mini = await buildDocStoreSearchIndex(manifest);
  return searchIndex(mini, query, limit).map((hit) => ({
    ...hit,
    path: `/${hit.slug}`,
  }));
}
