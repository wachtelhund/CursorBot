import { Agent, Cursor } from "@cursor/sdk";
import { app, ipcMain } from "electron";
import { parseHandoffs } from "../shared/mentions";
import {
  isHarnessOnlyUserText,
  shouldPostUserMessage,
  shouldWakeTargets,
} from "../shared/route";
import { parseSendPayload, resolveSendTargets } from "../shared/send";
import {
  deleteSecret,
  getPublicSettings,
  hasApiKey,
  requireApiKey,
  saveApiKey,
  upsertSecret,
} from "./settings";
import { releaseBotAgent } from "./cursor";
import { applyGroupCommands, applySpawns, latestActiveId, postLog, wakeMany } from "./harness";
import { openCloudAgent } from "./open-agent";
import { applyLatestUpdate, fetchLatestUpdate } from "./updates";
import {
  createBot,
  createGroup,
  deleteBot,
  deleteGroup,
  getBot,
  getGroup,
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
  ipcMain.handle("settings:get", async () => getPublicSettings());
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
    if (!event.sender.isDestroyed()) {
      event.sender.send("bots:event", { type: "group", group });
    }
    return group;
  });

  ipcMain.handle("groups:delete", async (event, groupId: string) => {
    const group = await deleteGroup(String(groupId ?? ""));
    if (!group) throw new Error("Group does not exist");
    if (!event.sender.isDestroyed()) {
      event.sender.send("bots:event", { type: "group-deleted", groupId: group.id });
    }
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
      if (!event.sender.isDestroyed()) {
        event.sender.send("bots:event", { type: "group", group });
      }
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
      if (!event.sender.isDestroyed()) {
        event.sender.send("bots:event", { type: "bot", bot });
      }
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
      if (!event.sender.isDestroyed()) {
        event.sender.send("bots:event", { type: "bot", bot });
      }
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
      if (!event.sender.isDestroyed()) {
        event.sender.send("bots:event", { type: "group", group });
      }
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
    return createBot(input);
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
    async (event, payload: SendMessageInput | string, maybeText?: string) => {
      const parsed = parseSendPayload(payload, maybeText);
      if (!parsed.text) throw new Error("Message is required");

      const bots = await listBots();
      if (bots.length === 0) throw new Error("Create a bot first");
      if (parsed.botId && !bots.some((bot) => bot.id === parsed.botId)) {
        throw new Error("Bot does not exist");
      }

      const donor =
        bots.find((bot) => bot.id === parsed.botId) ??
        bots.find((bot) => bot.id === latestActiveId(bots)) ??
        bots[0];
      await applySpawns(event.sender, donor, parsed.text, null);
      const destId = await applyGroupCommands(event.sender, null, parsed.text);
      const fresh = await listBots();

      const group = parsed.groupId
        ? await getGroup(parsed.groupId)
        : parsed.botId
          ? undefined
          : destId
            ? await getGroup(destId)
            : undefined;
      if (parsed.groupId && !group) throw new Error("Group does not exist");

      const pool = group
        ? fresh.filter((bot) => group.botIds.includes(bot.id))
        : fresh;
      if (pool.length === 0) {
        throw new Error(group ? "This group is empty" : "Create a bot first");
      }

      const roster = pool.map((bot) => ({ id: bot.id, name: bot.name }));
      const mentioned = parseHandoffs(parsed.text, roster).map((item) => item.botId);
      const fallback = latestActiveId(pool) ?? pool[0].id;
      const targetIds = resolveSendTargets({
        botId: parsed.botId,
        mentionedIds: mentioned,
        fallbackId: fallback,
      });

      const harnessOnly = isHarnessOnlyUserText(parsed.text);
      if (
        shouldPostUserMessage({
          harnessOnly,
          botId: parsed.botId,
          groupId: group?.id,
        })
      ) {
        await postLog(event.sender, group?.id, {
          from: "user",
          name: "You",
          content: parsed.text,
          toBotIds: targetIds,
        });
      }
      if (shouldWakeTargets({ harnessOnly, botId: parsed.botId })) {
        wakeMany(
          event.sender,
          targetIds,
          parsed.text,
          "user",
          parsed.botId ? undefined : group?.id,
          Boolean(parsed.botId),
          parsed.sendMode,
        );
        return { targetIds };
      }
      return { targetIds: [] };
    },
  );
}
