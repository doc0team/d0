import path from "node:path";
import { publishBundle } from "../core/registry-client.js";

export async function cmdPublish(dirArg: string | undefined): Promise<void> {
  const dir = path.resolve(dirArg ?? ".");
  const tarball = path.join(dir, "dist");
  try {
    await publishBundle(tarball);
  } catch (e) {
    console.error(`d0 publish: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
