import path from "node:path";
import { loadConfig } from "../core/config.js";
import { publishBundle } from "../core/registry-client.js";

export async function cmdPublish(dirArg: string | undefined): Promise<void> {
  const dir = path.resolve(dirArg ?? ".");
  const config = await loadConfig();
  const tarball = path.join(dir, "dist"); // placeholder — real impl would pick latest .d0.tgz
  try {
    await publishBundle(config, tarball);
  } catch (e) {
    console.error(`d0 publish: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
