import Link from "next/link";
import { DocumentZeroByline, DocumentZeroMark } from "@/components/logo";
import { InstallHeroBar } from "@/components/install-hero-bar";
import { TuiLogo } from "@/components/tui-logo";
import { HeroTuiDemo } from "@/components/hero-tui-demo";

export default function LandingPage() {
  return (
    <div className="pb-24">
      <div className="mx-auto max-w-6xl px-6">
        <Hero />
      </div>

      <div className="mx-auto mt-10 max-w-6xl px-6 md:mt-12">
        <HeroPreview />
      </div>

      <div className="mx-auto max-w-6xl px-6">
      <section className="mt-28 md:mt-32">
        <Pillar
          index="01"
          label="tui"
          title="A real browser, in your terminal."
          body="Run `doc0 <id>` to open the Ink TUI: tree on the left, rendered Markdown on the right, forward/back history, `/` to search, `Enter` to open. Same layout for installed bundles and remote URL docs."
          demo={<TuiFrame />}
        />
      </section>

      <section className="mt-24 md:mt-28">
        <Pillar
          index="02"
          label="mcp"
          title="Your agent runs the same CLI — over MCP."
          body="`doc0 mcp` is a stdio MCP server. Four tools: find_docs, read_docs, grep_docs, list_docs. Most agent flows are a single find + single read. `doc0 mcp install --cursor` merges doc0 into `~/.cursor/mcp.json` in one command (Claude Code + Windsurf support coming)."
          demo={<AiChatFrame />}
          reversed
        />
      </section>

      <section className="mt-24 md:mt-28">
        <Pillar
          index="03"
          label="local"
          title="One config file. You own every byte of it."
          body="Everything doc0 does is driven by `~/.d0rc`. Point at your own registry fork, disable the community source for air-gapped networks, rebind every TUI key, tighten or loosen cache TTLs, or restrict MCP to installed bundles for a team setup."
          demo={<ConfigCard />}
        />
      </section>

      <RegistryBand className="mt-28" />

      <Footer />
      </div>
    </div>
  );
}

/* ─── HERO ──────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="pt-16 text-center md:pt-24">
      <h1 className="sr-only">doc0</h1>
      <div className="mx-auto flex justify-center overflow-x-auto">
        <TuiLogo />
      </div>

      <p
        className="mx-auto mt-6 max-w-2xl text-[1.05rem] leading-[1.55] tracking-[-0.005em] md:text-[1.18rem]"
        style={{ color: "var(--color-fg-muted)" }}
      >
        A terminal-native documentation runtime. Browse any framework&rsquo;s
        docs in a <span style={{ color: "var(--color-fg)" }}>TUI</span>, expose
        the same cache to your agent over{" "}
        <span style={{ color: "var(--color-fg)" }}>MCP</span>, and keep
        everything <span style={{ color: "var(--color-fg)" }}>local</span>.
        One config file. One cache. Zero servers.
      </p>

      <div className="mx-auto mt-8 flex justify-center px-1">
        <InstallHeroBar />
      </div>

      <p
        className="mt-2 text-center font-mono text-[12.5px]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        then:{" "}
        <code style={{ color: "var(--color-fg)" }}>doc0</code>
        <span className="mx-2 opacity-40" aria-hidden>
          ·
        </span>
        <code style={{ color: "var(--color-fg)" }}>doc0 mcp install</code>
      </p>

      <p className="mt-5 text-center text-[14px]" style={{ color: "var(--color-fg-subtle)" }}>
        <Link
          href="/docs"
          className="underline decoration-[color-mix(in_srgb,var(--color-fg-subtle)_45%,transparent)] underline-offset-[5px] transition-colors hover:text-[var(--color-fg-muted)]"
        >
          Or read the documentation
        </Link>
        <span className="mx-2 opacity-40" aria-hidden>
          ·
        </span>
        <a
          href="https://github.com/doc0team/d0"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[color-mix(in_srgb,var(--color-fg-subtle)_45%,transparent)] underline-offset-[5px] transition-colors hover:text-[var(--color-fg-muted)]"
        >
          View on GitHub
        </a>
      </p>
    </section>
  );
}

/* ─── HERO PREVIEW — Claude Code style: mac window on a painted backdrop ── */

