import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchHostedEntry } from "@/lib/hosted-bundles";
import type { RegistryDocument, RegistryEntry } from "../types";

const REGISTRY_URL = "https://raw.githubusercontent.com/doc0team/d0-registry/main/registry.json";

async function fetchRegistryEntry(id: string): Promise<RegistryEntry | null> {
  const res = await fetch(REGISTRY_URL, { next: { revalidate: 86_400 } });
  if (!res.ok) return null;
  const body = (await res.json()) as RegistryDocument | RegistryEntry[];
  const entries = Array.isArray(body) ? body : body.entries;
  return entries.find((e) => e.id === id) ?? null;
}

function buildState(builtAt?: string): "healthy" | "stale" | "missing" {
  if (!builtAt) return "missing";
  return Date.now() - Date.parse(builtAt) <= 48 * 60 * 60 * 1000 ? "healthy" : "stale";
}

export default async function RegistryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = await fetchRegistryEntry(id.toLowerCase());
  if (!entry) return notFound();
  const hosted = await fetchHostedEntry(entry.id);
  const latestVersion = hosted?.latest;
  const latest = latestVersion ? hosted?.versions[latestVersion] : undefined;
  const state = buildState(latest?.builtAt);

  return (
    <div className="mx-auto max-w-4xl px-6 pb-24 pt-16">
      <p className="text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
        <Link href="/registry" style={{ color: "var(--color-link)" }}>
          Registry
        </Link>{" "}
        / {entry.id}
      </p>
      <h1 className="mt-3 font-mono text-[clamp(1.6rem,3.2vw,2.2rem)] font-semibold">{entry.id}</h1>
      <p className="mt-3" style={{ color: "var(--color-fg-muted)" }}>
        {entry.description || "No description provided."}
      </p>
      <div className="mt-6 rounded-xl border p-5" style={{ borderColor: "var(--color-border)" }}>
        <div className="text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
          Install
        </div>
        <pre className="mt-2 rounded-md border p-3 text-[13px]" style={{ borderColor: "var(--color-border)" }}>
{`doc0 ${entry.id}
doc0 mcp install`}
        </pre>
        <div className="mt-3 text-[13px]" style={{ color: "var(--color-fg-muted)" }}>
          Build health:{" "}
          <strong>
            {state}
            {latestVersion ? ` · v${latestVersion}` : ""}
          </strong>
          {latest?.builtAt ? ` · built ${new Date(latest.builtAt).toLocaleString()}` : ""}
          {typeof latest?.pages === "number" ? ` · ${latest.pages} pages` : ""}
        </div>
      </div>

      <div className="mt-6 rounded-xl border p-5" style={{ borderColor: "var(--color-border)" }}>
        <div className="text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
          Source
        </div>
        <a href={entry.source} target="_blank" rel="noreferrer" style={{ color: "var(--color-link)" }}>
          {entry.source}
        </a>
      </div>
    </div>
  );
}
