import Link from "next/link";
import { DocumentZeroByline } from "@/components/logo";
import { TuiLogo } from "@/components/tui-logo";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-24">
      <Hero />

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
          body="`doc0 mcp` is a stdio MCP server. Four tools: find_docs, read_docs, grep_docs, list_docs. Most agent flows are a single find + single read. `doc0 mcp install` merges doc0 into `~/.cursor/mcp.json` in one command."
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
  );
}

/* ─── HERO ──────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="pt-16 md:pt-24">
      <DocumentZeroByline />

      <div className="mt-8 overflow-x-auto">
        <TuiLogo />
      </div>

      <p
        className="mt-10 max-w-2xl text-[1.18rem] leading-[1.55] tracking-[-0.005em]"
        style={{ color: "var(--color-fg)" }}
      >
        A terminal-native documentation runtime. Browse any framework&rsquo;s
        docs in a <span style={{ color: "var(--color-accent)" }}>TUI</span>,
        expose the same cache to your agent over{" "}
        <span style={{ color: "var(--color-accent)" }}>MCP</span>, and keep
        everything{" "}
        <span style={{ color: "var(--color-accent)" }}>local</span>. One
        config file. One cache. Zero servers.
      </p>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <InstallBar />
        <PrimaryCta>Read the docs</PrimaryCta>
        <GhostCta href="https://github.com/doc0team/d0">View on GitHub</GhostCta>
      </div>
    </section>
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
      <div className="trace-header">
        Explored <b>3 files</b>, <b>1 command</b>
      </div>

      <ToolPill>
        Ran <b>Find Docs</b> in doc0
      </ToolPill>
      <div className="thought">Thought briefly</div>
      <ToolPill>
        Ran <b>Grep Docs</b> in doc0
      </ToolPill>
      <div className="thought">Thought briefly</div>
      <ToolPill>
        Ran <b>Read Docs</b> in doc0
      </ToolPill>
      <ToolPill>
        Ran <b>Read Docs</b> in doc0
      </ToolPill>

      <div className="answer">
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

function ToolPill({ children }: { children: React.ReactNode }) {
  return (
    <div className="tool-pill">
      <span className="pill-icon" aria-hidden>
        ⋮
      </span>
      <span className="pill-label">{children}</span>
      <span className="pill-chevron" aria-hidden>
        ⌄
      </span>
    </div>
  );
}

/* ─── LOCAL / CUSTOMIZATION: single annotated config card ───────────────── */

function ConfigCard() {
  return (
    <div className="config-card">
      <div className="config-head">
        <span style={{ color: "var(--color-fg-subtle)" }}>~/.d0rc</span>
        <span className="ml-auto" style={{ color: "var(--color-fg-subtle)" }}>
          yaml · user-owned
        </span>
      </div>
      <div className="config-body">
        <pre className="config-code">
          <span style={{ color: "var(--color-fg-subtle)" }}>{"# registry — point at your fork, or disable entirely\n"}</span>
          <span>registryUrl: </span>
          <span style={{ color: "var(--color-link)" }}>
            https://raw.githubusercontent.com/myorg/d0-registry/main/registry.json
          </span>
          {"\n\n"}

          <span style={{ color: "var(--color-fg-subtle)" }}>
            {"# cache TTL for community-registry.json (default: 24h)\n"}
          </span>
          <span>communityRegistryTtlMs: </span>
          <span style={{ color: "var(--color-accent)" }}>3600000</span>
          {"\n\n"}

          <span style={{ color: "var(--color-fg-subtle)" }}>
            {"# expose only your installed bundles to agents\n"}
          </span>
          <span>mcp:</span>
          {"\n"}
          <span>{"  installedOnly: "}</span>
          <span style={{ color: "var(--color-accent)" }}>true</span>
          {"\n\n"}

          <span style={{ color: "var(--color-fg-subtle)" }}>
            {"# rebind TUI keys — all keybindings are overridable\n"}
          </span>
          <span>keybindings:</span>
          {"\n"}
          <span>{"  quit: q\n"}</span>
          <span>{"  search: /\n"}</span>
          <span>{"  back: b\n"}</span>
          <span>{"  scroll_up: k\n"}</span>
          <span>{"  scroll_down: j\n"}</span>
        </pre>

        <aside className="config-notes">
          <div className="config-note">
            <b>registryUrl</b>
            Point at your own fork, or set to{" "}
            <code style={{ color: "var(--color-accent)" }}>false</code> for air-gapped
            networks. Env var <code>D0_REGISTRY_URL</code> wins when set.
          </div>
          <div className="config-note">
            <b>mcp.installedOnly</b>
            Hide community + seed entries from agents. Useful for team setups
            where only curated bundles should be exposed.
          </div>
          <div className="config-note">
            <b>keybindings</b>
            Every TUI key (<code>quit</code>, <code>search</code>,{" "}
            <code>back</code>, <code>forward</code>, <code>scroll_up/down</code>,{" "}
            <code>top/bottom</code>) is remappable.
          </div>
          <div className="config-note">
            <b>doc0 doctor · doc0 registry status</b>
            Sanity-check every registry entry; inspect the cache state and
            last-fetched timestamp before shipping a team setup.
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─── SHARED PRIMITIVES ─────────────────────────────────────────────────── */

function InstallBar() {
  return (
    <div
      className="inline-flex items-center gap-3 rounded-md px-4 py-2.5 font-mono text-[14.5px]"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <span style={{ color: "var(--color-fg-subtle)" }}>$</span>
      <span style={{ color: "var(--color-fg)" }}>npm i -g doc0</span>
    </div>
  );
}

function PrimaryCta({ children, href = "/docs" }: { children: React.ReactNode; href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium transition-transform hover:scale-[1.01]"
      style={{ background: "var(--color-accent)", color: "var(--color-accent-fg)" }}
    >
      {children}
      <span aria-hidden>→</span>
    </Link>
  );
}

function GhostCta({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium transition-colors"
      style={{
        border: "1px solid var(--color-border)",
        color: "var(--color-fg)",
        background: "transparent",
      }}
    >
      {children}
    </Link>
  );
}

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
      className={`relative overflow-hidden rounded-2xl p-8 md:p-12 ${className}`}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div>
          <Eyebrow>community registry</Eyebrow>
          <h2 className="mt-4 text-[clamp(1.6rem,3.2vw,2rem)] font-bold leading-tight tracking-[-0.015em]">
            One JSON file on GitHub. PRs are the UI.
          </h2>
          <p
            className="mt-4 max-w-md leading-relaxed"
            style={{ color: "var(--color-fg-muted)" }}
          >
            No servers. No accounts. Open a PR against{" "}
            <a
              href="https://github.com/doc0team/d0-registry"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-4"
              style={{ color: "var(--color-link)" }}
            >
              doc0team/d0-registry
            </a>{" "}
            and your docs source ships to every user within 24h.
          </p>
          <Link
            href="/docs/registry"
            className="mt-5 inline-flex items-center gap-1.5 text-sm"
            style={{ color: "var(--color-link)" }}
          >
            How the registry works →
          </Link>
        </div>

        <div className="term">
          <div className="term-bar">
            <span>~/.d0rc</span>
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
