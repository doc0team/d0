import { findInstalledBundle } from "../core/storage.js";
import { loadBundle, readPageMarkdown } from "../core/bundle.js";
import type { D0Config } from "../core/config.js";
import { resolveReadOutput } from "../utils/output.js";
import { markdownToTerminal } from "../utils/markdown.js";
import { isUrlLike, readDocUrl } from "../core/web-docs.js";

export async function cmdRead(
  pkg: string,
  slug: string | undefined,
  opts: { json?: boolean; raw?: boolean },
  config: D0Config,
): Promise<void> {
  if (!slug?.trim()) {
    console.error("Usage: doc0 <pkg> read <slug>");
    process.exitCode = 1;
    return;
  }
  const ref = await findInstalledBundle(pkg);
  if (!ref) {
    console.error(`d0: bundle not installed: ${pkg}`);
    process.exitCode = 1;
    return;
  }
  const bundle = await loadBundle(ref.root);
  const mode = resolveReadOutput(config, opts);
  let md: string;
  try {
    md = await readPageMarkdown(bundle, slug.trim());
  } catch {
    console.error(`doc0 read: unknown slug: ${slug}`);
    process.exitCode = 1;
    return;
  }

  if (mode === "json") {
    console.log(
      JSON.stringify({
        bundle: bundle.manifest.name,
        version: bundle.manifest.version,
        slug: slug.trim(),
        path: bundle.manifest.structure[slug.trim()],
        content: md,
      }),
      null,
      2,
    );
    return;
  }
  if (mode === "raw") {
    process.stdout.write(md);
    if (!md.endsWith("\n")) process.stdout.write("\n");
    return;
  }
  const ttyCols =
    typeof process.stdout.columns === "number" && process.stdout.columns > 0 ? process.stdout.columns : 100;
  process.stdout.write(
    await markdownToTerminal(md, config.theme, { contentWidth: Math.max(40, ttyCols - 2) }),
  );
}

export async function cmdReadUrl(
  url: string,
  opts: { json?: boolean; raw?: boolean },
  config: D0Config,
): Promise<void> {
  if (!isUrlLike(url)) {
    console.error(`doc0 read: invalid URL: ${url}`);
    process.exitCode = 1;
    return;
  }
  const mode = resolveReadOutput(config, opts);
  try {
    const page = await readDocUrl(url);
    if (mode === "json") {
      console.log(JSON.stringify(page, null, 2));
      return;
    }
    if (mode === "raw") {
      process.stdout.write(page.markdown);
      if (!page.markdown.endsWith("\n")) process.stdout.write("\n");
      return;
    }
    const ttyCols =
      typeof process.stdout.columns === "number" && process.stdout.columns > 0 ? process.stdout.columns : 100;
    process.stdout.write(
      await markdownToTerminal(page.markdown, config.theme, { contentWidth: Math.max(40, ttyCols - 2) }),
    );
  } catch (e) {
    console.error(`doc0 read: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
