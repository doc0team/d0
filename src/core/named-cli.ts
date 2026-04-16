import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { D0Manifest } from "./manifest.js";
import { binDir, ensureD0Dirs } from "./storage.js";

function cliEntryPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../index.js");
}

export async function writeNamedShim(manifest: D0Manifest): Promise<void> {
  if (!manifest.bin) return;
  await ensureD0Dirs();
  const bin = manifest.bin.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!bin) return;
  const targetDir = binDir();
  await mkdir(targetDir, { recursive: true });

  const entry = cliEntryPath().replace(/\\/g, "/");
  const pkgJson = JSON.stringify(manifest.name);

  const js = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const entry = ${JSON.stringify(entry)};
const pkg = ${pkgJson};
const r = spawnSync(process.execPath, [entry, pkg, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env },
});
process.exit(r.status ?? 1);
`;

  const shimPath = path.join(targetDir, `${bin}.mjs`);
  await writeFile(shimPath, js, { encoding: "utf8", mode: 0o755 });
  if (process.platform === "win32") {
    const cmd = `@echo off\r\n"${process.execPath.replace(/"/g, '""')}" "${shimPath.replace(/"/g, '""')}" %*\r\n`;
    await writeFile(path.join(targetDir, `${bin}.cmd`), cmd, "utf8");
  }
}

export async function removeNamedShim(binName: string): Promise<void> {
  const bin = binName.replace(/[^a-zA-Z0-9._-]/g, "");
  const mjs = path.join(binDir(), `${bin}.mjs`);
  const cmd = path.join(binDir(), `${bin}.cmd`);
  try {
    if (existsSync(mjs)) await rm(mjs, { force: true });
    if (existsSync(cmd)) await rm(cmd, { force: true });
  } catch {
    /* ignore */
  }
}
