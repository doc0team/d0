import { findInstalledBundle, type InstalledBundleRef } from "../core/storage.js";
import { loadBundle, listSlugs } from "../core/bundle.js";
import type { D0Config } from "../core/config.js";
import { resolveDocsRegistryEntry } from "../core/registry-client.js";
import { deriveBrowseTargets, isUrlLike, type ListDocUrlsOptions } from "../core/web-docs.js";

export type BrowseOpts = { ink?: boolean; external?: boolean };

async function runBrowseInstalledBundle(ref: InstalledBundleRef, config: D0Config): Promise<void> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error("doc0 browse: interactive browse requires a TTY. Use: doc0 <pkg> ls | doc0 <pkg> read <slug>");
    process.exitCode = 1;
    return;
  }
  const bundle = await loadBundle(ref.root);
  const slugs = listSlugs(bundle);
  if (!slugs.length) {
    console.error("doc0 browse: bundle has no pages in structure");
    process.exitCode = 1;
    return;
  }

  const { runBrowseTui } = await import("../tui/app.js");
  await runBrowseTui(bundle, config);
}

/**
 * Interactive TUI: installed bundle by name, or a registry id (URL entry → live docs TUI;
 * bundle entry → same TUI when that bundle is installed).
 */
export async function cmdBrowse(pkg: string, config: D0Config, opts: BrowseOpts = {}): Promise<void> {
  const ref = await findInstalledBundle(pkg);
  if (ref) {
    await runBrowseInstalledBundle(ref, config);
    return;
  }

  const entry = await resolveDocsRegistryEntry(pkg, {});
  if (entry?.sourceType === "url") {
    await cmdBrowseUrl(entry.source, { external: opts.external, ink: opts.ink }, config);
    return;
  }
  if (entry?.sourceType === "bundle") {
    const installed = await findInstalledBundle(entry.source);
    if (installed) {
      await runBrowseInstalledBundle(installed, config);
      return;
    }
    console.error(
      `doc0 browse: registry entry "${pkg}" refers to bundle ${entry.source}, which is not installed. Use: doc0 add --local <path-to-bundle-dir>`,
    );
    process.exitCode = 1;
    return;
  }

  console.error(`doc0 browse: unknown bundle or registry id: ${pkg}`);
  process.exitCode = 1;
}

export async function cmdBrowseUrl(
  url: string,
  opts: { external?: boolean; ink?: boolean },
  config: D0Config,
): Promise<void> {
  if (!isUrlLike(url)) {
    console.error(`doc0 browse: not a valid URL: ${url}`);
    process.exitCode = 1;
    return;
  }
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error("doc0 browse: interactive browse requires a TTY. Use: doc0 ls <url> | doc0 read <url>");
    process.exitCode = 1;
    return;
  }
  const listOpts: ListDocUrlsOptions | undefined = opts.external ? { llmsIncludeExternal: true } : undefined;
  // `doc0 docs.example.com/docs/overview` should open a TUI scoped to the whole `/docs/` tree
  // and land on `/docs/overview`. `deriveBrowseTargets` splits that into discovery base + landing page.
  const { discoveryBase, landingUrl } = deriveBrowseTargets(url);

  const { runUrlBrowseTui } = await import("../tui/url-app.js");
  await runUrlBrowseTui(discoveryBase, config, listOpts, landingUrl ?? undefined);
}

export async function cmdBrowseUrlHome(
  opts: { external?: boolean; ink?: boolean },
  config: D0Config,
): Promise<void> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error("doc0 browse: interactive browse requires a TTY.");
    process.exitCode = 1;
    return;
  }
  const listOpts: ListDocUrlsOptions | undefined = opts.external ? { llmsIncludeExternal: true } : undefined;
  const { runUrlBrowseHomeTui } = await import("../tui/url-app.js");
  await runUrlBrowseHomeTui(config, listOpts);
}
