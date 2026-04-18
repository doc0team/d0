"use client";

import { useCallback, useState } from "react";

const INSTALL_CMD = "npm i -g doczero";

export function InstallHeroBar() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="install-hero-bar">
      <div className="install-hero-command" aria-label={`Shell command: ${INSTALL_CMD}`}>
        <span className="install-hero-prompt">$</span>{" "}
        <span className="install-hero-npm">npm</span>
        <span className="install-hero-rest"> i -g doczero</span>
      </div>
      <button
        type="button"
        className="install-hero-copy"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy install command"}
      >
        {copied ? (
          <span className="install-hero-copied">Copied</span>
        ) : (
          <CopyIcon />
        )}
      </button>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="8"
        y="8"
        width="12"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M4 16V6a2 2 0 0 1 2-2h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
