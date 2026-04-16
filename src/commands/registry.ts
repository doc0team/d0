import type { D0Config } from "../core/config.js";
import { fetchGlobalDocsRegistry, RegistryError } from "../core/registry-client.js";

export async function cmdRegistrySync(config: D0Config): Promise<void> {
  try {
    const result = await fetchGlobalDocsRegistry(config);
    console.log(
      `Synced ${result.entries.length} registry entr${result.entries.length === 1 ? "y" : "ies"} to cache.`,
    );
    if (result.revision) {
      console.log(`Revision: ${result.revision}`);
    }
    console.log(`Fetched at: ${result.fetchedAt}`);
    console.log("Note: sync updates registry metadata cache only; it does not install docs bundles.");
  } catch (e) {
    if (e instanceof RegistryError) {
      console.error(`d0 registry sync: ${e.message}`);
    } else {
      console.error(`d0 registry sync: ${e instanceof Error ? e.message : String(e)}`);
    }
    process.exitCode = 1;
  }
}
