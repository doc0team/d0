import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchHostedEntry } from "@/lib/hosted-bundles";

export const revalidate = 86_400;

type Manifest = { pages?: Record<string, { relPath?: string; title?: string }> };

async function fetchManifest(url?: string): Promise<Manifest | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return (await res.json()) as Manifest;
  } catch {
    return null;
  }
}

function pageHash(relPath?: string): string {
  if (!relPath) return "";
  const m = relPath.match(/p_([a-f0-9]{16,64})\.md$/i);
  return m?.[1] ?? relPath;
}

export default async function DiffPage({
  params,
}: {
  params: Promise<{ id: string; range: string }>;
}) {
  const { id, range } = await params;
  const [from, to] = range.split("..");
  if (!from || !to) return notFound();
  const entry = await fetchHostedEntry(id.toLowerCase());
  if (!entry?.versions) return notFound();
  const a = entry.versions[from];
  const b = entry.versions[to];
  if (!a || !b) return notFound();
  const [ma, mb] = await Promise.all([fetchManifest(a.manifestUrl), fetchManifest(b.manifestUrl)]);
  if (!ma || !mb) return notFound();
  const pagesA = ma.pages ?? {};
  const pagesB = mb.pages ?? {};
  const keysA = new Set(Object.keys(pagesA));
  const keysB = new Set(Object.keys(pagesB));
  const added = [...keysB].filter((k) => !keysA.has(k)).sort();
  const removed = [...keysA].filter((k) => !keysB.has(k)).sort();
  const changed = [...keysA]
    .filter((k) => keysB.has(k) && pageHash(pagesA[k]?.relPath) !== pageHash(pagesB[k]?.relPath))
    .sort();

  const renderList = (title: string, list: string[], source: Record<string, { title?: string }>) => (
    <section className="rounded-xl border p-5" style={{ borderColor: "var(--color-border)" }}>
      <h2 className="text-[1.05rem] font-semibold">{title} ({list.length})</h2>
      <ul className="mt-3 space-y-1 text-[14px]" style={{ color: "var(--color-fg-muted)" }}>
        {list.slice(0, 200).map((p) => (
          <li key={p}>
            <Link href={`/${id}${p}`} style={{ color: "var(--color-link)" }}>
              {p}
            </Link>
            {source[p]?.title ? ` — ${source[p]!.title}` : ""}
          </li>
        ))}
      </ul>
      {list.length > 200 ? (
        <p className="mt-2 text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
          Showing first 200 items.
        </p>
      ) : null}
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-16">
      <h1 className="text-[clamp(1.8rem,3.7vw,2.4rem)] font-semibold tracking-[-0.02em]">
        {id} diff {from}..{to}
      </h1>
      <p className="mt-3 text-[14px]" style={{ color: "var(--color-fg-muted)" }}>
        Install or run in terminal: <code>doc0 diff {id} {from} {to}</code>
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {renderList("Added", added, pagesB)}
        {renderList("Removed", removed, pagesA)}
        {renderList("Changed", changed, pagesB)}
      </div>
    </div>
  );
}
