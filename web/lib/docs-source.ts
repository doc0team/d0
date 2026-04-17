import path from "node:path";
import { DocsSource } from "@document0/core";

const rootDir = path.join(process.cwd(), "content", "docs");

/**
 * Singleton DocsSource pointed at `web/content/docs`. `DocsSource` caches pages + tree in memory
 * after first access — in dev, the Next.js module cache is invalidated on file change and the
 * singleton is rebuilt automatically. In prod (static build), the cache is permanent.
 */
export const docsSource = new DocsSource({
  rootDir,
  baseUrl: "/docs",
});
