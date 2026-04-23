import type { Metadata } from "next";
import { RegistryExplorer } from "./registry-explorer";
import type { RegistryBuildStatus, RegistryDocument, RegistryEntry } from "./types";
import { SourceProbeForm } from "./source-probe-form";
import { fetchHostedIndex } from "@/lib/hosted-bundles";

/**
 * Matches the CLI's 24h community-registry cache cadence. If you bump this, also consider
 * bumping `COMMUNITY_REGISTRY_TTL_MS` in `src/core/registry-client.ts` so the web and the
 * CLI stay in lockstep.
 */
export const revalidate = 86_400;

const REGISTRY_URL =
  "https://raw.githubusercontent.com/doc0team/d0-registry/main/registry.json";

export const metadata: Metadata = {
  title: "Registry",
  description:
    "Every documentation source in the doc0 community registry. One JSON file on GitHub — PRs are the UI.",
};

type FetchResult =
  | { ok: true; entries: RegistryEntry[]; fetchedAt: string }
  | { ok: false; error: string };

async function fetchRegistry(): Promise<FetchResult> {
  try {
    const res = await fetch(REGISTRY_URL, {
      headers: { accept: "application/json" },
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return { ok: false, error: `upstream returned ${res.status}` };
    }
    const body = (await res.json()) as RegistryDocument | RegistryEntry[];
    const rawEntries = Array.isArray(body) ? body : body.entries;
    if (!Array.isArray(rawEntries)) {
      return { ok: false, error: "registry payload has no entries array" };
    }
    const entries = rawEntries
      .filter((e): e is RegistryEntry => {
        return (
          !!e &&
          typeof e === "object" &&
          typeof e.id === "string" &&
          e.sourceType === "url" &&
          typeof e.source === "string"
        );
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    return { ok: true, entries, fetchedAt: new Date().toISOString() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function RegistryPage() {
  const result = await fetchRegistry();
  const hosted = await fetchHostedIndex();
  const statusById: Record<string, RegistryBuildStatus> = {};
  if (hosted) {
    const now = Date.now();
    for (const [id, entry] of Object.entries(hosted.entries)) {
      const v = entry.latest;
      const latest = v ? entry.versions[v] : undefined;
      const builtAt = latest?.builtAt;
      const age = builtAt ? now - Date.parse(builtAt) : Number.POSITIVE_INFINITY;
      statusById[id] = {
        latestVersion: v,
        builtAt,
        pages: latest?.pages,
        state: !latest ? "missing" : age <= 48 * 60 * 60 * 1000 ? "healthy" : "stale",
      };
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-16 md:pt-20">
      <Header count={result.ok ? result.entries.length : null} />

      {result.ok ? (
        <RegistryExplorer entries={result.entries} statusById={statusById} />
      ) : (
        <ErrorState message={result.error} />
      )}

      <ContributeBand className="mt-20" />

      {result.ok ? (
        <p
          className="mt-12 text-center text-[12px]"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          Snapshot taken {formatTimestamp(result.fetchedAt)}. Cached for 24
          hours, matching the CLI&rsquo;s fetch cadence.
        </p>
      ) : null}
    </div>
  );
}

function Header({ count }: { count: number | null }) {
  return (
    <section>
      <span
        className="text-[11px] uppercase tracking-[0.18em]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        community registry
      </span>
      <h1
        className="mt-4 font-bold tracking-[-0.02em]"
        style={{ fontSize: "clamp(2rem, 4.5vw, 2.75rem)", lineHeight: 1.05 }}
      >
        {count !== null ? (
          <>
            <span style={{ color: "var(--color-accent)" }}>{count}</span>{" "}
            documentation {count === 1 ? "source" : "sources"}, curated by PR.
          </>
        ) : (
          "The community registry."
        )}
      </h1>
      <p
        className="mt-5 max-w-2xl text-[1.05rem] leading-relaxed"
        style={{ color: "var(--color-fg-muted)" }}
      >
        Every entry below is a line in{" "}
        <a
          href="https://github.com/doc0team/d0-registry/blob/main/registry.json"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted underline-offset-4"
          style={{ color: "var(--color-link)" }}
        >
          one JSON file on GitHub
        </a>
        . The doc0 CLI fetches it once per 24h and merges it into your local
        registry.         Run{" "}
        <code
          className="font-mono text-[0.95em]"
          style={{ color: "var(--color-accent)" }}
        >
          doc0 browse &lt;id&gt;
        </code>{" "}
        in a terminal to open the TUI for any URL-backed entry.
      </p>
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="mt-12 rounded-xl px-6 py-10 text-center"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <p className="text-[14px]" style={{ color: "var(--color-fg-muted)" }}>
        Couldn&rsquo;t load the live registry.
      </p>
      <p
        className="mt-2 font-mono text-[12px]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        {message}
      </p>
      <p className="mt-4 text-[13px]" style={{ color: "var(--color-fg-muted)" }}>
        You can still view it directly on{" "}
        <a
          href="https://github.com/doc0team/d0-registry/blob/main/registry.json"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted underline-offset-4"
          style={{ color: "var(--color-link)" }}
        >
          GitHub
        </a>
        .
      </p>
    </div>
  );
}

function ContributeBand({ className = "" }: { className?: string }) {
  return (
    <section
      className={`rounded-2xl p-8 md:p-10 ${className}`}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div>
          <span
            className="text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            add a source
          </span>
          <h2 className="mt-3 text-[clamp(1.35rem,2.4vw,1.65rem)] font-semibold leading-tight tracking-[-0.015em]">
            Don&rsquo;t see your docs? One click, one PR.
          </h2>
          <p
            className="mt-3 max-w-md leading-relaxed"
            style={{ color: "var(--color-fg-muted)" }}
          >
            The button below opens{" "}
            <code
              className="font-mono text-[0.95em]"
              style={{ color: "var(--color-accent)" }}
            >
              registry.json
            </code>{" "}
            in GitHub&rsquo;s web editor. Add your entry, commit the change,
            and GitHub auto-forks, creates a branch, and opens a PR form
            pre-filled from our template. CI validates the JSON shape before
            review.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={buildProposeUrl()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium"
              style={{
                background: "var(--color-accent)",
                color: "var(--color-accent-fg)",
              }}
            >
              Submit your documentation →
            </a>
            <a
              href="https://github.com/doc0team/d0-registry/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px]"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-fg)",
              }}
            >
              Contribution guide
            </a>
          </div>
          <SourceProbeForm />
          <ol
            className="mt-5 space-y-1 text-[12.5px]"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            <li>
              <span style={{ color: "var(--color-fg-muted)" }}>1.</span> Edit{" "}
              <span className="font-mono">registry.json</span> in GitHub (auto-forks if needed)
            </li>
            <li>
              <span style={{ color: "var(--color-fg-muted)" }}>2.</span> Commit
              the change — the commit message is pre-filled
            </li>
            <li>
              <span style={{ color: "var(--color-fg-muted)" }}>3.</span> Fill
              out the PR checklist and submit
            </li>
          </ol>
        </div>

        <pre
          className="overflow-x-auto rounded-lg p-4 font-mono text-[12px] leading-relaxed"
          style={{
            background: "var(--color-bg-soft)",
            border: "1px solid var(--color-border)",
            color: "var(--color-fg)",
          }}
        >
{`{
  "id": "tanstack-query",
  "aliases": ["react query"],
  "sourceType": "url",
  "source": "https://tanstack.com/query/latest/docs",
  "description": "TanStack Query documentation"
}`}
        </pre>
      </div>
    </section>
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/**
 * GitHub's `edit/<branch>/<path>` URL opens the web editor. Signed-in users without write
 * access get auto-forked on first commit. The `message` + `description` query params
 * pre-fill the commit dialog, so committing only asks the user to confirm.
 * GitHub then redirects to the PR form and populates the body from PULL_REQUEST_TEMPLATE.md.
 */
function buildProposeUrl(): string {
  const base = "https://github.com/doc0team/d0-registry/edit/main/registry.json";
  const params = new URLSearchParams({
    message: "registry: add <your-id>",
    description:
      "Adds a new documentation source. See the PR checklist for the rules this entry follows.",
  });
  return `${base}?${params.toString()}`;
}
