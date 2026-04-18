import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// package.json sits two levels above dist/commands/update.js and src/commands/update.ts.
const pkg = require("../../package.json") as { name: string; version: string };

export type UpdateOpts = {
  check?: boolean;
  json?: boolean;
};

/**
 * Self-update the doc0 CLI from npm.
 *
 * Flow:
 *   1. Fetch `latest` dist-tag from the npm registry.
 *   2. Compare to the currently-installed version baked into package.json.
 *   3. If newer, run `npm install -g doczero@latest` unless `--check` is set.
 *
 * We deliberately shell out to `npm` rather than fetching + extracting ourselves:
 * the user's npm install already knows their prefix, permissions, registry, and
 * auth. Reimplementing all of that would be its own maintenance burden.
 */
export async function cmdUpdate(opts: UpdateOpts = {}): Promise<void> {
  const current = pkg.version;

  let latest: string;
  try {
    latest = await fetchLatestVersion(pkg.name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (opts.json) {
      console.log(JSON.stringify({ current, error: msg }, null, 2));
    } else {
      console.error(`doc0 update: could not reach npm registry — ${msg}`);
    }
    process.exitCode = 1;
    return;
  }

  const cmp = compareSemver(current, latest);
  const needsUpdate = cmp < 0;

  if (opts.json) {
    console.log(JSON.stringify({ current, latest, needsUpdate }, null, 2));
    return;
  }

  console.log(`doc0:    ${current}`);
  console.log(`latest:  ${latest}`);

  if (!needsUpdate) {
    console.log(cmp === 0 ? "\nYou're on the latest version." : "\nYou're ahead of the published release (dev build).");
    return;
  }

  if (opts.check) {
    console.log("\nUpdate available. Run `doc0 update` to install.");
    return;
  }

  console.log(`\nInstalling… (npm install -g ${pkg.name}@latest)`);
  try {
    execSync(`npm install -g ${pkg.name}@latest`, { stdio: "inherit" });
    console.log(`\n✓ doc0 updated ${current} → ${latest}`);
  } catch {
    console.error(
      `\ndoc0 update: install failed. Try running manually:\n  npm install -g ${pkg.name}@latest`,
    );
    process.exitCode = 1;
  }
}

async function fetchLatestVersion(name: string): Promise<string> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`registry returned ${res.status}`);
  const body = (await res.json()) as { version?: unknown };
  if (typeof body.version !== "string" || !body.version.trim()) {
    throw new Error("registry response missing `version`");
  }
  return body.version;
}

/** Minimal semver compare: -1 if a<b, 0 if equal (numeric core), 1 if a>b. Ignores prerelease tags. */
function compareSemver(a: string, b: string): number {
  const pa = a.replace(/[-+].*$/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/[-+].*$/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}
