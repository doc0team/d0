import { createHighlighter, type Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Lazily create a single shiki highlighter for the lifetime of the server process.
 *
 * @document0/mdx's rehypeShiki defaults to a `{ light: "github-light", dark: "github-dark" }` pair
 * and emits CSS variables (not inline colors), so both themes must be preloaded here even though
 * the site only renders the dark variant. `globals.css` forces `--shiki-dark` into the foreground.
 */
export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: [
        "bash",
        "shell",
        "powershell",
        "json",
        "jsonc",
        "yaml",
        "toml",
        "typescript",
        "tsx",
        "javascript",
        "jsx",
        "markdown",
        "mdx",
        "html",
        "css",
        "python",
        "go",
        "rust",
        "diff",
        "dockerfile",
        "ini",
        "xml",
        "sql",
      ],
    });
  }
  return highlighterPromise;
}
