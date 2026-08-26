import type { CursorBotsApi } from "@shared/api";
import {
  agentToBot,
  bootstrapPrompt,
  cloudHeaders,
  nextCursor,
  parseAgent,
  parseAgentList,
  parseRun,
  parseRunList,
  runsToMessages,
  type CloudAgent,
  type CloudRun,
} from "@shared/cursor-cloud";
import { parseHandoffs } from "@shared/mentions";
import type { CreateBotInput, SendMessageInput, UsagePayload } from "@shared/types";

const KEY = "cursor-bots.api-key";

export function readCloudKey(): string {
  return localStorage.getItem(KEY)?.trim() ?? "";
}

export function writeCloudKey(apiKey: string): void {
  const value = apiKey.trim();
  if (value) localStorage.setItem(KEY, value);
  else localStorage.removeItem(KEY);
}

function apiBase(): string {
  const proxy = import.meta.env.VITE_CURSOR_PROXY;
  if (typeof proxy === "string" && proxy.trim()) return proxy.replace(/\/$/, "");
  return "/cursor-api";
}

async function cursorJson(path: string, init?: RequestInit): Promise<unknown> {
  const apiKey = readCloudKey();
  if (!apiKey) throw new Error("Paste a Cursor API key.");
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: cloudHeaders(apiKey, init?.headers as Record<string, string> | undefined),
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : {};
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : text || `Cursor ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function loadAgent(agent: CloudAgent) {
  const listed = parseRunList(
    await cursorJson(`/v1/agents/${encodeURIComponent(agent.id)}/runs?limit=20`),
  );
  const runs: CloudRun[] = [];
  for (const run of listed.slice(0, 12)) {
    runs.push(
      parseRun(
        await cursorJson(
          `/v1/agents/${encodeURIComponent(agent.id)}/runs/${encodeURIComponent(run.id)}`,
        ),
      ) ?? run,
    );
  }
  return agentToBot(agent, runsToMessages(runs));
}

async function listAgents(): Promise<CloudAgent[]> {
  const agents: CloudAgent[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ limit: "100", includeArchived: "false" });
    if (cursor) query.set("cursor", cursor);
    const payload = await cursorJson(`/v1/agents?${query}`);
    agents.push(...parseAgentList(payload));
    cursor = nextCursor(payload);
    if (!cursor) break;
  }
  return agents;
}

export function createCloudApi(): CursorBotsApi {
  const listeners = new Set<(event: import("@shared/types").StreamEvent) => void>();

  function emit(event: import("@shared/types").StreamEvent) {
    for (const listener of listeners) listener(event);
  }

  return {
    listBots: async () => {
      const agents = await listAgents();
      return Promise.all(agents.map((agent) => loadAgent(agent)));
    },
    listTeam: async () => [],
    listGroups: async () => [],
    createBot: async (input: CreateBotInput) => {
      const payload = await cursorJson("/v1/agents", {
        method: "POST",
        body: JSON.stringify({
          name: input.name.trim(),
          prompt: { text: bootstrapPrompt(input.name, input.role ?? "") },
          model: { id: input.model?.trim() || "composer-2.5" },
          ...(input.repoUrl?.trim()
            ? { repos: [{ url: input.repoUrl.trim(), startingRef: input.startingRef }] }
            : {}),
        }),
      });
      const agent = parseAgent(
        payload && typeof payload === "object" && "agent" in payload
          ? (payload as { agent: unknown }).agent
          : payload,
      );
      if (!agent) throw new Error("Cursor did not return an agent");
      const bot = agentToBot(agent);
      emit({ type: "bot", bot });
      return bot;
    },
    createGroup: async () => {
      throw new Error("Groups are not stored on this device. Use @mentions on Team.");
    },
    deleteBot: async (botId) => {
      await cursorJson(`/v1/agents/${encodeURIComponent(botId)}/archive`, { method: "POST" });
    },
    deleteGroup: async () => {
      throw new Error("Groups are not stored on this device.");
    },
    sendMessage: async (input: SendMessageInput) => {
      const text = input.text.trim();
      if (!text) throw new Error("Message is required");
      const agents = await listAgents();
      const mentioned = parseHandoffs(
        text,
        agents.map((agent) => ({ id: agent.id, name: agent.name })),
      ).map((item) => item.botId);
      const targetIds = input.botId ? [input.botId] : mentioned;
      if (targetIds.length === 0) throw new Error("Type @Name to pick a teammate.");
      for (const botId of targetIds) {
        emit({ type: "thinking", botId, thinking: true });
        const payload = await cursorJson(`/v1/agents/${encodeURIComponent(botId)}/runs`, {
          method: "POST",
          body: JSON.stringify({ prompt: { text } }),
        });
        const run = parseRun(
          payload && typeof payload === "object" && "run" in payload
            ? (payload as { run: unknown }).run
            : payload,
        );
        if (!run) continue;
        const finished = await waitForRun(botId, run.id, (delta) => {
          emit({ type: "text", botId, text: delta });
        });
        emit({
          type: "done",
          botId,
          result: finished.result ?? "",
          runId: finished.id,
          status: finished.status ?? "FINISHED",
        });
        emit({ type: "thinking", botId, thinking: false });
      }
      return { targetIds };
    },
    getUsage: async (botId) => {
      try {
        return (await cursorJson(`/v1/agents/${encodeURIComponent(botId)}/usage`)) as UsagePayload;
      } catch {
        return null;
      }
    },
    listModels: async () => {
      const payload = await cursorJson("/v1/models");
      const items =
        payload && typeof payload === "object" && "items" in payload
          ? (payload as { items: { id?: string; displayName?: string }[] }).items
          : [];
      return (items ?? [])
        .filter((model) => typeof model.id === "string")
        .map((model) => ({ id: model.id as string, displayName: model.displayName || model.id || "" }));
    },
    getSettings: async () => ({
      hasApiKey: Boolean(readCloudKey()),
      secrets: [],
    }),
    saveApiKey: async (apiKey) => {
      writeCloudKey(apiKey);
      return { hasApiKey: Boolean(readCloudKey()), secrets: [] };
    },
    upsertSecret: async () => {
      throw new Error("Shared secrets stay in Cursor, not on this phone.");
    },
    deleteSecret: async () => {
      throw new Error("Shared secrets stay in Cursor, not on this phone.");
    },
    openExternal: async (url) => {
      window.open(url, "_blank", "noopener");
    },
    onEvent: (handler) => {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
  };
}

async function waitForRun(
  agentId: string,
  runId: string,
  onText: (delta: string) => void,
): Promise<CloudRun> {
  let last = "";
  for (let i = 0; i < 180; i++) {
    const run =
      parseRun(
        await cursorJson(
          `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
        ),
      ) ?? { id: runId };
    const text = run.result ?? "";
    if (text.length > last.length) {
      onText(text.slice(last.length));
      last = text;
    }
    if (run.status && !["CREATING", "RUNNING"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Run timed out");
}

export function installCloudApi(): boolean {
  if (typeof window.cursorBots?.listBots === "function" && !window.cursorBotsIsRemote) {
    return false;
  }
  window.cursorBots = createCloudApi();
  window.cursorBotsIsRemote = true;
  return true;
}
