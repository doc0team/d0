import { codeToANSI } from "@shikijs/cli";
import { bundledLanguages } from "shiki/langs";
import type { BundledLanguage, BundledTheme } from "shiki";
import { marked, type Token, type Tokens } from "marked";
import chalk from "chalk";
import sliceAnsi from "slice-ansi";
import stringWidth from "string-width";

/** `rich` = saturated terminal colors (CLI). `subtle` = grayscale / low-contrast (Ink TUI, OpenCode-like). */
export type MarkdownTerminalPalette = "rich" | "subtle";

export type MarkdownToTerminalOptions = {
  palette?: MarkdownTerminalPalette;
  /**
   * When set (TUI / measured terminal), code fences and long highlighted lines are clipped to this
   * **display width** so borders and ANSI tokens cannot spill past the pane.
   */
  contentWidth?: number;
};

/** Truncate one logical line to a maximum **visual** width (ANSI-safe). */
export function truncateAnsiLine(line: string, maxWidth: number): string {
  if (maxWidth < 1) return "";
  const w = stringWidth(line);
  if (w <= maxWidth) return line;
  if (maxWidth === 1) return "…";
  return sliceAnsi(line, 0, maxWidth - 1) + "…";
}

function truncateAnsiBlock(text: string, maxWidth: number): string {
  return text
    .split("\n")
    .map((ln) => truncateAnsiLine(ln, maxWidth))
    .join("\n");
}

/** Map fence tags and common aliases to Shiki bundled language ids. */
function resolveShikiLang(tag: string | undefined): BundledLanguage {
  if (!tag?.trim()) return "typescript";
  const t = tag.trim().toLowerCase();
  const alias: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    rs: "rust",
    kt: "kotlin",
    kts: "kotlin",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    yml: "yaml",
    md: "markdown",
    jsonc: "jsonc",
    vue: "vue",
    svelte: "svelte",
  };
  const id = alias[t] ?? t;
  if (id in bundledLanguages) return id as BundledLanguage;
  return "typescript";
}

function shikiThemeFor(subtle: boolean, theme: "dark" | "light"): BundledTheme {
  if (subtle) {
    return theme === "dark" ? "nord" : "min-light";
  }
  return theme === "dark" ? "github-dark" : "github-light";
}

/** Chalk fallback when Shiki cannot highlight (offline / unknown edge cases). */
function highlightCodeBlockFallback(code: string, lang: string | undefined, subtle: boolean, theme: "dark" | "light"): string {
  if (subtle) {
    const line = theme === "dark" ? chalk.hex("#c6c6c6") : chalk.hex("#3a3a3a");
    return code
      .split("\n")
      .map((l) => line(l))
      .join("\n");
  }
  if (lang && ["bash", "sh", "shell", "zsh"].includes(lang)) {
    return code
      .split("\n")
      .map((l) => chalk.cyan(l))
      .join("\n");
  }
  const kw = /\b(const|let|var|function|return|async|await|import|from|export|default|if|else|class|interface|type|new|this)\b/g;
  return code.split("\n").map((ln) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(ln)) return chalk.gray(ln);
    return ln.replace(kw, (w) => chalk.magenta(w));
  }).join("\n");
}

async function highlightCodeBlock(
  code: string,
  lang: string | undefined,
  subtle: boolean,
  theme: "dark" | "light",
): Promise<string> {
  const shikiLang = resolveShikiLang(lang);
  const shikiTheme = shikiThemeFor(subtle, theme);
  try {
    const ansi = await codeToANSI(code, shikiLang, shikiTheme);
    return ansi.replace(/\n$/, "");
  } catch {
    try {
      const ansi = await codeToANSI(code, "typescript", shikiTheme);
      return ansi.replace(/\n$/, "");
    } catch {
      return highlightCodeBlockFallback(code, lang, subtle, theme);
    }
  }
}

function renderInline(tokens: Token[] | undefined, theme: "dark" | "light", subtle: boolean): string {
  if (!tokens?.length) return "";
  const link = subtle
    ? theme === "dark"
      ? chalk.hex("#9a9a9a").underline
      : chalk.hex("#555555").underline
    : theme === "dark"
      ? chalk.blue.underline
      : chalk.blueBright.underline;
  let out = "";
  for (const t of tokens) {
    switch (t.type) {
      case "text":
        out += (t as Tokens.Text).text;
        break;
      case "escape":
        out += (t as Tokens.Escape).text;
        break;
      case "strong":
        out += subtle
          ? chalk.bold.hex(theme === "dark" ? "#eaeaea" : "#111111")(renderInline((t as Tokens.Strong).tokens, theme, subtle))
          : chalk.bold.whiteBright(renderInline((t as Tokens.Strong).tokens, theme, subtle));
        break;
      case "em":
        out += subtle
          ? chalk.italic.hex(theme === "dark" ? "#8a8a8a" : "#666666")(renderInline((t as Tokens.Em).tokens, theme, subtle))
          : chalk.italic.gray(renderInline((t as Tokens.Em).tokens, theme, subtle));
        break;
      case "codespan":
        out += subtle
          ? chalk.hex("#6a6a6a")("`") +
            chalk.hex(theme === "dark" ? "#c0c0c0" : "#444444")((t as Tokens.Codespan).text) +
            chalk.hex("#6a6a6a")("`")
          : chalk.gray("`") + chalk.magentaBright((t as Tokens.Codespan).text) + chalk.gray("`");
        break;
      case "link":
        // Terminal: show link text only; appending every href reads like noise on doc pages.
        out += link(renderInline((t as Tokens.Link).tokens, theme, subtle));
        break;
      case "del":
        out += chalk.strikethrough(renderInline((t as Tokens.Del).tokens, theme, subtle));
        break;
      case "br":
        out += "\n";
        break;
      default:
        out += (t as Tokens.Generic).raw ?? "";
    }
  }
  return out;
}

