import { findInstalledBundle } from "../core/storage.js";
import { buildHybridIndex, searchHybrid } from "../core/search-engine.js";
import { loadBundle } from "../core/bundle.js";
import { resolveDocsRegistryEntry } from "../core/registry-client.js";
import { searchDocUrls } from "../core/web-docs.js";

type Citation = { id: string; slug: string; title: string; url?: string; snippet: string };

async function completeWithProvider(prompt: string): Promise<string> {
  const openai = process.env.OPENAI_API_KEY;
  if (openai) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${openai}` },
      body: JSON.stringify({
        model: process.env.D0_OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (res.ok) {
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const txt = body.choices?.[0]?.message?.content;
      if (txt) return txt;
    }
  }

  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (anthropic) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropic,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.D0_ANTHROPIC_CHAT_MODEL ?? "claude-3-5-haiku-latest",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (res.ok) {
      const body = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
      const txt = body.content?.find((c) => c.type === "text")?.text;
      if (txt) return txt;
    }
  }

  throw new Error("No supported LLM provider key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
}

function formatCitation(id: string, citation: Citation): string {
  const link = citation.slug ? `https://doc0.sh/${id}/${citation.slug}` : undefined;
  const label = citation.slug ? `${id}:${citation.slug}` : id;
  return link ? `\u001B]8;;${link}\u0007[${label}]\u001B]8;;\u0007` : `[${label}]`;
}

export async function cmdAsk(
  id: string,
  question: string[],
  opts: { json?: boolean; model?: string },
): Promise<void> {
  const q = question.join(" ").trim();
  if (!q) {
    console.error("doc0 ask: question is required");
    process.exitCode = 1;
    return;
  }

  const entry = await resolveDocsRegistryEntry(id);
  if (!entry) {
    console.error(`doc0 ask: docs source not found: ${id}`);
    process.exitCode = 1;
    return;
  }

  const citations: Citation[] = [];
  if (entry.sourceType === "bundle") {
    const ref = await findInstalledBundle(entry.source);
    if (!ref) {
      console.error(`doc0 ask: bundle not installed: ${entry.source}`);
      process.exitCode = 1;
      return;
    }
    const bundle = await loadBundle(ref.root);
    const index = await buildHybridIndex(bundle);
    const hits = await searchHybrid(index, q, 8);
    for (const h of hits) {
      citations.push({ id: entry.id, slug: h.slug, title: h.title, snippet: h.snippet });
    }
  } else {
    const hits = await searchDocUrls(entry.source, q, undefined, { maxFetch: 20, earlyExit: true });
    for (const hit of hits.slice(0, 8)) {
      citations.push({
        id: entry.id,
        slug: hit.url.replace(entry.source, "").replace(/^\/+/, ""),
        title: hit.title,
        url: hit.url,
        snippet: hit.snippet,
      });
    }
  }

  const context = citations
    .map((c, i) => `(${i + 1}) ${c.title}\n${c.snippet}\n`)
    .join("\n");
  const providerModel = opts.model ? `Use model preference: ${opts.model}\n` : "";
  const prompt = `${providerModel}Answer the question using the context snippets. Include concise actionable guidance.\nQuestion: ${q}\n\nContext:\n${context}`;
  const answer = await completeWithProvider(prompt);

  if (opts.json) {
    console.log(JSON.stringify({ answer, citations }, null, 2));
    return;
  }

  console.log(answer.trim());
  if (citations.length) {
    console.log("\nCitations:");
    for (const c of citations) {
      console.log(`- ${formatCitation(entry.id, c)} ${c.title}`);
    }
  }
}
