import { id } from "./ids";
import { sortBots } from "../shared/bots";
import type { CloudAgent } from "../shared/cursor-cloud";
import {
  agentToBot,
  archiveCloudAgent,
  botFromAgent,
  createCloudAgent,
  getCloudAgent,
  listCloudAgents,
} from "./cloud";
import { hasApiKey } from "./settings";
import {
  BUDDY_KINDS,
  type Bot,
  type BotGroup,
  type ChatMessage,
  type CreateBotInput,
  type CreateGroupInput,
  type TeamMessage,
  type UpdateBotInput,
  type UpdateGroupInput,
} from "../shared/types";

type StoreData = {
  bots: Bot[];
  team: TeamMessage[];
  groups: BotGroup[];
  removedNames: string[];
};

const empty: StoreData = { bots: [], team: [], groups: [], removedNames: [] };
const TEAM_CAP = 400;

let ram: StoreData = { ...empty, bots: [], team: [], groups: [], removedNames: [] };
let writeQueue: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readStore(): Promise<StoreData> {
  return ram;
}

async function writeStore(data: StoreData): Promise<void> {
  ram = data;
}

function overlayFromCloud(agent: CloudAgent, cached?: Bot): Bot {
  if (!cached) return agentToBot(agent);
  return {
    ...cached,
    name: agent.name,
    repoUrl: agent.repos?.[0]?.url ?? cached.repoUrl,
    startingRef: agent.repos?.[0]?.startingRef ?? cached.startingRef,
    agentId: agent.id,
    updatedAt: agent.updatedAt || cached.updatedAt,
  };
}

export async function listBots(): Promise<Bot[]> {
  if (!(await hasApiKey())) return [];
  const agents = await listCloudAgents();
  const previous = new Map(ram.bots.map((bot) => [bot.id, bot]));
  const bots: Bot[] = [];
  for (const agent of agents) {
    const cached = previous.get(agent.id);
    bots.push(cached ? overlayFromCloud(agent, cached) : await botFromAgent(agent));
  }
  ram = { ...ram, bots };
  return sortBots(bots);
}

export async function listRemovedNames(): Promise<string[]> {
  return ram.removedNames;
}

export async function backfillMissingBots(): Promise<Bot[]> {
  return [];
}

export async function listTeam(): Promise<TeamMessage[]> {
  return (await readStore()).team;
}

