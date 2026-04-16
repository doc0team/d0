import path from "node:path";
import { mkdir } from "node:fs/promises";
import * as tar from "tar";
import { loadBundle } from "../core/bundle.js";
import { ManifestError } from "../core/manifest.js";

export async function cmdBuild(dirArg: string | undefined): Promise<void> {
  const dir = path.resolve(dirArg ?? ".");
  let bundle;
  try {
    bundle = await loadBundle(dir);
  } catch (e) {
    if (e instanceof ManifestError) console.error(`d0 build: ${e.message}`);
    else console.error(`d0 build: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
    return;
  }
  const safeName = bundle.manifest.name.replace(/^@/, "").replace(/\//g, "__");
  const outName = `${safeName}-${bundle.manifest.version}.d0.tgz`;
  const outDir = path.join(dir, "dist");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, outName);
  const files = ["d0.json", ...Object.values(bundle.manifest.structure)];
  try {
    await tar.c({ gzip: true, file: outPath, cwd: dir }, files);
  } catch (e) {
    console.error(`d0 build: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Built ${outPath}`);
}
