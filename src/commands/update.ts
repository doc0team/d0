import { findInstalledBundle } from "../core/storage.js";
import { RegistryError } from "../core/registry-client.js";
import type { D0Config } from "../core/config.js";

export async function cmdUpdate(name: string | undefined, _config: D0Config): Promise<void> {
  if (name?.trim()) {
    const ref = await findInstalledBundle(name.trim());
    if (!ref) {
      console.error(`d0 update: bundle not found: ${name}`);
      process.exitCode = 1;
      return;
    }
  }
  console.error(
    new RegistryError(
      "d0 update requires the registry. For local bundles, run: d0 remove <name> && d0 add --local <path>",
    ).message,
  );
  process.exitCode = 1;
}
