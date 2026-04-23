import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { compileMdx } from "@/lib/mdx";
import { mdxComponents } from "@/components/mdx-components";
import { PageActions } from "@/components/page-actions";
import { fetchHostedEntry, fetchHostedIndex, type HostedEntryMeta, type HostedVersionMeta } from "@/lib/hosted-bundles";

type PageParams = { id: string; slug?: string[] };

function pickVersion(entry: HostedEntryMeta, version?: string): { key: string; meta: HostedVersionMeta } | null {
  const key = version ?? entry.latest ?? Object.keys(entry.versions)[0];
  const meta = entry.versions[key];
  if (!meta) return null;
  return { key, meta };
}

async function getManifest(version: HostedVersionMeta): Promise<any | null> {
  if (!version.manifestUrl) return null;
  try {
    const res = await fetch(version.manifestUrl, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getPageMarkdown(version: HostedVersionMeta, relPath: string): Promise<string | null> {
  if (!version.pagesBaseUrl) return null;
  const cleanRel = relPath.replace(/^\/+/, "");
  try {
    const res = await fetch(`${version.pagesBaseUrl}/${cleanRel}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function toPathKey(slug?: string[]): string {
  if (!slug || slug.length === 0) return "/";
  return `/${slug.join("/")}`;
}

export async function generateStaticParams(): Promise<PageParams[]> {
  const index = await fetchHostedIndex();
  if (!index) return [];
  return Object.keys(index.entries).map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { id, slug } = await params;
  const entry = await fetchHostedEntry(id.toLowerCase());
  const picked = entry ? pickVersion(entry) : null;
  const manifest = picked ? await getManifest(picked.meta) : null;
  const key = toPathKey(slug);
  const rec = manifest?.pages?.[key];
  const title = rec?.title ? `${rec.title} · ${id}` : `${id} docs`;
  const canonical = slug?.length ? `/${id}/${slug.join("/")}` : `/${id}`;
  return {
    title,
    alternates: { canonical },
    openGraph: {
      title,
      description: rec?.title ? `Hosted docs page for ${rec.title}` : `Hosted docs for ${id}`,
      url: canonical,
    },
  };
}

export default async function HostedDocPage({ params }: { params: Promise<PageParams> }) {
  const { id, slug } = await params;
  const normalizedId = id.toLowerCase();
  const entry = await fetchHostedEntry(normalizedId);
  if (!entry) return notFound();
  const picked = pickVersion(entry);
  if (!picked) return notFound();
  const manifest = await getManifest(picked.meta);
  if (!manifest) return notFound();

  const pathKey = toPathKey(slug);
  const record = manifest.pages?.[pathKey];
  const pageMarkdown = record ? await getPageMarkdown(picked.meta, record.relPath) : null;
  const compiled = pageMarkdown ? await compileMdx(pageMarkdown) : null;
  const slugText = slug?.join("/");
  const title = record?.title ?? `${normalizedId} docs`;

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-14 md:pt-16">
      <div
        className="rounded-xl border p-4 text-[12px] md:p-5"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <div style={{ color: "var(--color-fg-subtle)" }}>Hosted docs</div>
        <div className="mt-1 text-[14px] md:text-[15px]" style={{ color: "var(--color-fg-muted)" }}>
          <span style={{ color: "var(--color-fg)" }}>{normalizedId}</span>
          <span className="mx-2">·</span>
          <span>version {picked.key}</span>
        </div>
        <PageActions docId={normalizedId} slug={slugText} />
      </div>

      <h1 className="mt-8 text-[clamp(1.6rem,3.6vw,2.2rem)] font-semibold tracking-[-0.015em]">{title}</h1>
      {record?.url ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-fg-subtle)" }}>
          Source URL:{" "}
          <a href={record.url} target="_blank" rel="noreferrer" style={{ color: "var(--color-link)" }}>
            {record.url}
          </a>
        </p>
      ) : null}

      {compiled ? (
        <article className="prose prose-invert mt-8 max-w-none">
          <compiled.Content components={mdxComponents} />
        </article>
      ) : (
        <div className="mt-8 rounded-lg border p-6" style={{ borderColor: "var(--color-border)" }}>
          <p style={{ color: "var(--color-fg-muted)" }}>
            This page is not available in the hosted index yet.
          </p>
          <p className="mt-3 text-[14px]" style={{ color: "var(--color-fg-subtle)" }}>
            Try opening the source docs directly or run <code>doc0 {normalizedId}</code> in terminal.
          </p>
          <div className="mt-4">
            <Link href="/registry" style={{ color: "var(--color-link)" }}>
              Browse registry entries →
            </Link>
          </div>
        </div>
      )}

      {pageMarkdown ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "TechArticle",
              name: title,
              headline: title,
              articleBody: pageMarkdown.slice(0, 5000),
              isPartOf: `https://doc0.sh/${normalizedId}`,
            }),
          }}
        />
      ) : null}
    </div>
  );
}
