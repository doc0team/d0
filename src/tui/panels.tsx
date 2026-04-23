import React, { useEffect, useMemo, useState } from "react";
import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import figlet from "figlet";
import type { Keybindings } from "../core/config.js";
import { tuiChrome as chrome } from "./chrome.js";

/** HSL (h 0–360, s/l 0–100) → `#rrggbb` for truecolor terminals. */
function hslToHex(h: number, s: number, l: number): string {
  const hh = h / 360;
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

type LogoTheme = {
  font: string;
  baseHue: number;
  hueWobble: number;
  saturation: number;
};
const LOGO_ANIM_EPOCH_MS = Date.now();

function activeLogoTheme(now: Date): LogoTheme {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  // Halloween season (Oct 20 - Nov 2): spooky fonts + orange palette.
  if ((m === 10 && d >= 20) || (m === 11 && d <= 2)) {
    return {
      font: "Poison",
      baseHue: 26,
      hueWobble: 12,
      saturation: 78,
    };
  }
  // Winter holidays (Dec 20 - Jan 3): denser fonts + cool winter blues.
  if ((m === 12 && d >= 20) || (m === 1 && d <= 3)) {
    return {
      font: "Block",
      baseHue: 200,
      hueWobble: 14,
      saturation: 45,
    };
  }
  return {
    font: "Roman",
    baseHue: 24,
    hueWobble: 10,
    saturation: 38,
  };
}

const SCRAMBLE_CHARS = ["▒", "░", "▓", "#", "*", "+", "=", ".", ":"];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function stableNoise(row: number, col: number): number {
  const x = Math.sin(row * 127.1 + col * 311.7 + 19.19) * 43758.5453;
  return x - Math.floor(x);
}

function animateGlyph(ch: string, row: number, col: number, tick: number, revealProgress: number): string {
  if (ch === " ") return " ";
  const gate = stableNoise(row, col);
  const scrambleIx = Math.abs((row * 17 + col * 31 + tick * 3) % SCRAMBLE_CHARS.length);
  const scramble = SCRAMBLE_CHARS[scrambleIx]!;
  if (revealProgress >= 1) return ch;
  return gate <= revealProgress ? ch : scramble;
}

function logoColor(rowIndex: number, colIndex: number, tick: number, gradientActive: boolean, theme: LogoTheme): string {
  if (!gradientActive) {
    return hslToHex(theme.baseHue, Math.max(18, theme.saturation - 18), 68);
  }
  const t = tick * 0.42 + rowIndex * 1.6 + colIndex * 1.15;
  const shimmer = Math.sin(t * 0.07) * 0.55;
  const hue = theme.baseHue + shimmer * theme.hueWobble;
  const sat = theme.saturation + shimmer * 6;
  const lit = 78 + shimmer * 4;
  return hslToHex(hue, sat, lit);
}

function renderFigletLines(text: string, font: string): string[] {
  const render = (f: string): string[] =>
    figlet
      .textSync(text, {
        font: f,
        horizontalLayout: "default",
        verticalLayout: "default",
        whitespaceBreak: true,
      })
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+$/g, ""))
      .filter((l) => l.length > 0);

  try {
    return render(font);
  } catch {
    // Never fail the TUI on a missing/invalid font name.
    try {
      return render("Standard");
    } catch {
      return [text];
    }
  }
}

function padLinesToFrame(lines: string[], frameW: number, frameH: number): string[] {
  const safeW = Math.max(1, frameW);
  const safeH = Math.max(1, frameH);
  const trimmed = lines.map((l) => (l.length <= safeW ? l : l.slice(0, safeW)));
  const topPad = Math.max(0, Math.floor((safeH - trimmed.length) / 2));
  const botPad = Math.max(0, safeH - trimmed.length - topPad);
  const out: string[] = [];
  for (let i = 0; i < topPad; i++) out.push(" ".repeat(safeW));
  for (const l of trimmed) {
    const left = Math.max(0, Math.floor((safeW - l.length) / 2));
    const right = Math.max(0, safeW - l.length - left);
    out.push(`${" ".repeat(left)}${l}${" ".repeat(right)}`);
  }
  for (let i = 0; i < botPad; i++) out.push(" ".repeat(safeW));
  return out.slice(0, safeH);
}

