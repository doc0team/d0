import { listInstalled, findInstalledBundle } from "../core/storage.js";
import { loadBundle, listSlugs } from "../core/bundle.js";
import type { D0Config } from "../core/config.js";
import { resolveOutputMode } from "../utils/output.js";
import { isUrlLike, listDocUrls, type ListDocUrlsOptions } from "../core/web-docs.js";

export async function cmdLsGlobal(opts: { json?: boolean; raw?: boolean }, config: D0Config): Promise<void> {
  const mode = resolveOutputMode(config, opts);
  const installed = await listInstalled();
  if (mode === "json") {
    console.log(
      JSON.stringify(
        installed.map((b) => ({
          name: b.manifest.name,
          version: b.manifest.version,
          bin: b.manifest.bin,
          root: b.root,
        })),
        null,
        2,
      ),
    );
    return;
  }
  if (!installed.length) {
    console.log("No bundles installed. Try: d0 add --local ./examples/example-lib");
    return;
  }
  for (const b of installed) {
    const bin = b.manifest.bin ? ` (bin: ${b.manifest.bin})` : "";
    console.log(`${b.manifest.name}@${b.manifest.version}${bin}`);
  }
}

export async function cmdLsUrl(
  target: string,
  opts: { json?: boolean; raw?: boolean; external?: boolean },
  config: D0Config,
): Promise<void> {
  if (!isUrlLike(target)) {
    console.error(`d0 ls: invalid URL target: ${target}`);
    process.exitCode = 1;
    return;
  }
  const mode = resolveOutputMode(config, opts);
  const listOpts: ListDocUrlsOptions | undefined = opts.external ? { llmsIncludeExternal: true } : undefined;
  try {
    const pages = await listDocUrls(target, listOpts);
    if (mode === "json") {
      console.log(JSON.stringify(pages.map((url) => ({ url })), null, 2));
      return;
    }
    if (!pages.length) {
      console.log("No doc pages discovered.");
      return;
    }
    console.log(`Discovered ${pages.length} page(s):\n`);
    for (const p of pages) console.log(`  ${p}`);
  } catch (e) {
    console.error(`d0 ls: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

export async function cmdLsBundle(
  pkg: string,
  opts: { json?: boolean; raw?: boolean },
  config: D0Config,
): Promise<void> {
  const mode = resolveOutputMode(config, opts);
  const ref = await findInstalledBundle(pkg);
  if (!ref) {
    console.error(`d0: bundle not installed: ${pkg}`);
    process.exitCode = 1;
    return;
  }
  const bundle = await loadBundle(ref.root);
  const slugs = listSlugs(bundle);
  if (mode === "json") {
    console.log(
      JSON.stringify(
        slugs.map((slug) => ({
          slug,
          path: bundle.manifest.structure[slug],
        })),
        null,
        2,
      ),
    );
    return;
  }
  console.log(`${bundle.manifest.name} — pages:\n`);
  for (const s of slugs) {
    console.log(`  ${s}`);
  }
}
