import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

export type McpInstallOpts = {
  project?: boolean;
  dryRun?: boolean;
  yes?: boolean;
};

function findPackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

function binOnPath(bin: string): boolean {
  try {
    if (process.platform === "win32") {
      execSync(`where ${bin}`, { stdio: "ignore", windowsHide: true });
    } else {
      execSync(`which ${bin}`, { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * How Cursor should spawn the doc0 MCP server (stdio).
 * Prefer global `doc0`, fall back to the legacy `d0` alias, else `node` + this package's `dist/index.js`.
 */
export function resolveMcpLaunchConfig(): { command: string; args: string[] } {
  if (binOnPath("doc0")) {
    return { command: "doc0", args: ["mcp"] };
  }
  if (binOnPath("d0")) {
    return { command: "d0", args: ["mcp"] };
  }
  const root = findPackageRoot();
  const distIndex = path.join(root, "dist", "index.js");
  if (existsSync(distIndex)) {
    return { command: process.execPath, args: [distIndex, "mcp"] };
  }
  const srcIndex = path.join(root, "src", "index.ts");
  if (existsSync(srcIndex)) {
    return { command: process.execPath, args: [srcIndex, "mcp"] };
  }
  throw new Error(
    "Could not find doc0 (or d0) on PATH or dist/index.js. Install globally: npm install -g doc0, or run npm run build from the doc0 repo.",
  );
}

function targetMcpJsonPath(opts: McpInstallOpts): string {
  if (opts.project) {
    return path.join(process.cwd(), ".cursor", "mcp.json");
  }
  return path.join(os.homedir(), ".cursor", "mcp.json");
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function cmdMcpInstall(opts: McpInstallOpts): Promise<void> {
  let launch: { command: string; args: string[] };
  try {
    launch = resolveMcpLaunchConfig();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
    return;
  }

  const targetPath = targetMcpJsonPath(opts);
  const d0Entry = {
    type: "stdio" as const,
    command: launch.command,
    args: launch.args,
  };

  let existing: Record<string, unknown> = {};
  if (existsSync(targetPath)) {
    try {
      const raw = await readFile(targetPath, "utf8");
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.error(`doc0 mcp install: invalid JSON in ${targetPath}`);
      process.exitCode = 1;
      return;
    }
  }

  const mcpServers =
    typeof existing.mcpServers === "object" && existing.mcpServers !== null && !Array.isArray(existing.mcpServers)
      ? { ...(existing.mcpServers as Record<string, unknown>) }
      : {};

  const prevD0 = mcpServers.d0;
  if (prevD0 !== undefined && deepEqual(prevD0, d0Entry)) {
    console.log(`Cursor MCP config already has matching d0 entry: ${targetPath}`);
    console.log(JSON.stringify({ mcpServers: { d0: d0Entry } }, null, 2));
    return;
  }

  if (prevD0 !== undefined && !opts.yes) {
    console.error("doc0 mcp install: existing mcpServers.d0 differs. Re-run with --yes to replace.");
    console.error("Current:", JSON.stringify(prevD0, null, 2));
    console.error("New:", JSON.stringify(d0Entry, null, 2));
    process.exitCode = 1;
    return;
  }

  mcpServers.d0 = d0Entry;
  const next = { ...existing, mcpServers };

  if (opts.dryRun) {
    console.log(JSON.stringify(next, null, 2));
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  if (existsSync(targetPath)) {
    const bak = `${targetPath}.bak.${Date.now()}`;
    await copyFile(targetPath, bak);
    console.error(`Backup: ${bak}`);
  }
  await writeFile(targetPath, JSON.stringify(next, null, 2), "utf8");
  console.log(`Wrote ${targetPath}`);
  console.log("Restart Cursor (or reload MCP) so the doc0 server is picked up.");
}
