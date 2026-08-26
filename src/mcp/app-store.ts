import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  hopsTowardBot,
  isHandoffMessage,
  isInspectMessage,
  isRosterNotice,
  lastDmPreview,
  dmActivityAt,
  type InspectMessage,
  type LogHop,
} from "../shared/collapse.ts";
import { publicBotText } from "../shared/mentions.ts";
import { TEAM_SCOPE, type Bot, type BotGroup, type ChatMessage, type TeamMessage } from "../shared/types.ts";

export type AppStore = {
  bots: Bot[];
  team: TeamMessage[];
  groups: BotGroup[];
  removedNames: string[];
};

export type PathEnv = {
  CURSOR_BOTS_STORE?: string;
  CURSOR_BOTS_USER_DATA?: string;
  APPDATA?: string;
  XDG_CONFIG_HOME?: string;
};

export type CandidateInfo = {
  path: string;
  exists: boolean;
  hasContent: boolean;
  lastActivity?: string;
  mtimeMs?: number;
};

export type LoadedStore = {
  path: string | null;
  store: AppStore;
  mtimeMs?: number;
  candidates: CandidateInfo[];
};

export type StorePick = {
  path: string;
  mtimeMs: number;
  hasContent: boolean;
  lastActivityMs: number;
};

const EMPTY: AppStore = { bots: [], team: [], groups: [], removedNames: [] };

const SECRET_KEYS = new Set([
  "apikey",
  "api_key",
  "secret",
  "secrets",
  "secretsenc",
  "secrets_enc",
  "token",
  "access_token",
  "accesstoken",
  "auth_token",
  "password",
  "passwd",
  "authorization",
  "credential",
  "credentials",
  "private_key",
  "privatekey",
]);

const APP_DIR_NAMES = ["Cursor Bots", "cursor-bots", "Electron", "electron"];

