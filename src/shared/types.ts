export const TEAM_SCOPE = "team";

export const BUDDY_KINDS = [
  "mound",
  "drop",
  "pebble",
  "puff",
  "wedge",
  "bean",
  "loaf",
  "pip",
] as const;

export type BuddyKind = (typeof BUDDY_KINDS)[number];

export type MessageSource = "user" | "bot" | "system" | "handoff";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  runId?: string;
  createdAt: string;
  source?: MessageSource;
  fromBotId?: string;
  fromName?: string;
  toBotIds?: string[];
};

export type TeamMessage = {
  id: string;
  from: "user" | "bot";
  botId?: string;
  name: string;
  content: string;
  toBotIds?: string[];
  source?: "handoff" | "system";
  fromBotId?: string;
  createdAt: string;
};

export type Bot = {
  id: string;
  name: string;
  role: string;
  model: string;
  repoUrl?: string;
  startingRef?: string;
  agentId?: string;
  character?: BuddyKind;
  avatar?: string;
  pinned?: boolean;
  pinnedAt?: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type UpdateBotInput = {
  name?: string;
  role?: string;
  model?: string;
  repoUrl?: string;
  startingRef?: string;
  character?: BuddyKind;
  avatar?: string;
};

export type CreateBotInput = {
  name: string;
  role?: string;
  model?: string;
  repoUrl?: string;
  startingRef?: string;
  character?: BuddyKind;
  agentId?: string;
};

export type BotGroup = {
  id: string;
  name: string;
  botIds: string[];
  messages: TeamMessage[];
  createdAt: string;
  updatedAt: string;
};

export type CreateGroupInput = {
  name: string;
  botIds: string[];
};

export type UpdateGroupInput = {
  name?: string;
  botIds?: string[];
};

export type SendMessageInput = {
  text: string;
  botId?: string;
  groupId?: string;
};

export type ModelOption = {
  id: string;
  displayName: string;
};

export type UsagePayload = {
  usage?: {
    totalTokens?: number;
  };
  cost?: {
    chargedCents: number;
  };
} | null;

export type StreamEvent =
  | { type: "agent"; botId: string; agentId: string }
  | { type: "text"; botId: string; text: string }
  | { type: "tool"; botId: string; name: string; status: string }
  | { type: "status"; botId: string; status: string; message?: string }
  | { type: "thinking"; botId: string; thinking: boolean }
  | { type: "relay"; fromName?: string; toBotId: string; toName: string }
  | { type: "team"; message: TeamMessage }
  | { type: "group"; group: BotGroup }
  | { type: "group-message"; groupId: string; message: TeamMessage }
  | { type: "group-deleted"; groupId: string }
  | { type: "append"; botId: string; message: ChatMessage }
  | { type: "bot"; bot: Bot }
  | { type: "done"; botId: string; result: string; runId: string; status: string }
  | { type: "error"; botId: string; message: string };

export type SecretName = {
  name: string;
};

export type AppSettings = {
  hasApiKey: boolean;
  secrets: SecretName[];
  appVersion?: string;
};

export type UpsertSecretInput = {
  name: string;
  value: string;
};
