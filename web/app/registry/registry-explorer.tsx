"use client";

import { useCallback, useMemo, useState } from "react";
import type { RegistryEntry } from "./types";

export function RegistryExplorer({ entries }: { entries: RegistryEntry[] }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalizedQuery) return entries;
    return entries.filter((e) => {
      if (e.id.toLowerCase().includes(normalizedQuery)) return true;
      if (e.description?.toLowerCase().includes(normalizedQuery)) return true;
      if (e.aliases?.some((a) => a.toLowerCase().includes(normalizedQuery))) return true;
      try {
        if (new URL(e.source).hostname.toLowerCase().includes(normalizedQuery)) return true;
      } catch {
        /* ignore */
      }
      return false;
    });
  }, [entries, normalizedQuery]);

  return (
    <>
      <div className="mt-6">
        <label htmlFor="registry-search" className="sr-only">
          Search registry
        </label>
        <div
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <span style={{ color: "var(--color-fg-subtle)" }} aria-hidden>
            /
          </span>
          <input
            id="registry-search"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter id, alias, host…"
            className="min-w-0 flex-1 bg-transparent py-0.5 text-[14px] outline-none placeholder:opacity-55"
            style={{
              color: "var(--color-fg)",
              fontFamily: "var(--font-sans)",
            }}
          />
          {normalizedQuery ? (
            <span className="shrink-0 tabular-nums text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
              {filtered.length}/{entries.length}
            </span>
          ) : (
            <span className="shrink-0 tabular-nums text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
              {entries.length}
            </span>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          className="mt-8 rounded-lg px-4 py-10 text-center"
          style={{
            background: "var(--color-surface)",
            border: "1px dashed var(--color-border)",
          }}
        >
          <p className="text-[14px]" style={{ color: "var(--color-fg-muted)" }}>
            No entries match &ldquo;{query}&rdquo;.
          </p>
          <p className="mt-2 text-[13px]" style={{ color: "var(--color-fg-subtle)" }}>
            PR:{" "}
            <a
              href="https://github.com/doc0team/d0-registry"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-4"
              style={{ color: "var(--color-link)" }}
            >
              doc0team/d0-registry
            </a>
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((entry) => (
            <li key={entry.id}>
              <EntryCard entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function browseCommand(id: string): string {
  return `doc0 browse ${id}`;
}

function EntryCard({ entry }: { entry: RegistryEntry }) {
  const cmd = browseCommand(entry.id);
  const host = (() => {
    try {
      return new URL(entry.source).hostname.replace(/^www\./, "");
    } catch {
      return entry.source;
    }
  })();

  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors duration-150 hover:border-[var(--color-border-strong)]"
    >
      <div className="flex-1 px-4 pt-3.5 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            className="min-w-0 truncate font-mono text-[14px] font-semibold leading-none tracking-[-0.01em]"
            style={{ color: "var(--color-fg)" }}
            title={entry.id}
          >
            {entry.id}
          </h2>
          <a
            href={entry.source}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 font-mono text-[11px] leading-none transition-colors hover:text-[var(--color-link-soft)]"
            style={{ color: "var(--color-link)" }}
            title={entry.source}
          >
            {host}↗
          </a>
        </div>
        <p
          className="mt-3 line-clamp-2 min-h-[2.4em] text-[12.5px] leading-[1.2]"
          style={{ color: "var(--color-fg-muted)" }}
          title={entry.description ?? undefined}
        >
          {entry.description ?? ""}
        </p>
      </div>

      <div
        className="flex items-stretch gap-px border-t font-mono text-[12px]"
        style={{ borderColor: "var(--color-border)", background: "var(--color-bg-soft)" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden pl-3 pr-2 py-2">
          <span className="shrink-0" style={{ color: "var(--color-fg-subtle)" }}>$</span>
          <span className="min-w-0 truncate" style={{ color: "var(--color-fg)" }} title={cmd}>
            <span style={{ fontWeight: 600 }}>doc0 browse </span>
            <span style={{ color: "var(--color-accent)", fontWeight: 600 }}>{entry.id}</span>
          </span>
        </div>
        <CopyCmdButton text={cmd} />
      </div>
    </article>
  );
}

function CopyCmdButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("ok");
      window.setTimeout(() => setState("idle"), 1100);
    } catch {
      setState("err");
      window.setTimeout(() => setState("idle"), 1100);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={onCopy}
      className="flex w-10 shrink-0 items-center justify-center border-l border-[var(--color-border)] text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
      aria-label={`Copy ${text}`}
      title={`Copy: ${text}`}
    >
      {state === "ok" ? (
        <span className="text-[12px] font-semibold" style={{ color: "var(--color-accent)" }}>✓</span>
      ) : state === "err" ? (
        <span className="text-[11px]">!</span>
      ) : (
        <CopyGlyph />
      )}
    </button>
  );
}

function CopyGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
