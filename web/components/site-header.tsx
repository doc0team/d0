import Link from "next/link";
import { Logo } from "./logo";

export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-md"
      style={{
        background: "color-mix(in srgb, var(--color-bg) 80%, transparent)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3" aria-label="doc0 home">
          <Logo />
          <span
            className="hidden text-[11px] uppercase tracking-[0.14em] sm:inline"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            a document0 product
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-[13px]">
          <HeaderLink href="/docs">Docs</HeaderLink>
          <HeaderLink href="/docs/registry">Registry</HeaderLink>
          <HeaderLink href="https://github.com/doc0team/d0" external>
            GitHub
          </HeaderLink>
          <span
            className="mx-2"
            style={{ width: 1, height: 18, background: "var(--color-border)" }}
          />
          <a
            href="https://github.com/doc0team/d0"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              color: "var(--color-fg)",
            }}
          >
            <span style={{ color: "var(--color-accent)" }}>★</span> Star
          </a>
        </nav>
      </div>
    </header>
  );
}

function HeaderLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const inner = (
    <span
      className="inline-flex items-center px-3 py-1.5 rounded-md transition-colors hover:text-white"
      style={{ color: "var(--color-fg-muted)" }}
    >
      {children}
    </span>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  }
  return <Link href={href}>{inner}</Link>;
}
