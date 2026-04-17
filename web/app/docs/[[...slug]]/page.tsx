import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBreadcrumbs, getPageNeighbours } from "@document0/core/navigation";
import { docsSource } from "@/lib/docs-source";
import { compileMdx } from "@/lib/mdx";
import { mdxComponents } from "@/components/mdx-components";

type Params = { slug?: string[] };

export async function generateStaticParams(): Promise<Params[]> {
  const pages = await docsSource.getPages();
  return pages.map((p) => ({ slug: p.slugs.length > 0 ? p.slugs : [] }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await docsSource.getPage(slug?.join("/") ?? "");
  if (!page) return { title: "Not found" };
  return {
    title: page.frontmatter.title,
    description: page.frontmatter.description,
  };
}

export default async function DocsPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const slugPath = slug?.join("/") ?? "";
  const page = await docsSource.getPage(slugPath);
  if (!page) notFound();

  const [{ Content, frontmatter, toc }, tree] = await Promise.all([
    compileMdx(page.content),
    docsSource.getPageTree(),
  ]);

  const breadcrumbs = getBreadcrumbs(tree, page.url);
  const { previous, next } = getPageNeighbours(tree, page.url);

  const title = (frontmatter.title as string | undefined) ?? page.frontmatter.title;
  const description =
    (frontmatter.description as string | undefined) ?? page.frontmatter.description;

  return (
    <article className="doc-prose" style={{ maxWidth: "720px" }}>
      {breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em]"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden>/</span>}
              {b.url ? (
                <Link href={b.url} className="hover:text-white transition-colors">
                  {b.name}
                </Link>
              ) : (
                <span style={{ color: "var(--color-fg-muted)" }}>{b.name}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <header className="mb-10">
        <h1 className="!mb-3">{title}</h1>
        {description && (
          <p
            className="!m-0 text-[1.05rem] leading-relaxed"
            style={{ color: "var(--color-fg-muted)" }}
          >
            {description}
          </p>
        )}
      </header>

      <Content components={mdxComponents} />

      {(previous || next) && (
        <nav
          aria-label="Pagination"
          className="mt-14 grid gap-3 pt-6 sm:grid-cols-2"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          {previous ? <PagerLink dir="prev" href={previous.url} label={previous.name} /> : <span />}
          {next ? <PagerLink dir="next" href={next.url} label={next.name} /> : <span />}
        </nav>
      )}

      {toc.length > 2 && <TocRail toc={toc} />}
    </article>
  );
}

function PagerLink({ dir, href, label }: { dir: "prev" | "next"; href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg px-4 py-3 transition-colors hover:border-[var(--color-border-strong)]"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        textAlign: dir === "next" ? "right" : "left",
      }}
    >
      <div
        className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        {dir === "prev" ? "← Previous" : "Next →"}
      </div>
      <div className="mt-1 font-medium" style={{ color: "var(--color-fg)" }}>
        {label}
      </div>
    </Link>
  );
}

function TocRail({ toc }: { toc: Array<{ id: string; text: string; depth: number }> }) {
  return (
    <aside
      aria-label="On this page"
      className="hidden xl:block fixed text-[12.5px]"
      style={{
        top: 96,
        right: "max(24px, calc((100vw - 1200px) / 2))",
        width: 180,
        color: "var(--color-fg-muted)",
      }}
    >
      <div
        className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.14em]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        On this page
      </div>
      <ul className="space-y-1.5">
        {toc
          .filter((h) => h.depth <= 3)
          .map((h) => (
            <li key={h.id} style={{ paddingLeft: (h.depth - 1) * 10 }}>
              <a
                href={`#${h.id}`}
                className="block hover:text-white transition-colors"
                style={{ color: "var(--color-fg-muted)" }}
              >
                {h.text}
              </a>
            </li>
          ))}
      </ul>
    </aside>
  );
}
