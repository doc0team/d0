import { processMdx } from "@document0/mdx";
import { run } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import type { MDXContent } from "mdx/types";
import { getHighlighter } from "./highlighter";

export type TocItem = { id: string; text: string; depth: number };

export type CompiledMdx = {
  Content: MDXContent;
  frontmatter: Record<string, unknown>;
  toc: TocItem[];
};

export async function compileMdx(source: string): Promise<CompiledMdx> {
  const highlighter = await getHighlighter();
  const { code, frontmatter, toc } = await processMdx(source, {
    highlighter,
    defaultLanguage: "plaintext",
  });
  const mod = await run(code, { ...runtime, baseUrl: import.meta.url } as Parameters<
    typeof run
  >[1]);
  return {
    Content: mod.default as MDXContent,
    frontmatter: (frontmatter ?? {}) as Record<string, unknown>,
    toc: (toc ?? []) as TocItem[],
  };
}
