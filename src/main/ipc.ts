import { Agent, Cursor } from "@cursor/sdk";
import { app, ipcMain } from "electron";
import { publish } from "./bus";
import {
  enableRemote,
  getRemoteAccess,
  rotateRemote,
  startInternetLink,
  stopInternetLink,
} from "./remote-access";
import { sendUserMessage } from "./send-user";
import {
  deleteSecret,
  getPublicSettings,
  hasApiKey,
  requireApiKey,
  saveApiKey,
  upsertSecret,
} from "./settings";
import { releaseBotAgent } from "./cursor";
import { openCloudAgent } from "./open-agent";
import { applyLatestUpdate, fetchLatestUpdate } from "./updates";
import {
  createBot,
  createGroup,
  deleteBot,
  deleteGroup,
  getBot,
  listBots,
  listGroups,
  listTeam,
  renameBot,
  renameGroup,
  setPinned,
  updateBot,
  updateGroup,
} from "./store";
import {
  BUDDY_KINDS,
  type BuddyKind,
  type CreateBotInput,
  type CreateGroupInput,
  type SendMessageInput,
  type UpdateBotInput,
} from "../shared/types";

export function registerIpc(): void {
  ipcMain.handle("settings:get", async () => ({
    ...(await getPublicSettings()),
    remote: await getRemoteAccess(),
  }));
  ipcMain.handle("remote:enable", async (_event, enabled: boolean) => enableRemote(Boolean(enabled)));
  ipcMain.handle("remote:rotate", async () => rotateRemote());
  ipcMain.handle("remote:tunnel", async (event, on: boolean) => {
    if (!on) {
      stopInternetLink();
      return getRemoteAccess();
    }
    startInternetLink((access) => {
      if (!event.sender.isDestroyed()) event.sender.send("remote:changed", access);
    });
    return getRemoteAccess();
  });
  ipcMain.handle("updates:check", async () => fetchLatestUpdate(app.getVersion()));
  ipcMain.handle("updates:apply", async (event) => {
    const sender = event.sender;
    await applyLatestUpdate(app.getVersion(), {
      isPackaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      execPath: process.execPath,
      appImage: process.env.APPIMAGE,
      quit: () => app.quit(),
      onProgress: (progress) => {
        if (!sender.isDestroyed()) sender.send("updates:progress", progress);
      },
    });
  });

  ipcMain.handle("settings:saveApiKey", async (_event, apiKey: string) => {
    await saveApiKey(String(apiKey ?? ""));
    return getPublicSettings();
  });

  ipcMain.handle(
    "settings:upsertSecret",
    async (_event, payload: { name: string; value: string }) => {
      await upsertSecret(String(payload?.name ?? ""), String(payload?.value ?? ""));
      return getPublicSettings();
    },
  );

  ipcMain.handle("settings:deleteSecret", async (_event, name: string) => {
    await deleteSecret(String(name ?? ""));
    return getPublicSettings();
  });

  ipcMain.handle("bots:list", async () => listBots());
  ipcMain.handle("team:list", async () => listTeam());
  ipcMain.handle("groups:list", async () => listGroups());

  ipcMain.handle("groups:create", async (event, input: CreateGroupInput) => {
    if (!input?.name?.trim()) throw new Error("Name is required");
    const group = await createGroup({
      name: input.name,
      botIds: Array.isArray(input.botIds) ? input.botIds.map(String) : [],
    });
    publish({ type: "group", group });
    return group;
  });

  ipcMain.handle("groups:delete", async (event, groupId: string) => {
    const group = await deleteGroup(String(groupId ?? ""));
    if (!group) throw new Error("Group does not exist");
    publish({ type: "group-deleted", groupId: group.id });
    return { ok: true };
  });

  ipcMain.handle(
    "groups:rename",
    async (event, payload: { groupId: string; name: string }) => {
      const group = await renameGroup(
        String(payload?.groupId ?? ""),
        String(payload?.name ?? ""),
      );
      if (!group) throw new Error("Group does not exist");
      publish({ type: "group", group });
      return group;
    },
  );

  ipcMain.handle(
    "bots:pin",
    async (_event, payload: { botId: string; pinned: boolean }) => {
      const bot = await setPinned(String(payload?.botId ?? ""), Boolean(payload?.pinned));
      if (!bot) throw new Error("Bot does not exist");
      return bot;
    },
  );

  ipcMain.handle(
    "bots:rename",
    async (event, payload: { botId: string; name: string }) => {
      const bot = await renameBot(String(payload?.botId ?? ""), String(payload?.name ?? ""));
      if (!bot) throw new Error("Bot does not exist");
      publish({ type: "bot", bot });
      return bot;
    },
  );

  ipcMain.handle(
    "bots:update",
    async (event, payload: { botId: string; patch?: UpdateBotInput }) => {
      const raw = payload?.patch ?? {};
      const patch: UpdateBotInput = {};
      if (typeof raw.name === "string") patch.name = raw.name;
      if (typeof raw.role === "string") patch.role = raw.role;
      if (typeof raw.model === "string") patch.model = raw.model;
      if (typeof raw.repoUrl === "string") patch.repoUrl = raw.repoUrl;
      if (typeof raw.startingRef === "string") patch.startingRef = raw.startingRef;
      if (typeof raw.avatar === "string") patch.avatar = raw.avatar;
      if (typeof raw.character === "string" && BUDDY_KINDS.includes(raw.character as BuddyKind)) {
        patch.character = raw.character as BuddyKind;
      }
      const bot = await updateBot(String(payload?.botId ?? ""), patch);
      if (!bot) throw new Error("Bot does not exist");
      publish({ type: "bot", bot });
      return bot;
    },
  );

  ipcMain.handle(
    "groups:update",
    async (event, payload: { groupId: string; name?: string; botIds?: string[] }) => {
      const group = await updateGroup(String(payload?.groupId ?? ""), {
        name: typeof payload?.name === "string" ? payload.name : undefined,
        botIds: Array.isArray(payload?.botIds) ? payload.botIds.map(String) : undefined,
      });
      if (!group) throw new Error("Group does not exist");
      publish({ type: "group", group });
      return group;
    },
  );

  ipcMain.handle("bots:openAgent", async (_event, botId: string) => {
    const bot = await getBot(String(botId ?? ""));
    if (!bot) throw new Error("Bot does not exist");
    if (!bot.agentId?.trim()) throw new Error("This bot has no Cloud Agent");
    return openCloudAgent(bot.agentId);
  });

  ipcMain.handle("bots:create", async (_event, input: CreateBotInput) => {
    if (!input?.name?.trim()) throw new Error("Name is required");
    const bot = await createBot(input);
    publish({ type: "bot", bot });
    return bot;
  });

  ipcMain.handle("bots:delete", async (_event, botId: string) => {
    await releaseBotAgent(botId);
    const bot = await deleteBot(botId);
    if (!bot) throw new Error("Bot does not exist");
    if (bot.agentId && (await hasApiKey())) {
      try {
        await Agent.archive(bot.agentId, { apiKey: await requireApiKey() });
      } catch {
        // Local delete already succeeded.
      }
    }
    return { ok: true };
  });

  ipcMain.handle("bots:usage", async (_event, botId: string) => {
    const bot = await getBot(botId);
    if (!bot) throw new Error("Bot does not exist");
    if (!bot.agentId) return null;
    try {
      return await Agent.getUsage(bot.agentId, { apiKey: await requireApiKey() });
    } catch {
      return null;
    }
  });

  ipcMain.handle("models:list", async () => {
    const models = await Cursor.models.list({ apiKey: await requireApiKey() });
    return models.map((model) => ({
      id: model.id,
      displayName: model.displayName,
    }));
  });

  ipcMain.handle(
    "bots:send",
    async (_event, payload: SendMessageInput | string, maybeText?: string) => {
      return sendUserMessage(payload, maybeText);
    },
  );
}