export function isSecretKey(name: string): boolean {
  return SECRET_KEYS.has(name.toLowerCase());
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (isSecretKey(key)) continue;
    out[key] = redactSecrets(nested);
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function normalizeStore(parsed: unknown): AppStore {
  const row = asRecord(parsed);
  return {
    bots: Array.isArray(row?.bots) ? (row.bots as Bot[]) : [],
    team: Array.isArray(row?.team) ? (row.team as TeamMessage[]) : [],
    groups: Array.isArray(row?.groups) ? (row.groups as BotGroup[]) : [],
    removedNames: Array.isArray(row?.removedNames)
      ? row.removedNames.filter((name): name is string => typeof name === "string")
      : [],
  };
}

export function parseStoreJson(raw: string): AppStore {
  return normalizeStore(redactSecrets(JSON.parse(raw) as unknown));
}

export function storeHasContent(store: AppStore): boolean {
  return store.bots.length > 0 || store.team.length > 0 || store.groups.length > 0;
}

export function storeActivityMs(store: AppStore): number {
  let max = 0;
  const bump = (iso?: string) => {
    if (!iso) return;
    const ms = Date.parse(iso);
    if (Number.isFinite(ms) && ms > max) max = ms;
  };
  for (const bot of store.bots) {
    bump(bot.updatedAt);
    bump(bot.createdAt);
    for (const message of bot.messages ?? []) bump(message.createdAt);
  }
  for (const message of store.team) bump(message.createdAt);
  for (const group of store.groups) {
    bump(group.updatedAt);
    bump(group.createdAt);
    for (const message of group.messages ?? []) bump(message.createdAt);
  }
  return max;
}

function pathFor(platform: NodeJS.Platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function uniquePaths(paths: string[], platform: NodeJS.Platform): string[] {
  const resolve = pathFor(platform).resolve;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const file of paths) {
    const resolved = resolve(file);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

export function appSupportRoot(
  platform: NodeJS.Platform,
  home: string,
  env: PathEnv = {},
): string {
  const join = pathFor(platform).join;
  if (platform === "darwin") {
    return join(home, "Library", "Application Support");
  }
  if (platform === "win32") {
    return env.APPDATA || join(home, "AppData", "Roaming");
  }
  return env.XDG_CONFIG_HOME || join(home, ".config");
}

export function candidateStorePaths(input: {
  env?: PathEnv;
  platform?: NodeJS.Platform;
  home?: string;
} = {}): string[] {
  const env = input.env ?? {};
  const platform = input.platform ?? process.platform;
  const home = input.home ?? os.homedir();
  const join = pathFor(platform).join;
  const files: string[] = [];
  if (env.CURSOR_BOTS_STORE) files.push(env.CURSOR_BOTS_STORE);
  if (env.CURSOR_BOTS_USER_DATA) {
    files.push(join(env.CURSOR_BOTS_USER_DATA, "store.json"));
  }
  const root = appSupportRoot(platform, home, env);
  for (const name of APP_DIR_NAMES) {
    files.push(join(root, name, "store.json"));
  }
  return uniquePaths(files, platform);
}

export function pickBestStore(rows: StorePick[]): StorePick | undefined {
  if (rows.length === 0) return undefined;
  return [...rows].sort((a, b) => {
    if (a.hasContent !== b.hasContent) return a.hasContent ? -1 : 1;
    if (a.lastActivityMs !== b.lastActivityMs) return b.lastActivityMs - a.lastActivityMs;
    return b.mtimeMs - a.mtimeMs;
  })[0];
}

async function tryReadStore(
  file: string,
): Promise<{ store: AppStore; mtimeMs: number } | undefined> {
  try {
    const [raw, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    if (!info.isFile()) return undefined;
    return { store: parseStoreJson(raw), mtimeMs: info.mtimeMs };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function candidateFrom(
  file: string,
  loaded?: { store: AppStore; mtimeMs: number },
): CandidateInfo {
  if (!loaded) return { path: file, exists: false, hasContent: false };
  const lastMs = storeActivityMs(loaded.store);
  return {
    path: file,
    exists: true,
    hasContent: storeHasContent(loaded.store),
    lastActivity: lastMs > 0 ? new Date(lastMs).toISOString() : undefined,
    mtimeMs: loaded.mtimeMs,
  };
}

export async function loadAppStore(input: {
  env?: PathEnv;
  platform?: NodeJS.Platform;
  home?: string;
} = {}): Promise<LoadedStore> {
  const env = input.env ?? process.env;
  const platform = input.platform ?? process.platform;
  const home = input.home ?? os.homedir();

  const resolve = pathFor(platform).resolve;
  const join = pathFor(platform).join;

  if (env.CURSOR_BOTS_STORE) {
    const file = resolve(env.CURSOR_BOTS_STORE);
    const loaded = await tryReadStore(file);
    return {
      path: loaded ? file : null,
      store: loaded?.store ?? EMPTY,
      mtimeMs: loaded?.mtimeMs,
      candidates: [candidateFrom(file, loaded)],
    };
  }

  if (env.CURSOR_BOTS_USER_DATA) {
    const file = resolve(join(env.CURSOR_BOTS_USER_DATA, "store.json"));
    const loaded = await tryReadStore(file);
    if (loaded) {
      return {
        path: file,
        store: loaded.store,
        mtimeMs: loaded.mtimeMs,
        candidates: [candidateFrom(file, loaded)],
      };
    }
  }

  const files = candidateStorePaths({ env, platform, home });
  const scored: Array<StorePick & { store: AppStore }> = [];
  const candidates: CandidateInfo[] = [];
  for (const file of files) {
    const loaded = await tryReadStore(file);
    candidates.push(candidateFrom(file, loaded));
    if (!loaded) continue;
    scored.push({
      path: file,
      store: loaded.store,
      mtimeMs: loaded.mtimeMs,
      hasContent: storeHasContent(loaded.store),
      lastActivityMs: storeActivityMs(loaded.store),
    });
  }
  const best = pickBestStore(scored);
  if (!best) return { path: null, store: EMPTY, candidates };
  const chosen = scored.find((row) => row.path === best.path);
  return {
    path: best.path,
    store: chosen?.store ?? EMPTY,
    mtimeMs: best.mtimeMs,
    candidates,
  };
}

function clipPreview(text: string, max = 160): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function lastTeamPreview(messages: TeamMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.from === "user") return message.content;
    if (message.source === "handoff" || message.source === "system") continue;
    if (isRosterNotice(message.content) || isHandoffMessage(message)) continue;
    const text = publicBotText(message.content);
    if (text) return text;
  }
  return "";
}

function lastIso(messages: { createdAt?: string }[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const iso = messages[index]?.createdAt;
    if (iso) return iso;
  }
  return undefined;
}

function annotateTeam(messages: TeamMessage[]) {
  return messages.map((message, index) => {
    const inspect = isInspectMessage(message, messages.slice(0, index));
    const klartext =
      message.from === "user"
        ? message.content
        : inspect
          ? ""
          : publicBotText(message.content);
    return { ...message, inspect, klartext };
  });
}

function asInspect(message: ChatMessage, speakerId: string): InspectMessage {
  const fromPeer = Boolean(
    message.fromBotId &&
      message.fromBotId !== speakerId &&
      (message.source === "bot" || message.source === "handoff"),
  );
  return {
    from: message.role === "user" ? "user" : "bot",
    content: message.content,
    toBotIds: message.toBotIds,
    source: message.source,
    botId: fromPeer ? message.fromBotId : speakerId,
  };
}

function annotateDm(messages: ChatMessage[], speakerId: string) {
  return messages.map((message, index) => {
    const previous = messages.slice(0, index).map((item) => asInspect(item, speakerId));
    const inspect =
      message.role === "assistant" && isInspectMessage(asInspect(message, speakerId), previous);
    const klartext =
      message.role === "user"
        ? message.content
        : inspect
          ? ""
          : publicBotText(message.content);
    return { ...message, inspect, klartext };
  });
}

function annotateHops(hops: LogHop[]) {
  return hops.map((message, index) => {
    const inspect = isInspectMessage(message, hops.slice(0, index));
    return {
      ...message,
      inspect,
      klartext: inspect || message.from !== "bot" ? "" : publicBotText(message.content),
    };
  });
}

function takeLast<T>(items: T[], limit?: number): T[] {
  if (!limit || limit <= 0 || items.length <= limit) return items;
  return items.slice(-limit);
}

export function listBotsView(store: AppStore) {
  return store.bots.map((bot) => ({
    id: bot.id,
    name: bot.name,
    role: bot.role,
    model: bot.model,
    agentId: bot.agentId,
    pinned: Boolean(bot.pinned),
    messageCount: bot.messages?.length ?? 0,
    lastPreview: clipPreview(lastDmPreview(bot.messages ?? [], { botId: bot.id, team: store.team })),
    lastActivity: dmActivityAt({ id: bot.id, updatedAt: bot.updatedAt }, store.team),
  }));
}

export function listGroupsView(store: AppStore) {
  const names = new Map(store.bots.map((bot) => [bot.id, bot.name]));
  return store.groups.map((group) => ({
    id: group.id,
    name: group.name,
    botIds: group.botIds,
    members: group.botIds.map((id) => names.get(id) ?? id),
    messageCount: group.messages?.length ?? 0,
    lastPreview: clipPreview(lastTeamPreview(group.messages ?? [])),
    lastActivity: lastIso(group.messages ?? []) ?? group.updatedAt,
  }));
}

export function listThreadsView(store: AppStore) {
  const team = {
    id: TEAM_SCOPE,
    kind: "team" as const,
    name: "Team",
    messageCount: store.team.length,
    lastPreview: clipPreview(lastTeamPreview(store.team)),
    lastActivity: lastIso(store.team),
  };
  const groups = listGroupsView(store).map((group) => ({
    ...group,
    kind: "group" as const,
  }));
  const dms = listBotsView(store).map((bot) => ({
    id: bot.id,
    kind: "dm" as const,
    name: bot.name,
    messageCount: bot.messageCount,
    lastPreview: bot.lastPreview,
    lastActivity: bot.lastActivity,
  }));
  return [team, ...groups, ...dms].sort((a, b) => {
    return Date.parse(b.lastActivity ?? "") - Date.parse(a.lastActivity ?? "") || 0;
  });
}

export function getThreadView(store: AppStore, thread: string, limit?: number) {
  const key = thread.trim();
  if (!key) throw new Error("thread is required (team, group id/name, or bot id/name)");
  if (key.toLowerCase() === TEAM_SCOPE) {
    return {
      kind: "team" as const,
      id: TEAM_SCOPE,
      name: "Team",
      messages: takeLast(annotateTeam(store.team), limit),
    };
  }

  const lower = key.toLowerCase();
  const botMatches = store.bots.filter(
    (bot) => bot.id === key || bot.name.toLowerCase() === lower,
  );
  const groupMatches = store.groups.filter(
    (group) => group.id === key || group.name.toLowerCase() === lower,
  );
  if (botMatches.length + groupMatches.length > 1 && !store.bots.some((bot) => bot.id === key) && !store.groups.some((group) => group.id === key)) {
    throw new Error(`Ambiguous thread name: ${key}`);
  }

  const bot = store.bots.find((item) => item.id === key) ?? botMatches[0];
  if (bot) {
    const stored = bot.messages ?? [];
    const storedIds = new Set(stored.map((message) => message.id));
    const hops = hopsTowardBot(store.team, bot.id).filter((hop) => !storedIds.has(hop.id));
    return {
      kind: "dm" as const,
      id: bot.id,
      name: bot.name,
      role: bot.role,
      messages: takeLast(annotateDm(stored, bot.id), limit),
      inspectHops: annotateHops(hops),
    };
  }

  const group = store.groups.find((item) => item.id === key) ?? groupMatches[0];
  if (group) {
    return {
      kind: "group" as const,
      id: group.id,
      name: group.name,
      botIds: group.botIds,
      messages: takeLast(annotateTeam(group.messages ?? []), limit),
    };
  }

  throw new Error(`Thread not found: ${key}`);
}

export function storeSummaryView(loaded: LoadedStore) {
  const lastMs = storeActivityMs(loaded.store);
  return {
    storePath: loaded.path,
    storeMtime: loaded.mtimeMs ? new Date(loaded.mtimeMs).toISOString() : undefined,
    botCount: loaded.store.bots.length,
    groupCount: loaded.store.groups.length,
    teamMessageCount: loaded.store.team.length,
    dmMessageCount: loaded.store.bots.reduce(
      (sum, bot) => sum + (bot.messages?.length ?? 0),
      0,
    ),
    lastActivity: lastMs > 0 ? new Date(lastMs).toISOString() : undefined,
    readsSettings: false,
    candidates: loaded.candidates,
  };
}

export function assertNoSecrets(value: unknown, trail = "root"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (isSecretKey(key)) {
      throw new Error(`Secret key leaked at ${trail}.${key}`);
    }
    assertNoSecrets(nested, `${trail}.${key}`);
  }
}
