import { findInstalledBundle } from "../core/storage.js";
import { loadBundle, listSlugs } from "../core/bundle.js";
import type { D0Config } from "../core/config.js";
import { deriveBrowseTargets, isUrlLike, type ListDocUrlsOptions } from "../core/web-docs.js";

export async function cmdBrowse(pkg: string, _config: D0Config, _opts: { ink?: boolean } = {}): Promise<void> {
  const ref = await findInstalledBundle(pkg);
  if (!ref) {
    console.error(`doc0: bundle not installed: ${pkg}`);
    process.exitCode = 1;
    return;
  }
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error("doc0: interactive browse requires a TTY. Use: doc0 <pkg> ls | doc0 <pkg> read <slug>");
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
  await runBrowseTui(bundle, _config);
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