export async function listGroups(): Promise<BotGroup[]> {
  return [...(await readStore()).groups].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

export async function getGroup(groupId: string): Promise<BotGroup | undefined> {
  const store = await readStore();
  return store.groups.find((group) => group.id === groupId);
}

export async function findGroupByName(name: string): Promise<BotGroup | undefined> {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return (await readStore()).groups.find((group) => group.name.toLowerCase() === key);
}

export async function getBot(botId: string): Promise<Bot | undefined> {
  const cached = ram.bots.find((bot) => bot.id === botId || bot.agentId === botId);
  if (cached) return cached;
  if (!(await hasApiKey())) return undefined;
  try {
    const agent = await getCloudAgent(botId);
    if (!agent) return undefined;
    const bot = await botFromAgent(agent);
    ram = { ...ram, bots: [bot, ...ram.bots.filter((item) => item.id !== bot.id)] };
    return bot;
  } catch {
    return undefined;
  }
}

export async function createBot(input: CreateBotInput): Promise<Bot> {
  return withLock(async () => {
    const name = input.name.trim();
    if (!name) throw new Error("Name is required");
    const agent = input.agentId?.trim()
      ? await getCloudAgent(input.agentId.trim())
      : await createCloudAgent(input);
    if (!agent) throw new Error("Cloud agent not found");
    const bot = agentToBot(agent);
    bot.role = input.role?.trim() ?? "";
    bot.model = input.model?.trim() || "composer-2.5";
    if (input.character) bot.character = input.character;
    ram = { ...ram, bots: [bot, ...ram.bots.filter((item) => item.id !== bot.id)] };
    return bot;
  });
}

function nameTaken(
  items: { id: string; name: string }[],
  id: string,
  name: string,
): boolean {
  const key = name.toLowerCase();
  return items.some((item) => item.id !== id && item.name.toLowerCase() === key);
}

export async function updateBot(
  botId: string,
  patch: UpdateBotInput & { agentId?: string },
): Promise<Bot | undefined> {
  return withLock(async () => {
    const store = await readStore();
    let bot = store.bots.find((item) => item.id === botId || item.agentId === botId);
    if (!bot) {
      const agent = await getCloudAgent(botId);
      if (!agent) return undefined;
      const created = agentToBot(agent);
      bot = created;
      store.bots = [created, ...store.bots.filter((item) => item.id !== created.id)];
    }
    if (patch.name !== undefined) {
      const next = patch.name.trim();
      if (!next) throw new Error("Name is required");
      if (nameTaken(store.bots, botId, next)) throw new Error("Name is taken");
      bot.name = next;
    }
    if (patch.role !== undefined) bot.role = patch.role.trim();
    if (patch.model !== undefined) bot.model = patch.model.trim();
    if (patch.repoUrl !== undefined) bot.repoUrl = patch.repoUrl.trim() || undefined;
    if (patch.startingRef !== undefined) {
      bot.startingRef = patch.startingRef.trim() || undefined;
    }
    if (patch.character !== undefined) {
      if (BUDDY_KINDS.includes(patch.character)) bot.character = patch.character;
    }
    if (patch.avatar !== undefined) bot.avatar = patch.avatar.trim() || undefined;
    if (patch.agentId !== undefined) bot.agentId = patch.agentId;
    bot.updatedAt = new Date().toISOString();
    await writeStore(store);
    return bot;
  });
}

export async function renameBot(
  botId: string,
  name: string,
): Promise<Bot | undefined> {
  return withLock(async () => {
    const store = await readStore();
    const bot = store.bots.find((item) => item.id === botId);
    if (!bot) return undefined;
    const next = name.trim();
    if (!next) throw new Error("Name is required");
    if (nameTaken(store.bots, botId, next)) throw new Error("Name is taken");
    bot.name = next;
    bot.updatedAt = new Date().toISOString();
    await writeStore(store);
    return bot;
  });
}

export async function renameGroup(
  groupId: string,
  name: string,
): Promise<BotGroup | undefined> {
  return withLock(async () => {
    const store = await readStore();
    const group = store.groups.find((item) => item.id === groupId);
    if (!group) return undefined;
    const next = name.trim();
    if (!next) throw new Error("Name is required");
    if (nameTaken(store.groups, groupId, next)) {
      throw new Error("Group name is taken");
    }
    group.name = next;
    group.updatedAt = new Date().toISOString();
    await writeStore(store);
    return group;
  });
}

export async function setPinned(
  botId: string,
  pinned: boolean,
): Promise<Bot | undefined> {
  return withLock(async () => {
    const store = await readStore();
    const bot = store.bots.find((item) => item.id === botId);
    if (!bot) return undefined;
    bot.pinned = pinned;
    bot.pinnedAt = pinned ? new Date().toISOString() : undefined;
    await writeStore(store);
    return bot;
  });
}

export async function deleteBot(botId: string): Promise<Bot | undefined> {
  return withLock(async () => {
    const store = await readStore();
    const index = store.bots.findIndex((bot) => bot.id === botId || bot.agentId === botId);
    const removed = index === -1 ? undefined : store.bots[index];
    const agentId = removed?.agentId ?? removed?.id ?? botId;
    if (!agentId) return undefined;
    await archiveCloudAgent(agentId);
    if (index !== -1) store.bots.splice(index, 1);
    if (removed) {
      const key = removed.name.toLowerCase();
      if (!store.removedNames.some((name) => name.toLowerCase() === key)) {
        store.removedNames.push(removed.name);
      }
    }
    for (const group of store.groups) {
      group.botIds = group.botIds.filter((id) => id !== botId && id !== agentId);
    }
    await writeStore(store);
    return (
      removed ?? {
        id: agentId,
        name: agentId,
        role: "",
        model: "composer-2.5",
        agentId,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    );
  });
}

export async function createGroup(input: CreateGroupInput): Promise<BotGroup> {
  return withLock(async () => {
    const store = await readStore();
    const name = input.name.trim();
    if (!name) throw new Error("Name is required");
    const taken = store.groups.some(
      (group) => group.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) throw new Error("Group name is taken");

    const botIds = [...new Set(input.botIds)].filter((botId) =>
      store.bots.some((bot) => bot.id === botId),
    );
    if (botIds.length === 0) throw new Error("Pick at least one bot");

    const now = new Date().toISOString();
    const group: BotGroup = {
      id: id("grp"),
      name,
      botIds,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    store.groups.push(group);
    await writeStore(store);
    return group;
  });
}

export async function updateGroup(
  groupId: string,
  patch: UpdateGroupInput,
): Promise<BotGroup | undefined> {
  return withLock(async () => {
    const store = await readStore();
    const group = store.groups.find((item) => item.id === groupId);
    if (!group) return undefined;
    if (patch.name !== undefined) {
      const next = patch.name.trim();
      if (!next) throw new Error("Name is required");
      if (nameTaken(store.groups, groupId, next)) {
        throw new Error("Group name is taken");
      }
      group.name = next;
    }
    if (patch.botIds !== undefined) {
      const botIds = [...new Set(patch.botIds)].filter((botId) =>
        store.bots.some((bot) => bot.id === botId),
      );
      if (botIds.length === 0) throw new Error("Pick at least one bot");
      group.botIds = botIds;
    }
    group.updatedAt = new Date().toISOString();
    await writeStore(store);
    return group;
  });
}

export async function addGroupMembers(
  groupId: string,
  botIds: string[],
): Promise<BotGroup | undefined> {
  return withLock(async () => {
    const store = await readStore();
    const group = store.groups.find((item) => item.id === groupId);
    if (!group) return undefined;
    const known = new Set(group.botIds);
    for (const botId of botIds) {
      if (known.has(botId)) continue;
      if (!store.bots.some((bot) => bot.id === botId)) continue;
      known.add(botId);
      group.botIds.push(botId);
    }
    group.updatedAt = new Date().toISOString();
    await writeStore(store);
    return group;
  });
}

export async function deleteGroup(groupId: string): Promise<BotGroup | undefined> {
  return withLock(async () => {
    const store = await readStore();
    const index = store.groups.findIndex((group) => group.id === groupId);
    if (index === -1) return undefined;
    const [removed] = store.groups.splice(index, 1);
    await writeStore(store);
    return removed;
  });
}

function toMessage(
  message: Omit<ChatMessage, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): ChatMessage {
  return {
    id: message.id ?? id("msg"),
    role: message.role,
    content: message.content,
    runId: message.runId,
    createdAt: message.createdAt ?? new Date().toISOString(),
    source: message.source,
    fromBotId: message.fromBotId,
    fromName: message.fromName,
    toBotIds: message.toBotIds,
    taskId: message.taskId,
  };
}

export async function appendMessage(
  botId: string,
  message: Omit<ChatMessage, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<ChatMessage | undefined> {
  return withLock(async () => {
    const store = await readStore();
    const bot = store.bots.find((item) => item.id === botId);
    if (!bot) return undefined;
    const saved = toMessage(message);
    bot.messages.push(saved);
    bot.updatedAt = saved.createdAt;
    await writeStore(store);
    return saved;
  });
}

export async function updateMessage(
  botId: string,
  messageId: string,
  patch: Partial<Pick<ChatMessage, "content" | "runId">>,
): Promise<ChatMessage | undefined> {
  return withLock(async () => {
    const store = await readStore();
    const bot = store.bots.find((item) => item.id === botId);
    if (!bot) return undefined;
    const message = bot.messages.find((item) => item.id === messageId);
    if (!message) return undefined;
    if (patch.content !== undefined) message.content = patch.content;
    if (patch.runId !== undefined) message.runId = patch.runId;
    bot.updatedAt = new Date().toISOString();
    await writeStore(store);
    return message;
  });
}

function toTeamMessage(
  message: Omit<TeamMessage, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): TeamMessage {
  return {
    id: message.id ?? id("msg"),
    from: message.from,
    botId: message.botId,
    name: message.name,
    content: message.content,
    toBotIds: message.toBotIds,
    source: message.source,
    fromBotId: message.fromBotId,
    taskId: message.taskId,
    createdAt: message.createdAt ?? new Date().toISOString(),
  };
}

export async function appendTeamMessage(
  message: Omit<TeamMessage, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<TeamMessage> {
  return withLock(async () => {
    const store = await readStore();
    const saved = toTeamMessage(message);
    store.team.push(saved);
    if (store.team.length > TEAM_CAP) {
      store.team = store.team.slice(-TEAM_CAP);
    }
    await writeStore(store);
    return saved;
  });
}

export async function appendGroupMessage(
  groupId: string,
  message: Omit<TeamMessage, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<TeamMessage | undefined> {
  return withLock(async () => {
    const store = await readStore();
    const group = store.groups.find((item) => item.id === groupId);
    if (!group) return undefined;
    const saved = toTeamMessage(message);
    group.messages.push(saved);
    if (group.messages.length > TEAM_CAP) {
      group.messages = group.messages.slice(-TEAM_CAP);
    }
    group.updatedAt = saved.createdAt;
    await writeStore(store);
    return saved;
  });
}