function HeroPreview() {
  return (
    <div className="hero-preview">
      <div className="hero-preview-inner">
        <div className="mac-window">
          <div className="mac-titlebar">
            <span className="mac-dots" aria-hidden>
              <span className="mac-dot mac-dot-red" />
              <span className="mac-dot mac-dot-yellow" />
              <span className="mac-dot mac-dot-green" />
            </span>
            <span className="mac-title">doc0 — zsh</span>
            <span className="mac-trailing" aria-hidden />
          </div>
          <div className="mac-body">
            <HeroTuiDemo />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── PILLAR ────────────────────────────────────────────────────────────── */

function Pillar({
  index,
  label,
  title,
  body,
  demo,
  reversed,
}: {
  index: string;
  label: string;
  title: string;
  body: string;
  demo: React.ReactNode;
  reversed?: boolean;
}) {
  return (
    <div
      className={`grid gap-10 md:grid-cols-[1fr_1.25fr] md:items-center ${
        reversed ? "md:[&>*:first-child]:order-2" : ""
      }`}
    >
      <div>
        <div
          className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em]"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          <span>{index}</span>
          <span className="h-px w-8" style={{ background: "var(--color-border)" }} />
          <span style={{ color: "var(--color-accent)" }}>{label}</span>
        </div>
        <h3 className="mt-4 text-[clamp(1.5rem,2.6vw,2rem)] font-semibold leading-[1.15] tracking-[-0.015em]">
          {title}
        </h3>
        <p
          className="mt-4 max-w-md leading-relaxed"
          style={{ color: "var(--color-fg-muted)" }}
        >
          {body}
        </p>
      </div>
      <div className="min-w-0">{demo}</div>
    </div>
  );
}

/* ─── TUI FRAME (unchanged — mirrors src/tui/panels.tsx) ────────────────── */

function TuiFrame() {
  const tree: { label: string; depth: number; marked?: boolean; dir?: boolean }[] = [
    { label: "stripe", depth: 0, dir: true },
    { label: "overview", depth: 1 },
    { label: "quickstart", depth: 1 },
    { label: "payments", depth: 1, dir: true },
    { label: "webhooks", depth: 1, dir: true, marked: true },
    { label: "quickstart", depth: 2 },
    { label: "signatures", depth: 2 },
    { label: "connect", depth: 1, dir: true },
    { label: "testing", depth: 1 },
  ];
  return (
    <div className="tui-frame">
      <div className="tui-header">
        <span className="tui-brand">
          <span style={{ color: "var(--color-fg)", fontWeight: 700 }}>doc</span>
          <span style={{ color: "var(--color-accent)", fontWeight: 700 }}>0</span>
        </span>
        <span className="tui-breadcrumb">
          <Faint>  stripe / </Faint>
          <span style={{ color: "var(--color-fg)" }}>webhooks / quickstart</span>
        </span>
        <span className="tui-mode">
          <Faint>[</Faint>
          <span style={{ color: "var(--color-link)" }}>browse</span>
          <Faint>]</Faint>
        </span>
      </div>

      <div className="tui-split">
        <aside className="tui-tree">
          {tree.map((node, i) => (
            <div
              key={i}
              className="tui-tree-row"
              style={{
                color: node.marked ? "var(--color-fg)" : "var(--color-fg-muted)",
                fontWeight: node.marked ? 700 : 400,
              }}
            >
              <span
                style={{ color: "var(--color-accent)", width: "2ch", display: "inline-block" }}
              >
                {node.marked ? "› " : "  "}
              </span>
              <span style={{ paddingLeft: `${node.depth * 2}ch` }}>
                {node.dir ? (
                  <span style={{ color: "var(--color-link)" }}>{node.label}/</span>
                ) : (
                  node.label
                )}
              </span>
            </div>
          ))}
          <div className="tui-tree-row" style={{ marginTop: 6, color: "var(--color-fg-subtle)" }}>
            <Faint>/ search</Faint>
          </div>
        </aside>

        <div className="tui-doc">
          <div className="tui-query-bar">
            <Faint>Press / to refine search</Faint>
          </div>
          <div style={{ color: "var(--color-fg)", fontWeight: 700 }}>
            # Receive Stripe webhook events
          </div>
          <div style={{ color: "var(--color-fg-muted)" }}>
            Webhooks notify your server of asynchronous events. Configure an
          </div>
          <div style={{ color: "var(--color-fg-muted)" }}>
            endpoint, verify the signature, then return 2xx within 30 seconds.
          </div>
          <div style={{ height: 6 }} />
          <div style={{ color: "var(--color-fg)" }}>## Forward events to localhost</div>
          <div style={{ height: 4 }} />
          <div style={{ color: "var(--color-link)" }}>
            $ stripe listen --forward-to localhost:3000/webhook
          </div>
          <div style={{ color: "var(--color-fg-muted)" }}>&gt; Ready! Your webhook signing secret…</div>
        </div>
      </div>

      <div className="tui-keybar">
        <span className="tui-rule">────────</span>
        <Hint k="q" d="Quit" />
        <Hint k="/" d="Search" />
        <Hint k="b" d="Back" />
        <Hint k="f" d="Forward" />
        <Hint k="j/k" d="Scroll" />
        <Hint k="Enter" d="Open" />
        <span className="tui-rule">────────</span>
      </div>
    </div>
  );
}

function Hint({ k, d }: { k: string; d: string }) {
  return (
    <span className="tui-hint">
      <span style={{ color: "var(--color-fg-subtle)" }}>[</span>
      <span style={{ color: "var(--color-accent)" }}>{k}</span>
      <span style={{ color: "var(--color-fg-subtle)" }}> → {d}]</span>
    </span>
  );
}

/* ─── MCP: Cursor-style agent trace ─────────────────────────────────────── */

/**
 * Compact reproduction of how Cursor actually surfaces tool calls in the
 * sidebar: a one-line header, collapsed pills with a chevron, occasional
 * "Thought briefly" labels, and the final Markdown answer below.
 * No fake user bubble, no fake input — the shape is the story.
 */
function AiChatFrame() {
  return (
    <div className="agent-trace">
      <div className="cursor-step">
        <div className="cursor-step-header">
          <ChevronDown />
          <span>Explored <b>3 files</b>, <b>1 command</b></span>
        </div>
        
        <div className="cursor-step-children">
          <ToolPill>Ran <b>Find Docs</b> in doc0</ToolPill>
          <div className="cursor-thought">Thought briefly</div>
          <ToolPill>Ran <b>Grep Docs</b> in doc0</ToolPill>
          <div className="cursor-thought">Thought briefly</div>
          <ToolPill>Ran <b>Read Docs</b> in doc0</ToolPill>
          <ToolPill>Ran <b>Read Docs</b> in doc0</ToolPill>
        </div>
      </div>

      <div className="cursor-answer">
        <p>
          Stripe retries webhook deliveries with exponential backoff over{" "}
          <b>3 days</b> when the endpoint returns non-2xx or times out.
        </p>
        <ul>
          <li>
            Return <code>2xx</code> quickly; queue slow work in a background job.
          </li>
          <li>
            Verify signatures with <code>Stripe.webhooks.constructEvent</code>.
          </li>
        </ul>
      </div>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="shrink-0" style={{ color: "var(--color-fg-subtle)" }}>
      <path d="M5.5 3L10.5 8L5.5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="shrink-0" style={{ color: "var(--color-fg-subtle)" }}>
      <path d="M3 5.5L8 10.5L13 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0" style={{ color: "var(--color-fg-subtle)" }}>
      <path d="M3 4.5L7 8L3 11.5M9 11.5H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ToolPill({ children }: { children: React.ReactNode }) {
  return (
    <div className="cursor-tool-call">
      <ChevronRight />
      <TerminalIcon />
      <span className="pill-label">{children}</span>
    </div>
  );
}

/* ─── LOCAL / CUSTOMIZATION: ~/.d0rc preview + compact legend ───────────── */

function ConfigCard() {
  return (
    <div className="config-card">
      <div className="config-head">
        <span style={{ color: "var(--color-fg-subtle)" }}>~/.d0rc</span>
        <span className="ml-auto" style={{ color: "var(--color-fg-subtle)" }}>
          yaml · user-owned
        </span>
      </div>

      <pre className="config-code" tabIndex={0}>
        <span style={{ color: "var(--color-fg-subtle)" }}>{"# excerpt — yours can be longer\n"}</span>
        <span>registryUrl: </span>
        <span style={{ color: "var(--color-link)" }}>https://raw.githubusercontent.com/</span>
        {"\n"}
        <span style={{ color: "var(--color-link)" }}>{"  myorg/d0-registry/main/registry.json"}</span>
        {"\n\n"}
        <span style={{ color: "var(--color-fg-subtle)" }}>{"# cache TTL for community index (default: 24h)\n"}</span>
        <span>communityRegistryTtlMs: </span>
        <span style={{ color: "var(--color-accent)" }}>3600000</span>
        {"\n\n"}
        <span style={{ color: "var(--color-fg-subtle)" }}>{"# agents: only installed bundles\n"}</span>
        <span>mcp:</span>
        {"\n"}
        <span>{"  installedOnly: "}</span>
        <span style={{ color: "var(--color-accent)" }}>true</span>
        {"\n\n"}
        <span style={{ color: "var(--color-fg-subtle)" }}>{"# every TUI key is overridable\n"}</span>
        <span>keybindings:</span>
        {"\n"}
        <span>{"  quit: q\n  search: /\n  back: b\n  # …"}</span>
      </pre>

      <div className="config-legend">
        <div className="config-legend-item">
          <div className="config-legend-k">registryUrl</div>
          <p className="config-legend-v">
            Your fork, <code className="config-legend-code">false</code> for air-gapped, or override with{" "}
            <code className="config-legend-code">D0_REGISTRY_URL</code>.
          </p>
        </div>
        <div className="config-legend-item">
          <div className="config-legend-k">communityRegistryTtlMs</div>
          <p className="config-legend-v">How long to cache the community registry before re-fetching.</p>
        </div>
        <div className="config-legend-item">
          <div className="config-legend-k">mcp.installedOnly</div>
          <p className="config-legend-v">Hide community and seed docs from MCP; curated bundles only.</p>
        </div>
        <div className="config-legend-item">
          <div className="config-legend-k">keybindings</div>
          <p className="config-legend-v">
            Remap <code className="config-legend-code">quit</code>, <code className="config-legend-code">search</code>, navigation, scroll, and more.
          </p>
        </div>
        <div className="config-legend-item config-legend-item-wide">
          <div className="config-legend-k">doc0 doctor · doc0 registry status</div>
          <p className="config-legend-v">Validate registry entries and inspect cache before a team rollout.</p>
        </div>
      </div>

      <div className="config-card-foot">
        <Link
          href="/docs/configuration"
          className="config-card-foot-link"
        >
          Full configuration reference →
        </Link>
      </div>
    </div>
  );
}

/* ─── SHARED PRIMITIVES ─────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em]"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        color: "var(--color-fg-muted)",
      }}
    >
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full"
        style={{ background: "var(--color-accent)" }}
      />
      {children}
    </span>
  );
}

function Faint({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--color-fg-subtle)" }}>{children}</span>;
}

/* ─── Registry band + footer ────────────────────────────────────────────── */

function RegistryBand({ className = "" }: { className?: string }) {
  return (
    <section
      className={`relative overflow-hidden rounded-2xl p-8 md:p-16 ${className}`}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex flex-col items-center text-center">
        <Eyebrow>community registry</Eyebrow>
        <h2 className="mt-5 max-w-2xl text-[clamp(1.6rem,3.2vw,2rem)] font-bold leading-tight tracking-[-0.015em]">
          One JSON file on GitHub. PRs are the UI.
        </h2>
        <p
          className="mt-4 max-w-2xl leading-relaxed"
          style={{ color: "var(--color-fg-muted)" }}
        >
          No servers. No accounts. Open a PR against{" "}
          <a
            href="https://github.com/doc0team/d0-registry"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-4 transition-colors hover:text-white"
            style={{ color: "var(--color-link)" }}
          >
            doc0team/d0-registry
          </a>{" "}
          and your docs source ships to every user within 24h.
        </p>
        <Link
          href="/docs/registry"
          className="mt-5 inline-flex items-center gap-1.5 text-sm transition-colors hover:text-white"
          style={{ color: "var(--color-link)" }}
        >
          How the registry works →
        </Link>

        <div className="term mt-12 w-full max-w-3xl text-left">
          <div className="term-bar">
            <span className="mac-dots" aria-hidden>
              <span className="mac-dot mac-dot-red" />
              <span className="mac-dot mac-dot-yellow" />
              <span className="mac-dot mac-dot-green" />
            </span>
            <span className="term-title">~/.d0rc</span>
            <span className="mac-trailing" aria-hidden />
          </div>
          <pre className="term-body" style={{ fontSize: 12.5 }}>
            <Faint># point at your own fork</Faint>
            {"\n"}
            <span>registryUrl: </span>
            <span style={{ color: "var(--color-link)" }}>
              https://raw.githubusercontent.com/
            </span>
            {"\n"}
            <span style={{ color: "var(--color-link)" }}>
              {"  myorg/d0-registry/main/registry.json"}
            </span>
            {"\n\n"}
            <Faint># or disable entirely</Faint>
            {"\n"}
            <span>registryUrl: </span>
            <span style={{ color: "var(--color-accent)" }}>false</span>
          </pre>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer
      className="mt-24 flex flex-wrap items-center justify-between gap-3 border-t pt-8"
      style={{ borderColor: "var(--color-border)", color: "var(--color-fg-subtle)" }}
    >
      <div className="flex items-center gap-3 text-[13px]">
        <DocumentZeroByline variant="compact" />
        <span>·</span>
        <span>MIT</span>
        <span>·</span>
        <span>© {new Date().getFullYear()} doc0</span>
      </div>
      <div className="flex items-center gap-5 text-[13px]">
        <Link href="/docs" className="hover:text-white transition-colors">
          Docs
        </Link>
        <a
          href="https://github.com/doc0team/d0"
          target="_blank"
          rel="noreferrer"
          className="hover:text-white transition-colors"
        >
          GitHub
        </a>
        <a
          href="https://github.com/doc0team/d0-registry"
          target="_blank"
          rel="noreferrer"
          className="hover:text-white transition-colors"
        >
          Registry
        </a>
      </div>
    </footer>
  );
}
