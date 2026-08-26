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
  RemoteAccess,
  UpdateGroupInput,
  UpsertSecretInput,
  UsagePayload,
} from "./types";
import type { UpdateCheckResult, UpdateProgress } from "./updates";

export type CursorBotsApi = {
  listBots: () => Promise<Bot[]>;
  listTeam: () => Promise<TeamMessage[]>;
  listGroups: () => Promise<BotGroup[]>;
  createBot: (input: CreateBotInput) => Promise<Bot>;
  createGroup: (input: CreateGroupInput) => Promise<BotGroup>;
  deleteBot: (botId: string) => Promise<void>;
  pinBot?: (botId: string, pinned: boolean) => Promise<Bot | undefined>;
  renameBot?: (botId: string, name: string) => Promise<Bot>;
  updateBot?: (botId: string, patch: UpdateBotInput) => Promise<Bot>;
  renameGroup?: (groupId: string, name: string) => Promise<BotGroup>;
  updateGroup?: (groupId: string, patch: UpdateGroupInput) => Promise<BotGroup>;
  openAgent?: (botId: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  sendMessage: (input: SendMessageInput) => Promise<{ targetIds: string[] }>;
  getUsage: (botId: string) => Promise<UsagePayload>;
  listModels: () => Promise<ModelOption[]>;
  getSettings: () => Promise<AppSettings>;
  saveApiKey: (apiKey: string) => Promise<AppSettings>;
  upsertSecret: (input: UpsertSecretInput) => Promise<AppSettings>;
  deleteSecret: (name: string) => Promise<AppSettings>;
  openExternal: (url: string) => Promise<void>;
  checkForUpdates?: () => Promise<UpdateCheckResult>;
  applyUpdate?: () => Promise<void>;
  onUpdateProgress?: (handler: (progress: UpdateProgress) => void) => () => void;
  setRemoteEnabled?: (enabled: boolean) => Promise<RemoteAccess>;
  rotateRemote?: () => Promise<RemoteAccess>;
  setRemoteTunnel?: (on: boolean) => Promise<RemoteAccess>;
  onRemoteChanged?: (handler: (access: RemoteAccess) => void) => () => void;
  onEvent: (handler: (event: StreamEvent) => void) => () => void;
};