/** Animated figlet logo: fade-in/out, then next font. */
function TextAsciiD0Logo(): React.ReactElement {
  const FRAME_MS = 80;
  const REVEAL_MS = 1800;
  const [tick, setTick] = useState(0);
  const [theme, setTheme] = useState<LogoTheme>(() => activeLogoTheme(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), FRAME_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTheme(activeLogoTheme(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);

  const elapsedMs = Math.max(0, Date.now() - LOGO_ANIM_EPOCH_MS);
  const revealProgress = clamp01(elapsedMs / REVEAL_MS);
  const gradientActive = revealProgress >= 1;
  const font = theme.font;
  const renderedByFont = useMemo(() => [{ font, lines: renderFigletLines("doc0", font) }], [font]);
  const frameW = useMemo(
    () => Math.max(1, ...renderedByFont.flatMap((f) => f.lines.map((l) => l.length))),
    [renderedByFont],
  );
  const frameH = useMemo(
    () => Math.max(1, ...renderedByFont.map((f) => f.lines.length)),
    [renderedByFont],
  );
  const rawLines = useMemo(
    () => renderedByFont.find((f) => f.font === font)?.lines ?? renderFigletLines("doc0", font),
    [renderedByFont, font],
  );
  const padded = useMemo(() => padLinesToFrame(rawLines, frameW, frameH), [rawLines, frameW, frameH]);
  const animated = padded.map((row, ri) =>
    [...row].map((ch, ci) => animateGlyph(ch, ri, ci, tick, revealProgress)).join(""),
  );

  return (
    <Box flexDirection="column" alignItems="center">
      {animated.map((row, ri) => (
        <Box key={`d0r-${ri}`} flexDirection="row">
          {[...row].map((ch, ci) => (
            <Text key={`d0c-${ri}-${ci}`} color={logoColor(ri, ci, tick, gradientActive, theme)}>
              {ch === " " ? " " : ch}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}

/** Top border + title row (terminal panel chrome). */
export function PanelTitleBar({ title, width }: { title: string; width: number }): React.ReactElement {
  const fillLen = Math.max(0, width - title.length - 1);
  const fill = "─".repeat(fillLen);
  return (
    <Box marginBottom={1}>
      <Text>
        <Text bold color={chrome.panelTitle}>
          {title}
        </Text>
        <Text color={chrome.rule}> {fill}</Text>
      </Text>
    </Box>
  );
}

/** Plain length of one hint segment (must match JSX below, monospace). */
function keyHintSegmentPlainLen(it: { k: string; d: string }): number {
  return `[${it.k} → ${it.d}]`.length;
}

/**
 * Bottom status line: `─…─ [key → action] …` with warm keys (`accent`), muted brackets/labels (`rule`/`label`).
 * `width` is the usable inner terminal width (e.g. `columns - 2` when root has `padding={1}`).
 */
export function KeyBar({
  items,
  width,
}: {
  items: { k: string; d: string }[];
  width: number;
}): React.ReactElement {
  const gap = 2;
  let innerLen = 0;
  for (let i = 0; i < items.length; i++) {
    if (i > 0) innerLen += gap;
    innerLen += keyHintSegmentPlainLen(items[i]!);
  }
  const pad = Math.max(0, width - innerLen);
  const leftRule = Math.floor(pad / 2);
  const rightRule = pad - leftRule;
  const rule = "─";

  return (
    <Box flexShrink={0} width={width} justifyContent="center">
      <Text>
        {leftRule > 0 ? <Text color={chrome.rule}>{rule.repeat(leftRule)}</Text> : null}
        {items.map((it, i) => (
          <React.Fragment key={`${it.k}-${i}`}>
            {i > 0 ? <Text color={chrome.hintGap}>{" ".repeat(gap)}</Text> : null}
            <Text color={chrome.label}>[</Text>
            <Text color={chrome.accent}>{it.k}</Text>
            <Text color={chrome.label}> → {it.d}]</Text>
          </React.Fragment>
        ))}
        {rightRule > 0 ? <Text color={chrome.rule}>{rule.repeat(rightRule)}</Text> : null}
      </Text>
    </Box>
  );
}

export function browseSplitKeyHints(
  kb: Keybindings,
  opts?: { treeNav?: boolean },
): { k: string; d: string }[] {
  const items: { k: string; d: string }[] = [
    { k: kb.quit, d: "Quit" },
    { k: kb.search, d: "Search" },
    { k: kb.back, d: "Back" },
    { k: kb.forward, d: "Forward" },
    { k: `${kb.scroll_up}/${kb.scroll_down}`, d: "Scroll" },
    { k: "Enter", d: opts?.treeNav ? "Open/folder" : "Open" },
  ];
  if (opts?.treeNav) items.push({ k: "←/→", d: "Fold" });
  return items;
}

export function readModeKeyHints(kb: Keybindings): { k: string; d: string }[] {
  return [
    { k: kb.quit, d: "Quit" },
    { k: kb.search, d: "Search" },
    { k: kb.back, d: "Back" },
    { k: kb.forward, d: "Forward" },
    { k: `${kb.scroll_up}/${kb.scroll_down}`, d: "Scroll" },
    { k: `${kb.top}/${kb.bottom}`, d: "Top/end" },
    { k: kb.copy_page_url, d: "Copy URL" },
    { k: kb.copy_page_cli, d: "Copy CLI" },
  ];
}

export function searchPromptKeyHints(kb: Keybindings): { k: string; d: string }[] {
  return [
    { k: "Esc", d: "Cancel" },
    { k: "Enter", d: "Run search" },
    { k: kb.quit, d: "Quit" },
  ];
}

/**
 * Home splash search: full-width column centers a fixed-width field.
 * Border stays visible in both states — `@inkjs/ui` `TextInput` is plain text, not a framed control.
 */
export function HomeSearchField({
  width,
  focused,
  draft,
  onDraftChange,
  onSubmit,
  unfocusedHint = "(Tab to edit)",
  remountKey = "home-search",
}: {
  width: number;
  focused: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onSubmit: (v: string) => void;
  unfocusedHint?: string;
  remountKey?: string;
}): React.ReactElement {
  return (
    <Box flexDirection="column" width="100%" alignItems="center">
      <Box flexDirection="column" width={width}>
        <Box width={width} justifyContent="center">
          <Text color={chrome.label}>Search</Text>
        </Box>
        <Box
          borderStyle="single"
          borderColor={focused ? chrome.border : chrome.borderDim}
          width={width}
          paddingX={1}
        >
          {focused ? (
            <TextInput
              key={remountKey}
              placeholder="Query…"
              defaultValue={draft}
              onChange={onDraftChange}
              onSubmit={onSubmit}
            />
          ) : (
            <Text color={draft ? chrome.text : chrome.label}>{draft || unfocusedHint}</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Single-line nav / results row with fixed column width so paths never wrap and the split pane does not jump.
 * `text` should be the display string (already shortened if needed); this pads or hard-truncates to one line.
 */
export function SplitNavRow({
  marked,
  text,
  width,
}: {
  marked: boolean;
  text: string;
  width: number;
}): React.ReactElement {
  const prefix = marked ? "› " : "  ";
  const maxBody = Math.max(1, width - 2);
  const body =
    text.length <= maxBody ? text.padEnd(maxBody, " ") : `${text.slice(0, Math.max(1, maxBody - 1))}…`;
  return (
    <Box width={width} overflowX="hidden" flexShrink={0}>
      <Text bold={marked} color={marked ? chrome.bright : chrome.text}>
        {prefix}
        {body}
      </Text>
    </Box>
  );
}

/**
 * One markdown output line in a scroll region. Wrapped lines must not flex-shrink or later rows can
 * overlap earlier ones in Ink (symptom: first character of a line disappears until scroll moves).
 */
/**
 * One logical doc line; single terminal row (`truncate-end`).
 * Pass `width` (columns) so Ink clips ANSI-colored text to the pane; `width="100%"` alone mis-measures escapes.
 */
export function DocLine({ line, width }: { line: string; width?: number }): React.ReactElement {
  return (
    <Box flexShrink={0} width={width ?? "100%"} overflowX="hidden" overflowY="hidden">
      <Text wrap="truncate-end">{line || " "}</Text>
    </Box>
  );
}

/** Bordered strip showing the current search query in browse / results split view. */
export function BrowseInlineQueryBar({
  width,
  query,
  hintWhenEmpty = "Press / to refine search",
}: {
  width: number;
  query: string;
  hintWhenEmpty?: string;
}): React.ReactElement {
  const q = query.trim();
  const line = q ? q : hintWhenEmpty;
  return (
    <Box marginBottom={1} flexShrink={0}>
      <Box borderStyle="single" borderColor={chrome.borderDim} width={width} paddingX={1}>
        <Text color={q ? chrome.text : chrome.label}>{line}</Text>
      </Box>
    </Box>
  );
}

/** Centered splash: wordmark + subtitle + optional `searchSlot` + optional menu (binsider-style landing). */
export function HomeLanding({
  subtitle,
  options,
  selectedIndex,
  searchSlot,
}: {
  subtitle: string;
  options: string[];
  selectedIndex: number;
  /** e.g. `TextInput` for home search — place between subtitle and menu. */
  searchSlot?: React.ReactNode;
}): React.ReactElement {
  const menuRows = Math.max(options.length, 2);
  return (
    <Box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center" width="100%">
      <TextAsciiD0Logo />
      <Box marginY={1} />
      <Box flexDirection="column" width="100%" alignItems="stretch">
        {subtitle.split(/\r?\n/).map((line, i) => (
          <Box key={`${i}-${line.slice(0, 24)}`} width="100%" justifyContent="center">
            <Text color={chrome.label}>{line || " "}</Text>
          </Box>
        ))}
      </Box>
      {/* Reserve search slot height to avoid mount-time layout shift when TextInput appears. */}
      <Box marginY={1} minHeight={3} flexDirection="column" width="100%" justifyContent="center" alignItems="center">
        {searchSlot ?? <Text color={chrome.label}> </Text>}
      </Box>
      {options.length > 0 ? (
        <>
          <Box marginY={1} />
          <Box flexDirection="column" width="100%" alignItems="stretch">
            {options.map((label, i) => (
              <Box key={`${label}-${i}`} width="100%" justifyContent="center">
                <Text bold={i === selectedIndex} color={i === selectedIndex ? chrome.accent : chrome.text}>
                  {i === selectedIndex ? "› " : "  "}
                  {label}
                </Text>
              </Box>
            ))}
          </Box>
        </>
      ) : (
        <>
          <Box marginY={1} />
          <Box flexDirection="column" width="100%" alignItems="stretch">
            {Array.from({ length: menuRows }).map((_, i) => (
              <Box key={`menu-ph-${i}`} width="100%" justifyContent="center">
                <Text color={chrome.label}> </Text>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

export function homeMenuKeyHints(kb: Keybindings, opts?: { withSearchBar?: boolean }): { k: string; d: string }[] {
  if (opts?.withSearchBar) {
    return [
      { k: "Tab", d: "Search / menu" },
      { k: "Esc / S-Tab", d: "Menu (from search)" },
      { k: `${kb.scroll_up}/${kb.scroll_down}`, d: "Menu" },
      { k: "Enter", d: "Select" },
      { k: "1-2", d: "Jump" },
      { k: kb.quit, d: "Quit" },
    ];
  }
  return [
    { k: `${kb.scroll_up}/${kb.scroll_down}`, d: "Menu" },
    { k: "Enter", d: "Select" },
    { k: "1-3", d: "Jump" },
    { k: kb.quit, d: "Quit" },
  ];
}

/** Thin app header strip. */
export function AppHeader({
  breadcrumbPath,
  modeLabel,
}: {
  breadcrumbPath: string;
  modeLabel: string;
}): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor={chrome.border} paddingX={1} justifyContent="space-between">
      <Text>
        <Text bold color={chrome.bright}>
          d
        </Text>
        <Text bold color={chrome.accent}>
          0
        </Text>
        <Text color={chrome.label}>  {breadcrumbPath}</Text>
      </Text>
      <Text>
        <Text color={chrome.label}>[</Text>
        <Text color={chrome.accentCool}>{modeLabel}</Text>
        <Text color={chrome.label}>]</Text>
      </Text>
    </Box>
  );
}
