import type { Bot, ChatMessage } from "./types";

export const CURSOR_API = "https://api.cursor.com";

export type CloudAgent = {
  id: string;
  name: string;
  status?: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  latestRunId?: string;
  repos?: { url?: string; startingRef?: string }[];
};

export type CloudRun = {
  id: string;
  agentId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  result?: string;
};

export function cloudHeaders(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...extra,
  };
}

export function parseAgentList(payload: unknown): CloudAgent[] {
  if (!payload || typeof payload !== "object") return [];
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const agents: CloudAgent[] = [];
  for (const item of items) {
    const agent = parseAgent(item);
    if (agent) agents.push(agent);
  }
  return agents;
}

export function parseAgent(payload: unknown): CloudAgent | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const data = payload as { id?: unknown; name?: unknown };
  if (typeof data.id !== "string" || !data.id.startsWith("bc-")) return undefined;
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : data.id;
  const rest = payload as CloudAgent;
  return { ...rest, id: data.id, name };
}

export function parseRunList(payload: unknown): CloudRun[] {
  if (!payload || typeof payload !== "object") return [];
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is CloudRun => {
    return Boolean(item && typeof item === "object" && typeof (item as CloudRun).id === "string");
  });
}

export function parseRun(payload: unknown): CloudRun | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const id = (payload as { id?: unknown }).id;
  if (typeof id !== "string" || !id) return undefined;
  return payload as CloudRun;
}

export function nextCursor(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const cursor = (payload as { nextCursor?: unknown }).nextCursor;
  return typeof cursor === "string" && cursor ? cursor : undefined;
}

export function bootstrapPrompt(name: string, role: string): string {
  const who = name.trim() || "teammate";
  const job = role.trim();
  return job
    ? `You are ${who}, a Cursor Bots teammate. Role: ${job}. Wait for the next user message. Do not invent teammates who are not in the roster you are given.`
    : `You are ${who}, a Cursor Bots teammate. Wait for the next user message. Do not invent teammates who are not in the roster you are given.`;
}

export function agentToBot(agent: CloudAgent, messages: ChatMessage[] = []): Bot {
  const updatedAt = agent.updatedAt || agent.createdAt || new Date().toISOString();
  return {
    id: agent.id,
    name: agent.name,
    role: "",
    model: "composer-2.5",
    repoUrl: agent.repos?.[0]?.url,
    startingRef: agent.repos?.[0]?.startingRef,
    agentId: agent.id,
    messages,
    createdAt: agent.createdAt || updatedAt,
    updatedAt,
  };
}

/** List runs are newest first. Oldest run becomes the first chat row. */
export function runsToMessages(runs: CloudRun[]): ChatMessage[] {
  return [...runs].reverse().flatMap((run) => {
    const createdAt = run.updatedAt || run.createdAt || new Date().toISOString();
    if (!run.result && run.status !== "FINISHED") {
      return [
        {
          id: run.id,
          role: "assistant" as const,
          content: run.status === "ERROR" ? "Run failed" : "",
          runId: run.id,
          createdAt,
        },
      ];
    }
    if (!run.result) return [];
    return [
      {
        id: run.id,
        role: "assistant" as const,
        content: run.result,
        runId: run.id,
        createdAt,
      },
    ];
  });
}
