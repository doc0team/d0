"use client";

import { useEffect, useRef } from "react";

/**
 * "doc0" rendered with figlet's Roman font. Pre-computed at author time so the
 * browser bundle never ships a figlet runtime. If the TUI logo font ever changes
 * (see src/tui/panels.tsx `activeLogoTheme`), regenerate with:
 *
 *   node -e "console.log(require('figlet').textSync('doc0',{font:'Roman'}))"
 */
const LOGO_LINES: string[] = [
  "      .o8                        .oooo.   ",
  '     "888                       d8P\'`Y8b  ',
  " .oooo888   .ooooo.   .ooooo.  888    888 ",
  "d88' `888  d88' `88b d88' `\"Y8 888    888 ",
  "888   888  888   888 888       888    888 ",
  "888   888  888   888 888   .o8 `88b  d88' ",
  "`Y8bod88P\" `Y8bod8P' `Y8bod8P'  `Y8bd8P'  ",
];

/**
 * Default TUI theme pulled from `src/tui/panels.tsx` `activeLogoTheme`:
 *   baseHue: 24, hueWobble: 10, saturation: 38
 * i.e. warm sandy beige with a slow ±10° shimmer. Matches `chrome.ts` accent.
 */
const BASE_HUE = 24;
const HUE_WOBBLE = 10;
const SATURATION = 38;

/** Same character set the TUI uses during the reveal phase. */
const SCRAMBLE_CHARS = ["▒", "░", "▓", "#", "*", "+", "=", ".", ":"];

const FRAME_MS = 80;
const REVEAL_MS = 1800;

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360 / 360;
  const ss = s / 100;
  const ll = l / 100;
  let r: number;
  let g: number;
  let b: number;
  if (ss === 0) {
    r = g = b = ll;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    r = hue2rgb(p, q, hh + 1 / 3);
    g = hue2rgb(p, q, hh);
    b = hue2rgb(p, q, hh - 1 / 3);
  }
  const to = (x: number) =>
    Math.round(Math.min(255, Math.max(0, x * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function stableNoise(row: number, col: number): number {
  const x = Math.sin(row * 127.1 + col * 311.7 + 19.19) * 43758.5453;
  return x - Math.floor(x);
}

function logoColor(row: number, col: number, tick: number, gradient: boolean): string {
  if (!gradient) {
    return hslToHex(BASE_HUE, Math.max(18, SATURATION - 18), 68);
  }
  const t = tick * 0.42 + row * 1.6 + col * 1.15;
  const shimmer = Math.sin(t * 0.07) * 0.55;
  return hslToHex(
    BASE_HUE + shimmer * HUE_WOBBLE,
    SATURATION + shimmer * 6,
    78 + shimmer * 4,
  );
}

/**
 * Animated d0 TUI wordmark.
 *
 * Mirrors the TUI `TextAsciiD0Logo` component:
 *   - reveal phase (≤1.8s): non-space cells scramble → final glyph, keyed by stable noise
 *   - shimmer phase (after reveal): HSL hue wobbles per-cell, cheap sine gradient
 *
 * Implementation note: we only render text nodes (not thousands of span.ch
 * elements) and mutate `nodeValue` + `color` on each frame. This keeps
 * rendering off the React reconciler so the hero stays smooth on low-end mobile.
 */
export function TuiLogo({
  className,
  ariaLabel = "doc0",
}: {
  className?: string;
  ariaLabel?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const spans = Array.from(root.querySelectorAll<HTMLSpanElement>("span.ch"));
    const cells = spans.map((el) => {
      const row = Number(el.dataset.r ?? "0");
      const col = Number(el.dataset.c ?? "0");
      const ch = el.dataset.ch ?? " ";
      return { el, row, col, ch, gate: stableNoise(row, col) };
    });

    const startedAt = performance.now();
    let rafId = 0;
    let lastTick = -1;

    const loop = (now: number) => {
      const elapsed = now - startedAt;
      const revealProgress = Math.max(0, Math.min(1, elapsed / REVEAL_MS));
      const tick = Math.floor(elapsed / FRAME_MS);
      const gradient = revealProgress >= 1;

      if (tick !== lastTick) {
        lastTick = tick;
        for (const cell of cells) {
          if (cell.ch === " ") {
            continue;
          }
          let text: string;
          if (revealProgress >= 1 || cell.gate <= revealProgress) {
            text = cell.ch;
          } else {
            const ix =
              Math.abs((cell.row * 17 + cell.col * 31 + tick * 3) % SCRAMBLE_CHARS.length);
            text = SCRAMBLE_CHARS[ix] ?? cell.ch;
          }
          if (cell.el.firstChild && cell.el.firstChild.nodeValue !== text) {
            cell.el.firstChild.nodeValue = text;
          }
          cell.el.style.color = logoColor(cell.row, cell.col, tick, gradient);
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      ref={rootRef}
      className={`tui-logo ${className ?? ""}`}
      role="img"
      aria-label={ariaLabel}
    >
      {LOGO_LINES.map((row, ri) => (
        <span key={ri} className="row" aria-hidden>
          {Array.from(row).map((ch, ci) => (
            <span
              key={ci}
              className="ch"
              data-r={ri}
              data-c={ci}
              data-ch={ch}
            >
              {ch === " " ? "\u00A0" : ch}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}
