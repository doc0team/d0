import { runMcpServer } from "../mcp/server.js";

export async function cmdMcp(): Promise<void> {
  await runMcpServer();
}
