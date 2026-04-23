import { NextResponse } from "next/server";

function guessIdFromUrl(url: URL): string {
  const host = url.hostname.replace(/^www\./, "");
  const parts = host.split(".");
  return (parts[0] || "docs").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

function buildProposeUrl(entry: Record<string, unknown>): string {
  const base = "https://github.com/doc0team/d0-registry/edit/main/registry.json";
  const pretty = JSON.stringify(entry, null, 2);
  const params = new URLSearchParams({
    message: `registry: add ${String(entry.id)}`,
    description: "Adds a new documentation source generated from doc0.sh URL probe.",
    value: pretty,
  });
  return `${base}?${params.toString()}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url")?.trim();
  if (!raw) return NextResponse.json({ error: "missing url" }, { status: 400 });
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  const root = `${parsed.protocol}//${parsed.host}`;
  const llms = await fetch(`${root}/llms.txt`).then((r) => r.ok).catch(() => false);
  const llmsFull = await fetch(`${root}/llms-full.txt`).then((r) => r.ok).catch(() => false);
  const sitemap = await fetch(`${root}/sitemap.xml`).then((r) => r.ok).catch(() => false);
  const title = parsed.hostname.replace(/^www\./, "");
  const entry = {
    id: guessIdFromUrl(parsed),
    aliases: [title],
    sourceType: "url",
    source: root,
    description: `${title} documentation`,
  };

  return NextResponse.json({
    ok: true,
    entry,
    signals: { llms, llmsFull, sitemap },
    proposeUrl: buildProposeUrl(entry),
  });
}
