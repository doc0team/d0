import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerD0Tools } from "./tools.js";

export async function runMcpServer(): Promise<void> {
  const server = new McpServer(
    { name: "d0", version: "0.1.0" },
    {
      instructions:
        "doc0 docs runtime: search/list docs, open a docs source with open_docs, then list_nodes/read_node/search_nodes using doc_id.",
    },
  );
  registerD0Tools(server);
  const transport = new StdioServerTransport();
  // MCP uses stdout for JSON-RPC only; stderr is safe for humans.
  console.error(
    "doc0 mcp: listening on stdio (stdout stays silent by design). Use an MCP host (e.g. Cursor) to spawn this process; it waits for JSON-RPC on stdin.",
  );
  await server.connect(transport);
}
