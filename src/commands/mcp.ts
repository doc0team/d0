import { createRequire } from "node:module";
import { runMcpServer } from "../mcp/server.js";
import { renderMcpStatusTui } from "../tui/mcp-status.js";
import { resolveMcpLaunchConfig } from "./mcp-install.js";

const require = createRequire(import.meta.url);
// package.json sits two levels above dist/commands/mcp.js and src/commands/mcp.ts.
const pkg = require("../../package.json") as { version: string };

/**
 * `doc0 mcp` has two modes:
 *
 *  - **Piped stdio (real MCP session):** when an MCP host like Cursor spawns
 *    this process, stdin/stdout are pipes. We hand both to the MCP SDK's
 *    `StdioServerTransport` and stay silent on stdout (JSON-RPC only).
 *
 *  - **Interactive (a human ran `doc0 mcp` in their terminal):** stdin is a
 *    TTY, which means no MCP host is on the other end. Starting the server
 *    would just hang waiting for bytes that will never come; worse, any
 *    keystroke the user typed would be interpreted as malformed JSON-RPC.
 *    So instead we render a status TUI that explains what this command is
 *    for, shows the launch config a host would use, and exits on `q` / Ctrl-C.
 */
export async function cmdMcp(opts: { installedOnly?: boolean } = {}): Promise<void> {
  if (opts.installedOnly) {
    process.env.D0_MCP_INSTALLED_ONLY = "1";
  }

  const isInteractive = process.stdin.isTTY === true && process.stdout.isTTY === true;
  if (isInteractive) {
    let launch: { command: string; args: string[] };
    try {
      launch = resolveMcpLaunchConfig();
    } catch {
      // If we can't resolve a launcher (dev tree edge cases), fall back to the
      // canonical install-target form — it's still the right thing to show.
      launch = { command: "doc0", args: ["mcp"] };
    }
    await renderMcpStatusTui({
      launch,
      installedOnly: !!opts.installedOnly,
      version: pkg.version,
    });
    return;
  }

  await runMcpServer();
}
