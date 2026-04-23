"use client";

import { useState } from "react";

export function PageActions({
  docId,
  slug,
}: {
  docId: string;
  slug?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const terminalCommand = slug ? `doc0 ${docId} read ${slug}` : `doc0 ${docId}`;
  const cursorConfig = encodeURIComponent(
    JSON.stringify({
      mcpServers: {
        d0: { command: "doc0", args: ["mcp"] },
      },
    }),
  );
  const cursorUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=d0&config=${cursorConfig}`;

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => copy(terminalCommand, "terminal")}
        className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium"
        style={{ background: "var(--color-accent)", color: "var(--color-accent-fg)" }}
      >
        {copied === "terminal" ? "Copied command" : "Open in terminal"}
      </button>
      <a
        href={cursorUrl}
        className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px]"
        style={{
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
          color: "var(--color-fg)",
        }}
      >
        Add to Cursor
      </a>
      {copied === "failed" ? (
        <span className="text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
          Clipboard unavailable
        </span>
      ) : null}
    </div>
  );
}
