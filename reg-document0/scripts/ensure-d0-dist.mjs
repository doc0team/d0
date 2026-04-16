/**
 * After `npm ci`, `d0` from `file:..` is packed from git — `dist/` is not committed, so the
 * install is missing compiled JS. Vercel/build must run `cd .. && npm run build` first; then
 * this script copies `../dist` into `node_modules/d0/dist` so `import "d0/build-remote-index"` works.
 */
import { cpSync, existsSync, lstatSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const regRoot = join(scriptDir, "..");
const parentDist = join(regRoot, "..", "dist");
const d0Pkg = join(regRoot, "node_modules", "d0");
const marker = join(d0Pkg, "dist", "commands", "index-remote.js");

if (!existsSync(d0Pkg)) {
  process.exit(0);
}

try {
  if (lstatSync(d0Pkg).isSymbolicLink()) {
    if (existsSync(marker)) {
      console.log("reg-document0: d0 is symlinked with dist present; skip dist sync.");
    } else {
      console.warn(
        "reg-document0: d0 is symlinked but dist/commands/index-remote.js missing — run `npm run build` in repo root.",
      );
    }
    process.exit(0);
  }
} catch {
  /* continue */
}

if (!existsSync(parentDist)) {
  console.warn(
    "reg-document0: ../dist not found — skipping d0 dist sync. For Vercel use Install Command: cd .. && npm ci && npm run build && cd reg-document0 && npm ci",
  );
  process.exit(0);
}

cpSync(parentDist, join(d0Pkg, "dist"), { recursive: true, force: true });
console.log("reg-document0: synced ../dist -> node_modules/d0/dist/");
