"use client";

import { useState } from "react";

type ProbeResult = {
  ok: boolean;
  entry?: Record<string, unknown>;
  signals?: { llms: boolean; llmsFull: boolean; sitemap: boolean };
  proposeUrl?: string;
  error?: string;
};

export function SourceProbeForm() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);

  async function submit() {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/registry/probe?url=${encodeURIComponent(url.trim())}`);
      setResult((await res.json()) as ProbeResult);
    } catch {
      setResult({ ok: false, error: "probe failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5 rounded-lg border p-4" style={{ borderColor: "var(--color-border)" }}>
      <div className="text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
        Paste docs URL to pre-fill registry entry
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.example.com"
          className="min-w-[280px] flex-1 rounded-md border px-3 py-2 text-[13px]"
          style={{ borderColor: "var(--color-border)", background: "var(--color-bg-soft)" }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="rounded-md px-4 py-2 text-[13px] font-medium"
          style={{ background: "var(--color-accent)", color: "var(--color-accent-fg)" }}
        >
          {loading ? "Probing..." : "Probe"}
        </button>
      </div>
      {result?.ok ? (
        <div className="mt-3 text-[12px]" style={{ color: "var(--color-fg-muted)" }}>
          <div>
            Detected signals: llms.txt {result.signals?.llms ? "yes" : "no"} · llms-full{" "}
            {result.signals?.llmsFull ? "yes" : "no"} · sitemap {result.signals?.sitemap ? "yes" : "no"}
          </div>
          <pre className="mt-2 overflow-x-auto rounded-md border p-3" style={{ borderColor: "var(--color-border)" }}>
            {JSON.stringify(result.entry, null, 2)}
          </pre>
          {result.proposeUrl ? (
            <a href={result.proposeUrl} target="_blank" rel="noreferrer" style={{ color: "var(--color-link)" }}>
              Open pre-filled GitHub editor →
            </a>
          ) : null}
        </div>
      ) : null}
      {result && !result.ok ? (
        <div className="mt-3 text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
          {result.error ?? "Could not probe URL"}
        </div>
      ) : null}
    </div>
  );
}
