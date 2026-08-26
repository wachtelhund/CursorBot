import type { CursorBotsApi } from "@shared/api";
import { TOKEN_QUERY } from "@shared/remote";
import type {
  CreateBotInput,
  CreateGroupInput,
  SendMessageInput,
  StreamEvent,
  UpdateBotInput,
  UpdateGroupInput,
} from "@shared/types";

const TOKEN_KEY = "cursor-bots.remote-token";

export function isElectronBridge(): boolean {
  return typeof window.cursorBots?.listBots === "function" && !window.cursorBotsIsRemote;
}

export function readRemoteToken(): string {
  const hash = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : location.hash);
  const fromHash = hash.get(TOKEN_QUERY);
  if (fromHash) {
    localStorage.setItem(TOKEN_KEY, fromHash);
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    return fromHash;
  }
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readRemoteToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body as T;
}

export function createRemoteApi(): CursorBotsApi {
  return {
    listBots: () => call("/api/bots"),
    listTeam: () => call("/api/team"),
    listGroups: () => call("/api/groups"),
    createBot: (input: CreateBotInput) =>
      call("/api/bots", { method: "POST", body: JSON.stringify(input) }),
    createGroup: (input: CreateGroupInput) =>
      call("/api/groups", { method: "POST", body: JSON.stringify(input) }),
    deleteBot: (botId: string) =>
      call(`/api/bots/${encodeURIComponent(botId)}`, { method: "DELETE" }),
    pinBot: (botId, pinned) =>
      call(`/api/bots/${encodeURIComponent(botId)}/pin`, {
        method: "POST",
        body: JSON.stringify({ pinned }),
      }),
    renameBot: (botId, name) =>
      call(`/api/bots/${encodeURIComponent(botId)}/rename`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    updateBot: (botId, patch: UpdateBotInput) =>
      call(`/api/bots/${encodeURIComponent(botId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    renameGroup: (groupId, name) =>
      call(`/api/groups/${encodeURIComponent(groupId)}/rename`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    updateGroup: (groupId, patch: UpdateGroupInput) =>
      call(`/api/groups/${encodeURIComponent(groupId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    deleteGroup: (groupId) =>
      call(`/api/groups/${encodeURIComponent(groupId)}`, { method: "DELETE" }),
    sendMessage: (input: SendMessageInput) =>
      call("/api/send", { method: "POST", body: JSON.stringify(input) }),
    getUsage: (botId) => call(`/api/bots/${encodeURIComponent(botId)}/usage`),
    listModels: () => call("/api/models"),
    getSettings: () => call("/api/settings"),
    saveApiKey: (apiKey) =>
      call("/api/settings/api-key", { method: "POST", body: JSON.stringify({ apiKey }) }),
    upsertSecret: async () => {
      throw new Error("Add shared secrets in the desktop app.");
    },
    deleteSecret: async () => {
      throw new Error("Remove shared secrets in the desktop app.");
    },
    openExternal: async (url) => {
      window.open(url, "_blank", "noopener");
    },
    openAgent: async () => {
      throw new Error("Open the Cloud Agent from the desktop app.");
    },
    onEvent: (handler: (event: StreamEvent) => void) => {
      const token = readRemoteToken();
      const source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
      source.onmessage = (message) => {
        try {
          handler(JSON.parse(message.data) as StreamEvent);
        } catch {
          // Ignore keepalives / bad frames.
        }
      };
      return () => source.close();
    },
  };
}

export function installRemoteApi(): void {
  if (isElectronBridge()) return;
  const api = createRemoteApi();
  window.cursorBots = api;
  window.cursorBotsIsRemote = true;
}

declare global {
  interface Window {
    cursorBotsIsRemote?: boolean;
  }
}
