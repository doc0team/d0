import path from "node:path";
import os from "node:os";
import { stat } from "node:fs/promises";
import { loadBundle, BundleError } from "../core/bundle.js";
import { ManifestError } from "../core/manifest.js";
import { writeNamedShim } from "../core/named-cli.js";
import { fetchBundleMeta, RegistryError } from "../core/registry-client.js";
import { installBundleFromPath, ensureD0Dirs } from "../core/storage.js";
import type { D0Config } from "../core/config.js";

export async function cmdAdd(
  bundleArg: string | undefined,
  opts: { local?: string },
  config: D0Config,
): Promise<void> {
  await ensureD0Dirs();
  if (opts.local) {
    const abs = path.resolve(opts.local);
    const st = await stat(abs);
    if (!st.isDirectory()) {
      console.error(`d0 add: not a directory: ${abs}`);
      process.exitCode = 1;
      return;
    }
    let loaded;
    try {
      loaded = await loadBundle(abs);
    } catch (e) {
      if (e instanceof ManifestError || e instanceof BundleError) {
        console.error(`d0 add: ${e.message}`);
      } else {
        console.error(`d0 add: ${e instanceof Error ? e.message : String(e)}`);
      }
      process.exitCode = 1;
      return;
    }
    await installBundleFromPath(abs, loaded.manifest);
    if (loaded.manifest.bin) await writeNamedShim(loaded.manifest);
    console.log(`Installed ${loaded.manifest.name}@${loaded.manifest.version}`);
    if (loaded.manifest.bin) {
      const binPath = path.join(os.homedir(), ".d0", "bin");
      console.log(`Named CLI shim: ${path.join(binPath, loaded.manifest.bin + (process.platform === "win32" ? ".cmd" : ".mjs"))}`);
      console.log(`Add to PATH: ${binPath}`);
    }
    return;
  }

  if (!bundleArg?.trim()) {
    console.error("Usage: d0 add --local <path>   or   d0 add <@scope/name> (registry not live yet)");
    process.exitCode = 1;
    return;
  }

  try {
    const meta = await fetchBundleMeta(config, bundleArg);
    console.error(`Would install ${meta.name}@${meta.version} from ${meta.tarballUrl}`);
  } catch (e) {
    if (e instanceof RegistryError) {
      console.error(`d0 add: ${e.message}`);
    } else {
      console.error(`d0 add: ${e instanceof Error ? e.message : String(e)}`);
    }
    process.exitCode = 1;
  }
}
