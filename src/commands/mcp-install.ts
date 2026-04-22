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
  /** Write project-local config instead of user-global. Cursor: `./.cursor/mcp.json`; Claude Code: `./.mcp.json`. */
  project?: boolean;
  /** Print merged config without writing. */
  dryRun?: boolean;
  /** Replace an existing `mcpServers.d0` entry without prompting. */
  yes?: boolean;
  /** Print the supported/planned client list and exit. */
  list?: boolean;
};

type McpClientId = "cursor" | "claude-code" | "windsurf" | "antigravity" | "zed" | "opencode";

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
    "Could not find doc0 (or d0) on PATH or dist/index.js. Install globally: npm install -g doczero, or run npm run build from the doc0 repo.",
  );
}

// ─── Shared merge-and-write helper ─────────────────────────────────────────

/**
 * Read an existing JSON config, merge a `mcpServers.d0` entry, back up the
 * previous file, and write the result. Shared across all clients that use
 * the `{ mcpServers: { … } }` format (Cursor, Windsurf, Claude Code).
 */
async function mergeAndWriteMcpConfig(
  clientLabel: string,
  targetPath: string,
  d0Entry: Record<string, unknown>,
  opts: McpInstallOpts,
  restartHint: string,
): Promise<void> {
  let existing: Record<string, unknown> = {};
  if (existsSync(targetPath)) {
    try {
      const raw = await readFile(targetPath, "utf8");
      if (raw.trim()) existing = JSON.parse(raw) as Record<string, unknown>;
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
    console.log(`${clientLabel} MCP config already has matching d0 entry: ${targetPath}`);
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
  console.log(restartHint);
}

// ─── Cursor ────────────────────────────────────────────────────────────────

function cursorMcpJsonPath(opts: McpInstallOpts): string {
  if (opts.project) return path.join(process.cwd(), ".cursor", "mcp.json");
  return path.join(os.homedir(), ".cursor", "mcp.json");
}

async function installCursor(opts: McpInstallOpts, launch: McpLaunchConfig): Promise<void> {
  const d0Entry = { type: "stdio" as const, command: launch.command, args: launch.args };
  await mergeAndWriteMcpConfig(
    "Cursor",
    cursorMcpJsonPath(opts),
    d0Entry,
    opts,
    "Restart Cursor (or reload MCP) so the doc0 server is picked up.",
  );
}

// ─── Windsurf ──────────────────────────────────────────────────────────────

function windsurfMcpJsonPath(): string {
  // ~/.codeium/windsurf/mcp_config.json on all platforms
  return path.join(os.homedir(), ".codeium", "windsurf", "mcp_config.json");
}

async function installWindsurf(opts: McpInstallOpts, launch: McpLaunchConfig): Promise<void> {
  if (opts.project) {
    console.error("doc0 mcp install: --project is not supported for Windsurf (Windsurf uses a single global config).");
    process.exitCode = 1;
    return;
  }
  const d0Entry = { command: launch.command, args: launch.args };
  await mergeAndWriteMcpConfig(
    "Windsurf",
    windsurfMcpJsonPath(),
    d0Entry,
    opts,
    "Press Refresh in the Windsurf MCP panel (or restart Windsurf) so the doc0 server is picked up.",
  );
}

// ─── Claude Code ───────────────────────────────────────────────────────────

function claudeCodeConfigPath(opts: McpInstallOpts): string {
  // --project → .mcp.json in the current directory (team-shareable)
  if (opts.project) return path.join(process.cwd(), ".mcp.json");
  // user scope → ~/.claude.json
  return path.join(os.homedir(), ".claude.json");
}

async function installClaudeCode(opts: McpInstallOpts, launch: McpLaunchConfig): Promise<void> {
  const d0Entry = { type: "stdio" as const, command: launch.command, args: launch.args };
  const targetPath = claudeCodeConfigPath(opts);
  const scope = opts.project ? "project" : "user";
  await mergeAndWriteMcpConfig(
    `Claude Code (${scope})`,
    targetPath,
    d0Entry,
    opts,
    opts.project
      ? "Claude Code will pick up .mcp.json on next session in this directory."
      : "Restart Claude Code so the doc0 server is picked up.",
  );
}

// ─── Antigravity ───────────────────────────────────────────────────────────

function antigravityMcpJsonPath(): string {
  // ~/.gemini/antigravity/mcp_config.json on all platforms
  return path.join(os.homedir(), ".gemini", "antigravity", "mcp_config.json");
}

async function installAntigravity(opts: McpInstallOpts, launch: McpLaunchConfig): Promise<void> {
  if (opts.project) {
    console.error("doc0 mcp install: --project is not supported for Antigravity (Antigravity uses a single global config).");
    process.exitCode = 1;
    return;
  }
  const d0Entry = { command: launch.command, args: launch.args };
  await mergeAndWriteMcpConfig(
    "Antigravity",
    antigravityMcpJsonPath(),
    d0Entry,
    opts,
    "Restart Antigravity (or reload MCP servers) so the doc0 server is picked up.",
  );
}

// ─── Zed ───────────────────────────────────────────────────────────────────

function zedSettingsPath(opts: McpInstallOpts): string {
  if (opts.project) return path.join(process.cwd(), ".zed", "settings.json");
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Zed", "settings.json");
  }
  // macOS + Linux
  return path.join(os.homedir(), ".config", "zed", "settings.json");
}

/**
 * Strip JSONC features (line comments, block comments, trailing commas)
 * so that `JSON.parse` can handle Zed's `settings.json`.
 */
function stripJsonc(text: string): string {
  // Remove block comments
  let s = text.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove line comments (only when // is not inside a string)
  s = s.replace(/^(\s*)(\/\/.*)/gm, "$1");
  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");
  return s;
}

/**
 * Zed uses `context_servers` instead of `mcpServers`, and entries are
 * `{ command, args }` without a `type` field.  We merge into the existing
 * settings.json which contains many unrelated keys.
 */
async function installZed(opts: McpInstallOpts, launch: McpLaunchConfig): Promise<void> {
  const targetPath = zedSettingsPath(opts);
  const d0Entry = { command: launch.command, args: launch.args };

  let existing: Record<string, unknown> = {};
  if (existsSync(targetPath)) {
    try {
      const raw = await readFile(targetPath, "utf8");
      if (raw.trim()) existing = JSON.parse(stripJsonc(raw)) as Record<string, unknown>;
    } catch {
      console.error(`doc0 mcp install: invalid JSON in ${targetPath}`);
      process.exitCode = 1;
      return;
    }
  }

  const contextServers =
    typeof existing.context_servers === "object" && existing.context_servers !== null && !Array.isArray(existing.context_servers)
      ? { ...(existing.context_servers as Record<string, unknown>) }
      : {};

  const prevD0 = contextServers.d0;
  if (prevD0 !== undefined && deepEqual(prevD0, d0Entry)) {
    console.log(`Zed settings already has matching d0 context server: ${targetPath}`);
    console.log(JSON.stringify({ context_servers: { d0: d0Entry } }, null, 2));
    return;
  }

  if (prevD0 !== undefined && !opts.yes) {
    console.error("doc0 mcp install: existing context_servers.d0 differs. Re-run with --yes to replace.");
    console.error("Current:", JSON.stringify(prevD0, null, 2));
    console.error("New:", JSON.stringify(d0Entry, null, 2));
    process.exitCode = 1;
    return;
  }

  contextServers.d0 = d0Entry;
  const next = { ...existing, context_servers: contextServers };

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
  console.log(opts.project
    ? "Zed will pick up .zed/settings.json for this project."
    : "Zed should detect the change automatically, or restart Zed.",
  );
}

// ─── OpenCode ─────────────────────────────────────────────────────────────

function opencodeConfigPath(opts: McpInstallOpts): string {
  // --project → opencode.json in the current directory
  if (opts.project) return path.join(process.cwd(), "opencode.json");
  // user scope → ~/.config/opencode/opencode.json
  return path.join(os.homedir(), ".config", "opencode", "opencode.json");
}

/**
 * OpenCode uses `"mcp"` (not `mcpServers`), entries have
 * `{ type: "local", command: ["cmd", ...args], enabled: true }`.
 */
async function installOpenCode(opts: McpInstallOpts, launch: McpLaunchConfig): Promise<void> {
  const targetPath = opencodeConfigPath(opts);
  const d0Entry = {
    type: "local" as const,
    command: [launch.command, ...launch.args],
    enabled: true,
  };

  let existing: Record<string, unknown> = {};
  if (existsSync(targetPath)) {
    try {
      const raw = await readFile(targetPath, "utf8");
      if (raw.trim()) existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.error(`doc0 mcp install: invalid JSON in ${targetPath}`);
      process.exitCode = 1;
      return;
    }
  }

  const mcp =
    typeof existing.mcp === "object" && existing.mcp !== null && !Array.isArray(existing.mcp)
      ? { ...(existing.mcp as Record<string, unknown>) }
      : {};

  const prevD0 = mcp.d0;
  if (prevD0 !== undefined && deepEqual(prevD0, d0Entry)) {
    console.log(`OpenCode config already has matching d0 entry: ${targetPath}`);
    console.log(JSON.stringify({ mcp: { d0: d0Entry } }, null, 2));
    return;
  }

  if (prevD0 !== undefined && !opts.yes) {
    console.error("doc0 mcp install: existing mcp.d0 differs. Re-run with --yes to replace.");
    console.error("Current:", JSON.stringify(prevD0, null, 2));
    console.error("New:", JSON.stringify(d0Entry, null, 2));
    process.exitCode = 1;
    return;
  }

  mcp.d0 = d0Entry;
  const next = { ...existing, mcp };

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
  console.log(opts.project
    ? "OpenCode will pick up opencode.json in this directory."
    : "Restart OpenCode so the doc0 server is picked up.",
  );
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
    status: "available",
    flag: "claude-code",
    describeTarget: (opts) => claudeCodeConfigPath(opts),
    install: installClaudeCode,
  },
  {
    id: "windsurf",
    label: "Windsurf",
    status: "available",
    flag: "windsurf",
    describeTarget: () => windsurfMcpJsonPath(),
    install: installWindsurf,
  },
  {
    id: "antigravity",
    label: "Antigravity",
    status: "available",
    flag: "antigravity",
    describeTarget: () => antigravityMcpJsonPath(),
    install: installAntigravity,
  },
  {
    id: "zed",
    label: "Zed",
    status: "available",
    flag: "zed",
    describeTarget: (opts) => zedSettingsPath(opts),
    install: installZed,
  },
  {
    id: "opencode",
    label: "OpenCode",
    status: "available",
    flag: "opencode",
    describeTarget: (opts) => opencodeConfigPath(opts),
    install: installOpenCode,
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
