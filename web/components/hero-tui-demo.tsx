"use client";

import { useEffect, useRef, useState } from "react";
import { TuiLogo } from "./tui-logo";

/**
 * Animated hero TUI demo. Mirrors the real `doc0` menu screen
 * (see `src/tui/panels.tsx`): starts as a blank terminal, types
 * `doc0 browse`, indicates the Enter press, then reveals the TUI.
 *
 * Phases:
 *   - idle      : blank shell, waiting for the demo to scroll into view
 *   - prompt    : blank shell with a typing caret (brief hold)
 *   - typing    : types "doc0 browse" character-by-character
 *   - submitted : typed command + `⏎` marker and "launching…" line
 *   - tui       : crossfade into the full TUI; first item statically
 *                 highlighted (no selection cycling, no blinking cursor)
 *
 * Honours `prefers-reduced-motion` by skipping straight to the `tui`
 * phase with the first item highlighted statically.
 */

const SITES: string[] = [
  "docs.anthropic.com",
  "nextjs.org",
  "react.dev",
  "docs.stack-auth.com",
  "www.typescriptlang.org",
];

const ITEMS: string[] = [...SITES.map((s) => `Open ${s}`), "Quit"];
/* Which row has the `›` indicator in the final TUI state. */
const SELECTED_INDEX = 0;

const COMMAND = "doc0 browse";
const PROMPT_HOLD_MS = 650;
const TYPE_INTERVAL_MS = 135;
const POST_TYPE_HOLD_MS = 900;
const SUBMIT_FLASH_MS = 700;
/* Start the sequence once this fraction of the demo is in the viewport. */
const VIEWPORT_THRESHOLD = 0.35;

type Phase = "idle" | "prompt" | "typing" | "submitted" | "tui";

export function HeroTuiDemo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [typedLen, setTypedLen] = useState(0);
  const reducedMotionRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Only start the animation once the user has scrolled the demo into view. */
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    reducedMotionRef.current = reduced;
    if (reduced) {
      setTypedLen(COMMAND.length);
      setPhase("tui");
      return;
    }

    const node = containerRef.current;
    if (!node) return;

    /* Environments without IntersectionObserver: start immediately. */
    if (typeof IntersectionObserver === "undefined") {
      setPhase("prompt");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setPhase((p) => (p === "idle" ? "prompt" : p));
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: VIEWPORT_THRESHOLD },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (phase !== "prompt") return;
    const t = window.setTimeout(() => setPhase("typing"), PROMPT_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "typing") return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTypedLen(i);
      if (i >= COMMAND.length) {
        window.clearInterval(id);
        window.setTimeout(() => setPhase("submitted"), POST_TYPE_HOLD_MS);
      }
    }, TYPE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "submitted") return;
    const t = window.setTimeout(() => setPhase("tui"), SUBMIT_FLASH_MS);
    return () => window.clearTimeout(t);
  }, [phase]);


  const showTui = phase === "tui";
  const showShell = !showTui;
  const showInlineCaret =
    phase === "idle" || phase === "prompt" || phase === "typing";

  return (
    <div
      ref={containerRef}
      className="hero-tui-demo"
      role="img"
      aria-label="doc0 interactive TUI showing the menu of popular documentation sites"
    >
      {/* Phase 1–3: shell prompt + typing + Enter indicator */}
      <div className={`hero-tui-shell ${showShell ? "is-visible" : "is-hidden"}`}>
        <div className="hero-tui-shell-line">
          <span className="hero-tui-shell-prompt">~</span>
          <span className="hero-tui-shell-sigil">%</span>
          <span className="hero-tui-shell-cmd">
            {COMMAND.slice(0, typedLen)}
          </span>
          {showInlineCaret ? <span className="hero-tui-caret hero-tui-caret-inline" /> : null}
          {phase === "submitted" ? (
            <span className="hero-tui-shell-enter" aria-hidden>
              {"  "}⏎
            </span>
          ) : null}
        </div>
        {phase === "submitted" ? (
          <div className="hero-tui-shell-launching" aria-hidden>
            launching doc0 browse…
          </div>
        ) : null}
      </div>

      {/* Phase 4: the full TUI */}
      <div className={`hero-tui-stage ${showTui ? "is-visible" : ""}`}>
        <div className="hero-tui-inner">
          <div className="hero-tui-logo-wrap">
            {/*
             * Mount TuiLogo only when we enter the tui phase so its scramble →
             * reveal → shimmer animation fires as the TUI crossfades in,
             * instead of running invisibly under opacity:0 during the shell
             * phase. After reveal the component continues its perpetual HSL
             * hue-shimmer, which is the main ambient motion in the TUI.
             */}
            {showTui ? <TuiLogo className="hero-tui-logo" /> : null}
          </div>

          <div className="hero-tui-caption">
            <div className="hero-tui-caption-title">Popular documentation sites</div>
            <div className="hero-tui-caption-sub">
              Pick one or enter any docs URL below
            </div>
          </div>

          <div className="hero-tui-search">
            <div className="hero-tui-search-label">Search</div>
            <div className="hero-tui-search-box">
              <span className="hero-tui-search-placeholder">
                Type docs URL then Enter (Tab to edit)
              </span>
            </div>
          </div>

          <ul className="hero-tui-list">
            {ITEMS.map((item, i) => {
              const isSel = i === SELECTED_INDEX;
              return (
                <li
                  key={item}
                  className={`hero-tui-row ${isSel ? "is-selected" : ""}`}
                >
                  <span className="hero-tui-arrow">{isSel ? "›" : "\u00A0"}</span>
                  <span className="hero-tui-item">{item}</span>
                </li>
              );
            })}
          </ul>

          <div className="hero-tui-keybar">
            <span className="hero-tui-rule">─</span>
            <KB k="Tab" d="Search / menu" />
            <KB k="Esc / S-Tab" d="Menu (from search)" />
            <KB k="k/j" d="Menu" />
            <KB k="Enter" d="Select" />
            <KB k="1–2" d="Jump" />
            <KB k="q" d="Quit" />
            <span className="hero-tui-rule">─</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function KB({ k, d }: { k: string; d: string }) {
  return (
    <span className="hero-tui-kb">
      <span className="hero-tui-kb-br">[</span>
      <span className="hero-tui-kb-key">{k}</span>
      <span className="hero-tui-kb-sep"> → </span>
      <span className="hero-tui-kb-desc">{d}</span>
      <span className="hero-tui-kb-br">]</span>
    </span>
  );
}
