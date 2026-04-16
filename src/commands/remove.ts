import { findInstalledBundle, removeBundle } from "../core/storage.js";
import { removeNamedShim } from "../core/named-cli.js";

export async function cmdRemove(name: string | undefined): Promise<void> {
  if (!name?.trim()) {
    console.error("Usage: d0 remove <@scope/name-or-bin>");
    process.exitCode = 1;
    return;
  }
  const ref = await findInstalledBundle(name.trim());
  if (!ref) {
    console.error(`d0 remove: bundle not found: ${name}`);
    process.exitCode = 1;
    return;
  }
  if (ref.manifest.bin) await removeNamedShim(ref.manifest.bin);
  await removeBundle(ref.manifest.name);
  console.log(`Removed ${ref.manifest.name}`);
}
