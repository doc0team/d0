import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

export type McpInstallOpts = {
  /** Optional explicit client id (e.g. "cursor"). When unset, we pick one interactively. */
  client?: McpClientId;
  /** Write `./.cursor/mcp.json` in the current directory instead of `~/.cursor/mcp.json`. */
  project?: boolean;
  /** Print merged config without writing. */
  dryRun?: boolean;
  /** Replace an existing `mcpServers.d0` entry without prompting. */
  yes?: boolean;
  /** Print the supported/planned client list and exit. */
  list?: boolean;
};

type McpClientId = "cursor" | "claude-code" | "windsurf";

type McpClient = {
  id: McpClientId;
  /** Human label used in pickers / status lines. */
  label: string;
  /** Short note appended to the label when we can't install it yet. */
  status: "available" | "planned";
  /** Path to the MCP config file we would write, for status display. `null` while status === "planned". */
  describeTarget?: (opts: McpInstallOpts) => string;
  /** Perform the install. Throws or sets `process.exitCode` on failure. `undefined` while status === "planned". */
  install?: (opts: McpInstallOpts, launch: McpLaunchConfig) => Promise<void>;
  /** CLI flag name *without* the leading `--`. */
  flag: string;
};

type McpLaunchConfig = { command: string; args: string[] };

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
 * How an MCP client should spawn the doc0 stdio server.
 * Prefer global `doc0`, fall back to the legacy `d0` alias, else `node` + this package's `dist/index.js`.
 */
export function resolveMcpLaunchConfig(): McpLaunchConfig {
  if (binOnPath("doc0")) return { command: "doc0", args: ["mcp"] };
  if (binOnPath("d0")) return { command: "d0", args: ["mcp"] };
  const root = findPackageRoot();
  const distIndex = path.join(root, "dist", "index.js");
  if (existsSync(distIndex)) return { command: process.execPath, args: [distIndex, "mcp"] };
  const srcIndex = path.join(root, "src", "index.ts");
  if (existsSync(srcIndex)) return { command: process.execPath, args: [srcIndex, "mcp"] };
  throw new Error(
    "Could not find doc0 (or d0) on PATH or dist/index.js. Install globally: npm install -g doc0, or run npm run build from the doc0 repo.",
  );
}

// ─── Cursor ────────────────────────────────────────────────────────────────

function cursorMcpJsonPath(opts: McpInstallOpts): string {
  if (opts.project) return path.join(process.cwd(), ".cursor", "mcp.json");
  return path.join(os.homedir(), ".cursor", "mcp.json");
}

async function installCursor(opts: McpInstallOpts, launch: McpLaunchConfig): Promise<void> {
  const targetPath = cursorMcpJsonPath(opts);
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

// ─── Client registry ───────────────────────────────────────────────────────

const CLIENTS: McpClient[] = [
  {
    id: "cursor",
    label: "Cursor",
    status: "available",
    flag: "cursor",
    describeTarget: (opts) => cursorMcpJsonPath(opts),
    install: installCursor,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    status: "planned",
    flag: "claude-code",
  },
  {
    id: "windsurf",
    label: "Windsurf",
    status: "planned",
    flag: "windsurf",
  },
];

function getClient(id: McpClientId): McpClient {
  const c = CLIENTS.find((c) => c.id === id);
  if (!c) throw new Error(`unknown MCP client id: ${id}`);
  return c;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ─── Interactive picker ────────────────────────────────────────────────────

function printClientList(): void {
  console.log("Available MCP clients:");
  console.log("");
  for (const c of CLIENTS) {
    const tag = c.status === "available" ? "" : "  (coming soon)";
    console.log(`  --${c.flag.padEnd(14, " ")}  ${c.label}${tag}`);
  }
  console.log("");
  console.log("Example: doc0 mcp install --cursor");
}

async function pickClientInteractively(): Promise<McpClient | null> {
  const stdinIsTty = process.stdin.isTTY === true;
  const stdoutIsTty = process.stdout.isTTY === true;
  if (!stdinIsTty || !stdoutIsTty) {
    console.error("doc0 mcp install: no client specified and stdin/stdout is not a TTY.");
    console.error("Pass a flag explicitly, e.g.:");
    console.error("  doc0 mcp install --cursor");
    console.error("");
    printClientList();
    return null;
  }

  console.log("Pick an MCP client to install doc0 into:");
  console.log("");
  CLIENTS.forEach((c, i) => {
    const idx = `  ${i + 1})`;
    const tag = c.status === "available" ? "" : "  (coming soon)";
    console.log(`${idx} ${c.label}${tag}`);
  });
  console.log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const raw = (await rl.question(`Select 1-${CLIENTS.length} (default: 1): `)).trim();
    const n = raw === "" ? 1 : Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > CLIENTS.length) {
      console.error(`doc0 mcp install: "${raw}" isn't a valid selection.`);
      return null;
    }
    const pick = CLIENTS[n - 1]!;
    if (pick.status !== "available") {
      console.error(`doc0 mcp install: ${pick.label} support is coming — not installable yet.`);
      return null;
    }
    return pick;
  } finally {
    rl.close();
  }
}

// ─── Entry point ───────────────────────────────────────────────────────────

export async function cmdMcpInstall(opts: McpInstallOpts): Promise<void> {
  if (opts.list) {
    printClientList();
    return;
  }

  let client: McpClient | null;
  if (opts.client) {
    client = getClient(opts.client);
    if (client.status !== "available") {
      console.error(`doc0 mcp install: ${client.label} support is coming — not installable yet.`);
      console.error("Available today: doc0 mcp install --cursor");
      process.exitCode = 1;
      return;
    }
  } else {
    client = await pickClientInteractively();
    if (!client) {
      process.exitCode = 1;
      return;
    }
  }

  let launch: McpLaunchConfig;
  try {
    launch = resolveMcpLaunchConfig();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
    return;
  }

  if (!client.install) {
    console.error(`doc0 mcp install: ${client.label} is not installable yet.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Installing doc0 into ${client.label}${client.describeTarget ? ` → ${client.describeTarget(opts)}` : ""}`);
  await client.install(opts, launch);
}