export async function markdownToTerminal(
  md: string,
  theme: "dark" | "light",
  opts?: MarkdownToTerminalOptions,
): Promise<string> {
  const subtle = opts?.palette === "subtle";
  const cw = opts?.contentWidth;
  const tokens = marked.lexer(md, { gfm: true });
  const h1 = subtle
    ? chalk.bold.hex(theme === "dark" ? "#e4e4e4" : "#1a1a1a")
    : theme === "dark"
      ? chalk.bold.cyan
      : chalk.bold.blue;
  const h2 = subtle
    ? chalk.bold.hex(theme === "dark" ? "#d0d0d0" : "#252525")
    : theme === "dark"
      ? chalk.bold.green
      : chalk.bold.greenBright;
  const h3 = subtle
    ? chalk.bold.hex(theme === "dark" ? "#bcbcbc" : "#333333")
    : theme === "dark"
      ? chalk.bold.yellow
      : chalk.bold.yellowBright;
  let out = "";
  for (const t of tokens) {
    switch (t.type) {
      case "heading": {
        const h = t as Tokens.Heading;
        const text = renderInline(h.tokens, theme, subtle);
        if (h.depth === 1) out += "\n" + h1(text) + "\n\n";
        else if (h.depth === 2) out += "\n" + h2(text) + "\n\n";
        else out += "\n" + h3(text) + "\n\n";
        break;
      }
      case "paragraph":
        out += renderInline((t as Tokens.Paragraph).tokens, theme, subtle) + "\n\n";
        break;
      case "code": {
        const c = t as Tokens.Code;
        const borderChar = "─";
        const borderColor = subtle
          ? theme === "dark"
            ? chalk.hex("#3a3a3a")
            : chalk.hex("#cccccc")
          : chalk.gray;
        const ruleLen = cw !== undefined ? Math.max(3, cw) : 56;
        const border = borderColor(borderChar.repeat(ruleLen));
        let body = await highlightCodeBlock(c.text, c.lang, subtle, theme);
        if (cw !== undefined) body = truncateAnsiBlock(body, cw);
        out += "\n" + border + "\n" + body + "\n" + border + "\n\n";
        break;
      }
      case "blockquote": {
        const b = t as Tokens.Blockquote;
        let inner = "";
        for (const x of b.tokens) {
          if (x.type === "paragraph") inner += renderInline((x as Tokens.Paragraph).tokens, theme, subtle) + "\n";
          else inner += (x as Tokens.Generic).raw ?? "";
        }
        const bar = subtle ? chalk.hex("#505050") : chalk.dim;
        out += bar(inner.trimEnd().split("\n").map((l) => "│ " + l).join("\n")) + "\n\n";
        break;
      }
      case "list": {
        const list = t as Tokens.List;
        for (const item of list.items) {
          const bullet = list.ordered ? "1. " : "• ";
          out += "  " + bullet + renderInline(item.tokens, theme, subtle).replace(/^\s+/, "") + "\n";
        }
        out += "\n";
        break;
      }
      case "hr": {
        const hrLen = cw !== undefined ? Math.max(3, cw) : 48;
        out += (subtle ? chalk.hex(theme === "dark" ? "#333333" : "#dddddd") : chalk.gray)("\n" + "─".repeat(hrLen) + "\n\n");
        break;
      }
      case "space":
        break;
      default:
        out += (t as Tokens.Generic).raw ?? "";
    }
  }
  return out.trimEnd() + "\n";
}

export function stripToPlain(md: string): string {
  const tokens = marked.lexer(md, { gfm: true });
  const walkInline = (inline: Token[] | undefined): string => {
    if (!inline) return "";
    let s = "";
    for (const t of inline) {
      if (t.type === "text" || t.type === "escape") s += (t as Tokens.Text).text;
      else if (t.type === "codespan") s += (t as Tokens.Codespan).text;
      else if (t.type === "link") s += walkInline((t as Tokens.Link).tokens) + ` (${(t as Tokens.Link).href})`;
      else if (t.type === "strong" || t.type === "em" || t.type === "del") {
        const tok = t as Tokens.Strong | Tokens.Em | Tokens.Del;
        s += walkInline(tok.tokens);
      } else s += (t as Tokens.Generic).raw ?? "";
    }
    return s;
  };
  let out = "";
  for (const t of tokens) {
    if (t.type === "heading") out += walkInline((t as Tokens.Heading).tokens) + "\n\n";
    else if (t.type === "paragraph") out += walkInline((t as Tokens.Paragraph).tokens) + "\n\n";
    else if (t.type === "code") out += (t as Tokens.Code).text + "\n\n";
    else if (t.type === "list") {
      for (const item of (t as Tokens.List).items) {
        out += "- " + walkInline(item.tokens) + "\n";
      }
      out += "\n";
    } else if (t.type === "blockquote") {
      for (const inner of (t as Tokens.Blockquote).tokens) {
        if (inner.type === "paragraph") out += walkInline((inner as Tokens.Paragraph).tokens) + "\n";
      }
      out += "\n";
    } else out += (t as Tokens.Generic).raw ?? "";
  }
  return out.trim();
}
