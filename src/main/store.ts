import { app } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { id } from "./ids";
import { sortBots } from "../shared/bots";
import { backfillSourcesFrom, collectBackfillSpawns } from "../shared/spawn";
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

let writeQueue: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function storeFile(): string {
  return path.join(app.getPath("userData"), "store.json");
}

function normalize(parsed: Partial<StoreData> | null): StoreData {
  return {
    bots: Array.isArray(parsed?.bots) ? parsed.bots : [],
    team: Array.isArray(parsed?.team) ? parsed.team : [],
    groups: Array.isArray(parsed?.groups) ? parsed.groups : [],
    removedNames: Array.isArray(parsed?.removedNames)
      ? parsed.removedNames.filter((name): name is string => typeof name === "string")
      : [],
  };
}

async function readStore(): Promise<StoreData> {
  try {
    const raw = await readFile(storeFile(), "utf8");
    return normalize(JSON.parse(raw) as StoreData);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty;
    throw error;
  }
}

async function writeStore(data: StoreData): Promise<void> {
  const file = storeFile();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

export async function listBots(): Promise<Bot[]> {
  return sortBots((await readStore()).bots);
}

export async function listRemovedNames(): Promise<string[]> {
  return (await readStore()).removedNames;
}

export async function backfillMissingBots(): Promise<Bot[]> {
  const bots = await listBots();
  const team = await listTeam();
  const specs = collectBackfillSpawns(
    backfillSourcesFrom({ team, bots }),
    bots.map((bot) => bot.name),
    await listRemovedNames(),
  );
  if (specs.length === 0) return [];

  const model =
    bots.find((bot) => bot.name.toLowerCase() === "chefen")?.model ||
    bots[0]?.model ||
    "composer-2.5";

  const created: Bot[] = [];
  for (const spec of specs) {
    try {
      created.push(
        await createBot({
          name: spec.name,
          role: spec.role,
          model,
          agentId: spec.agentId,
        }),
      );
    } catch {
      // Name taken or invalid — skip.
    }
  }
  return created;
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
  const store = await readStore();
  return store.bots.find((bot) => bot.id === botId);
}

export async function createBot(input: CreateBotInput): Promise<Bot> {
  return withLock(async () => {
    const store = await readStore();
    const name = input.name.trim();
    if (!name) throw new Error("Namn krävs");
    const taken = store.bots.some(
      (bot) => bot.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) throw new Error("Namnet är upptaget");

    const now = new Date().toISOString();
    const bot: Bot = {
      id: id("bot"),
      name,
      role: input.role?.trim() ?? "",
      model: input.model?.trim() || "composer-2.5",
      repoUrl: input.repoUrl?.trim() || undefined,
      startingRef: input.startingRef?.trim() || undefined,
      character: input.character,
      agentId: input.agentId?.trim() || undefined,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    store.bots.push(bot);
    store.removedNames = store.removedNames.filter(
      (item) => item.toLowerCase() !== name.toLowerCase(),
    );
    await writeStore(store);
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
    const bot = store.bots.find((item) => item.id === botId);
    if (!bot) return undefined;
    if (patch.name !== undefined) {
      const next = patch.name.trim();
      if (!next) throw new Error("Namn krävs");
      if (nameTaken(store.bots, botId, next)) throw new Error("Namnet är upptaget");
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
    if (!next) throw new Error("Namn krävs");
    if (nameTaken(store.bots, botId, next)) throw new Error("Namnet är upptaget");
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
    if (!next) throw new Error("Namn krävs");
    if (nameTaken(store.groups, groupId, next)) {
      throw new Error("Gruppnamnet är upptaget");
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
    const index = store.bots.findIndex((bot) => bot.id === botId);
    if (index === -1) return undefined;
    const [removed] = store.bots.splice(index, 1);
    const key = removed.name.toLowerCase();
    if (!store.removedNames.some((name) => name.toLowerCase() === key)) {
      store.removedNames.push(removed.name);
    }
    for (const group of store.groups) {
      group.botIds = group.botIds.filter((id) => id !== botId);
    }
    await writeStore(store);
    return removed;
  });
}

export async function createGroup(input: CreateGroupInput): Promise<BotGroup> {
  return withLock(async () => {
    const store = await readStore();
    const name = input.name.trim();
    if (!name) throw new Error("Namn krävs");
    const taken = store.groups.some(
      (group) => group.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) throw new Error("Gruppnamnet är upptaget");

    const botIds = [...new Set(input.botIds)].filter((botId) =>
      store.bots.some((bot) => bot.id === botId),
    );
    if (botIds.length === 0) throw new Error("Välj minst en bot");

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
      if (!next) throw new Error("Namn krävs");
      if (nameTaken(store.groups, groupId, next)) {
        throw new Error("Gruppnamnet är upptaget");
      }
      group.name = next;
    }
    if (patch.botIds !== undefined) {
      const botIds = [...new Set(patch.botIds)].filter((botId) =>
        store.bots.some((bot) => bot.id === botId),
      );
      if (botIds.length === 0) throw new Error("Välj minst en bot");
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
