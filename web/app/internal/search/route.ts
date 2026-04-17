import { createSearchRoute } from "@document0/core/search";
import { docsSource } from "@/lib/docs-source";

export const { GET } = createSearchRoute(docsSource);
