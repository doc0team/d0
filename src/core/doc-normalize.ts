import { marked, type Token, type Tokens } from "marked";

export interface NormalizedDoc {
  markdown: string;
  codeBlocks: { id: string; lang?: string; code: string }[];
}

export function normalizeDocMarkdown(markdown: string): NormalizedDoc {
  const trimmed = markdown.trim();
  const lexer = marked.lexer(trimmed);
  const codeBlocks: NormalizedDoc["codeBlocks"] = [];
  let fenceIndex = 0;
  marked.walkTokens(lexer as Token[], (t) => {
    if (t.type === "code") {
      const c = t as Tokens.Code;
      codeBlocks.push({
        id: `cb_${fenceIndex++}`,
        lang: c.lang?.trim() || undefined,
        code: c.text,
      });
    }
  });
  return { markdown: trimmed, codeBlocks };
}
