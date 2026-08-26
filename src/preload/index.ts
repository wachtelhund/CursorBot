import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  Bot,
  BotGroup,
  CreateBotInput,
  CreateGroupInput,
  ModelOption,
  SendMessageInput,
  StreamEvent,
  TeamMessage,
  UpdateBotInput,
  UpdateGroupInput,
  UpsertSecretInput,
  UsagePayload,
} from "../shared/types";
import type { UpdateCheckResult } from "../shared/updates";

const api = {
  listBots: (): Promise<Bot[]> => ipcRenderer.invoke("bots:list"),
  listTeam: (): Promise<TeamMessage[]> => ipcRenderer.invoke("team:list"),
  listGroups: (): Promise<BotGroup[]> => ipcRenderer.invoke("groups:list"),
  createBot: (input: CreateBotInput): Promise<Bot> =>
    ipcRenderer.invoke("bots:create", input),
  createGroup: (input: CreateGroupInput): Promise<BotGroup> =>
    ipcRenderer.invoke("groups:create", input),
  deleteBot: (botId: string): Promise<void> =>
    ipcRenderer.invoke("bots:delete", botId),
  pinBot: (botId: string, pinned: boolean): Promise<Bot> =>
    ipcRenderer.invoke("bots:pin", { botId, pinned }),
  renameBot: (botId: string, name: string): Promise<Bot> =>
    ipcRenderer.invoke("bots:rename", { botId, name }),
  updateBot: (botId: string, patch: UpdateBotInput): Promise<Bot> =>
    ipcRenderer.invoke("bots:update", { botId, patch }),
  renameGroup: (groupId: string, name: string): Promise<BotGroup> =>
    ipcRenderer.invoke("groups:rename", { groupId, name }),
  updateGroup: (groupId: string, patch: UpdateGroupInput): Promise<BotGroup> =>
    ipcRenderer.invoke("groups:update", { groupId, ...patch }),
  openAgent: (botId: string): Promise<void> =>
    ipcRenderer.invoke("bots:openAgent", botId),
  deleteGroup: (groupId: string): Promise<void> =>
    ipcRenderer.invoke("groups:delete", groupId),
  sendMessage: (
    input: SendMessageInput | string,
    maybeText?: string,
  ): Promise<{ targetIds: string[] }> => {
    if (typeof input === "string") {
      return ipcRenderer.invoke("bots:send", { text: maybeText ?? "", botId: input });
    }
    return ipcRenderer.invoke("bots:send", input);
  },
  getUsage: (botId: string): Promise<UsagePayload> =>
    ipcRenderer.invoke("bots:usage", botId),
  listModels: (): Promise<ModelOption[]> => ipcRenderer.invoke("models:list"),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  saveApiKey: (apiKey: string): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:saveApiKey", apiKey),
  upsertSecret: (input: UpsertSecretInput): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:upsertSecret", input),
  deleteSecret: (name: string): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:deleteSecret", name),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("shell:open", url),
  checkForUpdates: (): Promise<UpdateCheckResult> =>
    ipcRenderer.invoke("updates:check"),
  onEvent: (handler: (event: StreamEvent) => void): (() => void) => {
    const listener = (_event: unknown, data: StreamEvent) => handler(data);
    ipcRenderer.on("bots:event", listener);
    return () => {
      ipcRenderer.removeListener("bots:event", listener);
    };
  },
};

contextBridge.exposeInMainWorld("cursorBots", api);

export type CursorBotsApi = typeof api;
