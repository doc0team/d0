import type { LoadedBundle } from "../core/bundle.js";
import { readPageMarkdown } from "../core/bundle.js";
import { markdownToTerminal } from "./renderer.js";
import type { D0Config } from "../core/config.js";

export async function renderPageForTui(
  bundle: LoadedBundle,
  slug: string,
  config: D0Config,
): Promise<string> {
  const md = await readPageMarkdown(bundle, slug);
  const cols =
    typeof process.stdout.columns === "number" && process.stdout.columns > 0 ? process.stdout.columns : 100;
  return await markdownToTerminal(md, config.theme, { contentWidth: Math.max(40, cols - 2) });
}
