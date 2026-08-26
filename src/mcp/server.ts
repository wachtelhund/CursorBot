import {
  getThreadView,
  listBotsView,
  listGroupsView,
  listThreadsView,
  loadAppStore,
  storeSummaryView,
} from "./app-store.ts";

const PROTOCOL = "2025-03-26";

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type ToolArgs = Record<string, unknown>;

const TOOLS = [
  {
    name: "list_bots",
    description:
      "List Cursor Bots teammates from the local store.json: id, name, role, last preview, last activity.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_groups",
    description: "List named groups (subset threads) with members, last preview, and last activity.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_threads",
    description:
      "List Team, group, and DM threads with last preview and last activity time.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_thread",
    description:
      "Full stored messages for a thread, including source/handoff plus derived inspect and klartext. Use team, a group id/name, or a bot id/name.",
    inputSchema: {
      type: "object",
      properties: {
        thread: {
          type: "string",
          description: "team | group id or name | bot id or name",
        },
        limit: {
          type: "number",
          description: "Optional max messages from the end of the thread",
        },
      },
      required: ["thread"],
      additionalProperties: false,
    },
  },
  {
    name: "get_messages",
    description: "Alias of get_thread. Full stored messages for Team, a group, or a DM.",
    inputSchema: {
      type: "object",
      properties: {
        thread: {
          type: "string",
          description: "team | group id or name | bot id or name",
        },
        limit: { type: "number" },
      },
      required: ["thread"],
      additionalProperties: false,
    },
  },
  {
    name: "get_store_summary",
    description:
      "Counts, last activity, and which store.json file was selected. Does not read settings or secrets.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

function asArgs(params: unknown): ToolArgs {
  const row = params && typeof params === "object" ? (params as ToolArgs) : {};
  const inner = row.arguments;
  if (inner && typeof inner === "object") return inner as ToolArgs;
  return row;
}

function textResult(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

async function callTool(name: string, args: ToolArgs) {
  const loaded = await loadAppStore();
  if (name === "list_bots") return textResult(listBotsView(loaded.store));
  if (name === "list_groups") return textResult(listGroupsView(loaded.store));
  if (name === "list_threads") return textResult(listThreadsView(loaded.store));
  if (name === "get_store_summary") return textResult(storeSummaryView(loaded));
  if (name === "get_thread" || name === "get_messages") {
    const thread = typeof args.thread === "string" ? args.thread : "";
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    return textResult(getThreadView(loaded.store, thread, limit));
  }
  return errorResult(`Unknown tool: ${name}`);
}

export async function handleRpc(message: JsonRpc): Promise<Record<string, unknown> | null> {
  if (!message.method) return null;
  if (message.id === undefined) return null;

  const id = message.id;
  try {
    if (message.method === "initialize") {
      const params = asRecord(message.params);
      const requested =
        typeof params?.protocolVersion === "string" ? params.protocolVersion : PROTOCOL;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: requested,
          capabilities: { tools: {} },
          serverInfo: { name: "cursor-bots", version: "0.1.1" },
          instructions:
            "Read-only view of the Cursor Bots Electron store.json (Team, groups, DMs). Never reads settings.json or secrets.",
        },
      };
    }
    if (message.method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }
    if (message.method === "tools/list") {
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    }
    if (message.method === "tools/call") {
      const params = asRecord(message.params);
      const name = typeof params?.name === "string" ? params.name : "";
      const result = await callTool(name, asArgs(message.params));
      return { jsonrpc: "2.0", id, result };
    }
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${message.method}` },
    };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return { jsonrpc: "2.0", id, error: { code: -32000, message: text } };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function writeMessage(message: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function onLine(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  let parsed: JsonRpc;
  try {
    parsed = JSON.parse(trimmed) as JsonRpc;
  } catch {
    process.stderr.write("cursor-bots MCP: ignored invalid JSON line\n");
    return;
  }
  const response = await handleRpc(parsed);
  if (response) writeMessage(response);
}

async function main(): Promise<void> {
  process.stdin.setEncoding("utf8");
  let buffer = "";
  for await (const chunk of process.stdin) {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      await onLine(line);
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer.trim()) await onLine(buffer);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
