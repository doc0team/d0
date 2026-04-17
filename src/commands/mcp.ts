import { runMcpServer } from "../mcp/server.js";

export async function cmdMcp(opts: { installedOnly?: boolean } = {}): Promise<void> {
  if (opts.installedOnly) {
    process.env.D0_MCP_INSTALLED_ONLY = "1";
  }
  await runMcpServer();
}
