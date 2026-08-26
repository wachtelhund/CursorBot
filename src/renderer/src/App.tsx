import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BUDDY_KINDS,
  TEAM_SCOPE,
  type Bot,
  type BotGroup,
  type BuddyKind,
  type ModelOption,
  type TeamMessage,
} from "@shared/types";
import { BotFace } from "./buddy";
import { Composer } from "./composer";
import { CreateDialog } from "./create-dialog";
import { CreateGroupDialog } from "./create-group-dialog";
import { EditPanel } from "./edit-panel";
import { GroupEditPanel } from "./group-edit-panel";
import { PinIcon, Sparkles, Spinner, TrashIcon } from "./icons";
import { applyPins, togglePinnedId } from "./pins";
import { SettingsPanel } from "./settings-panel";
import { Sidebar } from "./sidebar";
import { Thread, type ThreadItem } from "./thread";
import { t, useLang } from "./i18n";
import { buildDmRows, buildLogRows, mergeBusLogs } from "@shared/collapse";
import { sortBots } from "@shared/bots";
import { LATEST_RELEASE_PAGE, type UpdateAvailable, type UpdateCheckResult } from "@shared/updates";

const DEFAULT_MODEL = "composer-2.5";

export function App() {
  const { lang } = useLang();
  const [bots, setBots] = useState<Bot[]>([]);
  const [team, setTeam] = useState<TeamMessage[]>([]);
  const [groups, setGroups] = useState<BotGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(TEAM_SCOPE);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [secrets, setSecrets] = useState<{ name: string }[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [draft, setDraft] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [thinkingIds, setThinkingIds] = useState<string[]>([]);
  const [statusByBot, setStatusByBot] = useState<Record<string, string>>({});
  const [tools, setTools] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [relay, setRelay] = useState<string | null>(null);
  const [liveByBot, setLiveByBot] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [createGroupError, setCreateGroupError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string | undefined>();
  const [availableUpdate, setAvailableUpdate] = useState<UpdateAvailable | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [newCharacter, setNewCharacter] = useState<BuddyKind>(BUDDY_KINDS[0]);
  const scroller = useRef<HTMLDivElement>(null);
  const dmStream = useRef<Record<string, string>>({});

  const selected = useMemo(
    () => bots.find((bot) => bot.id === selectedId) ?? null,
    [bots, selectedId],
  );
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedId) ?? null,
    [groups, selectedId],
  );
  const isTeam = selectedId === TEAM_SCOPE;
  const isGroup = Boolean(selectedGroup);
  const editingBot = editingBotId
    ? (bots.find((bot) => bot.id === editingBotId) ?? null)
    : null;
  const editingGroup = editingGroupId
    ? (groups.find((group) => group.id === editingGroupId) ?? null)
    : null;

  const load = useCallback(async (preferId?: string) => {
    const nextBots = await window.cursorBots.listBots();
    let nextTeam: TeamMessage[] = [];
    let nextGroups: BotGroup[] = [];
    try {
      if (window.cursorBots.listTeam) {
        nextTeam = await window.cursorBots.listTeam();
      }
    } catch {
      nextTeam = [];
    }
    try {
      if (window.cursorBots.listGroups) {
        nextGroups = await window.cursorBots.listGroups();
      }
    } catch {
      nextGroups = [];
    }
    setBots(applyPins(nextBots));
    setTeam(nextTeam);
    setGroups(nextGroups);
    setSelectedId((current) => {
      if (preferId) return preferId;
      if (current === TEAM_SCOPE) return TEAM_SCOPE;
      if (current && nextBots.some((bot) => bot.id === current)) return current;
      if (current && nextGroups.some((group) => group.id === current)) return current;
      return TEAM_SCOPE;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await window.cursorBots.getSettings();
        if (!cancelled) {
          setHasApiKey(settings.hasApiKey);
          setSecrets(settings.secrets ?? []);
          setAppVersion(settings.appVersion);
        }
        await load();
        if (settings.hasApiKey) {
          try {
            const nextModels = await window.cursorBots.listModels();
            if (!cancelled) setModels(nextModels);
          } catch {
            // Models are optional until a key works.
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (typeof window.cursorBots.checkForUpdates !== "function") return;
    let cancelled = false;
    void window.cursorBots
      .checkForUpdates()
      .then((result) => {
        if (!cancelled && result.available) setAvailableUpdate(result);
      })
      .catch(() => {
        // Startup check is silent. Settings shows errors.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return window.cursorBots.onEvent((event) => {
      if (event.type === "thinking") {
        setThinkingIds((current) => {
          if (event.thinking) {
            return current.includes(event.botId) ? current : [...current, event.botId];
          }
          return current.filter((id) => id !== event.botId);
        });
      } else if (event.type === "agent") {
        setBots((current) =>
          current.map((bot) =>
            bot.id === event.botId ? { ...bot, agentId: event.agentId } : bot,
          ),
        );
      } else if (event.type === "append") {
        if (event.message.role === "assistant") {
          dmStream.current[event.botId] = event.message.id;
        }
        setBots((current) =>
          sortBots(
            current.map((bot) =>
              bot.id !== event.botId
                ? bot
                : {
                    ...bot,
                    messages: bot.messages.some((message) => message.id === event.message.id)
                      ? bot.messages
                      : [...bot.messages, event.message],
                    updatedAt: event.message.createdAt,
                  },
            ),
          ),
        );
      } else if (event.type === "text") {
        setLiveByBot((current) => ({
          ...current,
          [event.botId]: (current[event.botId] ?? "") + event.text,
        }));
        const streamId = dmStream.current[event.botId];
        if (streamId) {
          setBots((current) =>
            current.map((bot) =>
              bot.id !== event.botId
                ? bot
                : {
                    ...bot,
                    messages: bot.messages.map((message) =>
                      message.id === streamId
                        ? { ...message, content: message.content + event.text }
                        : message,
                    ),
                  },
            ),
          );
        }
      } else if (event.type === "tool") {
        setTools((current) => {
          const label = `${event.name} · ${event.status}`;
          return current.includes(label) ? current : [...current.slice(-6), label];
        });
      } else if (event.type === "status") {
        setStatusByBot((current) => ({
          ...current,
          [event.botId]: event.message || event.status,
        }));
      } else if (event.type === "relay") {
        setRelay(`${event.fromName ?? "Bot"} → ${event.toName}`);
      } else if (event.type === "team") {
        setTeam((current) =>
          current.some((message) => message.id === event.message.id)
            ? current
            : [...current, event.message],
        );
      } else if (event.type === "group") {
        setGroups((current) => {
          if (current.some((group) => group.id === event.group.id)) {
            return current.map((group) =>
              group.id === event.group.id ? event.group : group,
            );
          }
          return [event.group, ...current];
        });
      } else if (event.type === "group-message") {
        setGroups((current) =>
          current.map((group) => {
            if (group.id !== event.groupId) return group;
            if (group.messages.some((message) => message.id === event.message.id)) {
              return group;
            }
            return {
              ...group,
              messages: [...group.messages, event.message],
              updatedAt: event.message.createdAt,
            };
          }),
        );
      } else if (event.type === "group-deleted") {
        setGroups((current) => current.filter((group) => group.id !== event.groupId));
        setSelectedId((current) => (current === event.groupId ? TEAM_SCOPE : current));
        setEditingGroupId((current) => (current === event.groupId ? null : current));
      } else if (event.type === "bot") {
        setBots((current) => {
          if (current.some((bot) => bot.id === event.bot.id)) {
            return sortBots(
              current.map((bot) => (bot.id === event.bot.id ? event.bot : bot)),
            );
          }
          return sortBots([event.bot, ...current]);
        });
      } else if (event.type === "error") {
        setError(event.message);
        setLiveByBot((current) => {
          if (!(event.botId in current)) return current;
          const next = { ...current };
          delete next[event.botId];
          return next;
        });
      } else if (event.type === "done") {
        const streamId = dmStream.current[event.botId];
        delete dmStream.current[event.botId];
        setLiveByBot((current) => {
          if (!(event.botId in current)) return current;
          const next = { ...current };
          delete next[event.botId];
          return next;
        });
        if (streamId) {
          setBots((current) =>
            current.map((bot) =>
              bot.id !== event.botId
                ? bot
                : {
                    ...bot,
                    messages: bot.messages.map((message) =>
                      message.id === streamId
                        ? { ...message, content: event.result, runId: event.runId }
                        : message,
                    ),
                  },
            ),
          );
        }
      }
    });
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [selected?.messages, selectedGroup?.messages, team, thinkingIds, tools, liveByBot]);

  const bus = useMemo(
    () => mergeBusLogs(team, ...groups.map((group) => group.messages)),
    [groups, team],
  );

  const items = useMemo((): ThreadItem[] => {
    const liveFor = (ids: string[]) =>
      ids.flatMap((botId) => {
        const bot = bots.find((item) => item.id === botId);
        if (!bot) return [];
        const last = bot.messages.at(-1);
        return [
          {
            botId,
            name: bot.name,
            text: liveByBot[botId] ?? (last?.role === "assistant" ? last.content : ""),
            source: last?.source,
          },
        ];
      });

    const sharedThread = (messages: TeamMessage[], liveIds: string[]): ThreadItem[] =>
      buildLogRows(messages, liveFor(liveIds)).map((row) => ({
        id: row.id,
        author: row.author,
        name: row.name,
        bot: row.botId ? bots.find((bot) => bot.id === row.botId) : undefined,
        content: row.content,
        thinking: row.thinking,
        createdAt: row.createdAt,
        showName: row.author === "bot",
        handoff: row.inspect,
        toBotIds: row.toBotIds,
      }));

    if (isTeam) return sharedThread(team, thinkingIds);
    if (selectedGroup) {
      return sharedThread(
        selectedGroup.messages,
        thinkingIds.filter((id) => selectedGroup.botIds.includes(id)),
      );
    }
    if (!selected) return [];
    return buildDmRows(selected.messages, {
      speakerId: selected.id,
      thinking: thinkingIds.includes(selected.id),
      team: bus,
    }).map((row) => {
      const peer = row.fromPeer ? bots.find((bot) => bot.id === row.fromBotId) : undefined;
      const speaker =
        row.role === "assistant"
          ? (peer ?? (row.fromBotId ? bots.find((bot) => bot.id === row.fromBotId) : undefined) ?? selected)
          : undefined;
      return {
        id: row.id,
        author: row.role === "user" ? ("user" as const) : ("bot" as const),
        name: row.fromPeer
          ? (row.fromName ?? peer?.name ?? "Bot")
          : row.role === "user"
            ? t("you")
            : selected.name,
        bot: speaker,
        content: row.content,
        thinking: row.thinking,
        fromPeer: row.fromPeer,
        handoff: row.inspect,
        toBotIds: row.toBotIds,
        createdAt: row.createdAt,
        showName: row.fromPeer || row.inspect,
      };
    });
  }, [bots, bus, isTeam, lang, liveByBot, selected, selectedGroup, team, thinkingIds]);

  async function createBot(form: FormData) {
    setError(null);
    setCreateError(null);
    try {
      const bot = await window.cursorBots.createBot({
        name: String(form.get("name") ?? ""),
        role: String(form.get("role") ?? ""),
        model: String(form.get("model") ?? DEFAULT_MODEL),
        repoUrl: String(form.get("repoUrl") ?? ""),
        startingRef: String(form.get("startingRef") ?? ""),
        character: newCharacter,
      });
      setBots((current) =>
        current.some((item) => item.id === bot.id) ? current : [bot, ...current],
      );
      setSelectedId(bot.id);
      setEditingBotId(null);
      setEditingGroupId(null);
      setCreating(false);
      await load(bot.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("couldNotCreateBot");
      setCreateError(message);
      setError(message);
    }
  }

  async function createGroup(form: FormData) {
    setError(null);
    setCreateGroupError(null);
    if (typeof window.cursorBots.createGroup !== "function") {
      setCreateGroupError(t("restartAppWindow"));
      return;
    }
    const botIds = form.getAll("botIds").map(String);
    if (botIds.length === 0) {
      setCreateGroupError(t("noMembersSelected"));
      return;
    }
    try {
      const group = await window.cursorBots.createGroup({
        name: String(form.get("name") ?? ""),
        botIds,
      });
      setGroups((current) =>
        current.some((item) => item.id === group.id) ? current : [group, ...current],
      );
      setSelectedId(group.id);
      setEditingBotId(null);
      setEditingGroupId(null);
      setCreatingGroup(false);
      await load(group.id);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const message =
        raw.includes("is not a function")
          ? t("restartAppWindow")
          : raw || t("couldNotCreateGroup");
      setCreateGroupError(message);
      setError(message);
    }
  }

  async function removeGroup(group: BotGroup) {
    if (!confirm(t("deleteGroupConfirm", { name: group.name }))) return;
    try {
      await window.cursorBots.deleteGroup(group.id);
      setGroups((current) => current.filter((item) => item.id !== group.id));
      if (selectedId === group.id) setSelectedId(TEAM_SCOPE);
      if (editingGroupId === group.id) setEditingGroupId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotDelete"));
    }
  }

  async function removeBot(bot: Bot) {
    if (!confirm(t("deleteBotConfirm", { name: bot.name }))) return;
    try {
      await window.cursorBots.deleteBot(bot.id);
      togglePinnedId(bot.id, false);
      setBots((current) => current.filter((item) => item.id !== bot.id));
      if (selectedId === bot.id) setSelectedId(TEAM_SCOPE);
      if (editingBotId === bot.id) setEditingBotId(null);
      await load(selectedId === bot.id ? TEAM_SCOPE : selectedId ?? TEAM_SCOPE);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotDelete"));
    }
  }

  function staleApi(err?: unknown): boolean {
    const raw = err instanceof Error ? err.message : "";
    return raw.includes("is not a function");
  }

  function applyUpdateResult(result: UpdateCheckResult) {
    setAvailableUpdate(result.available ? result : null);
  }

  function openUpdate(url?: string) {
    void window.cursorBots.openExternal(url || LATEST_RELEASE_PAGE);
  }

  function selectChat(id: string) {
    setEditingBotId(null);
    setEditingGroupId(null);
    setSelectedId(id);
  }

  function editBot(bot: Bot) {
    setSelectedId(bot.id);
    setEditingGroupId(null);
    setEditingBotId(bot.id);
  }

  function editGroup(group: BotGroup) {
    setSelectedId(group.id);
    setEditingBotId(null);
    setEditingGroupId(group.id);
  }

  async function copyAgentLink(bot: Bot) {
    if (!bot.agentId) return;
    try {
      await navigator.clipboard.writeText(`https://cursor.com/agents/${bot.agentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    }
  }

  async function openAgent(bot: Bot) {
    if (!bot.agentId) return;
    if (typeof window.cursorBots.openAgent !== "function") {
      setError(t("restartAppWindow"));
      return;
    }
    try {
      await window.cursorBots.openAgent(bot.id);
    } catch (err) {
      setError(
        staleApi(err)
          ? t("restartAppWindow")
          : err instanceof Error
            ? err.message
            : t("couldNotOpenAgent"),
      );
    }
  }

  async function pinBot(bot: Bot) {
    const pinned = !bot.pinned;
    togglePinnedId(bot.id, pinned);
    setBots((current) =>
      sortBots(
        current.map((item) =>
          item.id === bot.id
            ? { ...item, pinned, pinnedAt: pinned ? new Date().toISOString() : undefined }
            : item,
        ),
      ),
    );
    try {
      if (window.cursorBots.pinBot) {
        await window.cursorBots.pinBot(bot.id, pinned);
      }
    } catch {
      // Local pin still holds until main/preload is restarted.
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    const groupId = selectedGroup?.id;
    const botId = !isTeam && !isGroup ? selected?.id : undefined;
    setDraft("");
    setError(null);
    setTools([]);
    setRelay(null);
    try {
      await window.cursorBots.sendMessage({ text, botId, groupId });
    } catch (err) {
      const send = window.cursorBots.sendMessage as (
        a: unknown,
        b?: unknown,
      ) => Promise<unknown>;
      try {
        if (botId) await send(botId, text);
        else throw err;
      } catch (retryErr) {
        setDraft(text);
        setError(retryErr instanceof Error ? retryErr.message : t("couldNotSend"));
      }
    }
  }

  async function saveKey() {
    const settings = await window.cursorBots.saveApiKey(apiKeyDraft);
    setHasApiKey(settings.hasApiKey);
    setSecrets(settings.secrets ?? []);
    setApiKeyDraft("");
    if (settings.hasApiKey) {
      try {
        setModels(await window.cursorBots.listModels());
      } catch {
        setError(t("keySavedModelsFailed"));
      }
    }
  }

  const groupThinking = selectedGroup
    ? thinkingIds.filter((id) => selectedGroup.botIds.includes(id))
    : [];
  const headerStatus = isTeam
    ? thinkingIds.length > 0
      ? `${t("thinkingCount", { n: thinkingIds.length })}${relay ? ` · ${relay}` : ""}`
      : t("startSomeone")
    : isGroup
      ? groupThinking.length > 0
        ? `${t("thinkingCount", { n: groupThinking.length })}${relay ? ` · ${relay}` : ""}`
        : t("groupMembers", { n: selectedGroup?.botIds.length ?? 0 })
      : thinkingIds.includes(selected?.id ?? "")
        ? statusByBot[selected?.id ?? ""] || relay || t("thinking")
        : selected?.role || selected?.model || "";

  if (loading) {
    return (
      <div className="grid h-full place-items-center bg-surface text-mute">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-surface text-ink">
      <Sidebar
        bots={bots}
        groups={groups}
        team={bus}
        selectedId={selectedId}
        thinkingIds={thinkingIds}
        filter={filter}
        onFilter={setFilter}
        onSelect={selectChat}
        onCreate={() => {
          setCreateError(null);
          setCreating(true);
        }}
        onCreateGroup={() => {
          setCreateGroupError(
            typeof window.cursorBots.createGroup !== "function"
              ? t("restartAppWindow")
              : null,
          );
          setCreatingGroup(true);
        }}
        onPin={(bot) => void pinBot(bot)}
        onEdit={editBot}
        onOpenAgent={(bot) => void openAgent(bot)}
        onCopyAgentLink={(bot) => void copyAgentLink(bot)}
        onDelete={(bot) => void removeBot(bot)}
        onEditGroup={editGroup}
        onDeleteGroup={(group) => void removeGroup(group)}
        onSettings={() => {
          setSettingsOpen(true);
          void window.cursorBots.getSettings().then((settings) => {
            setHasApiKey(settings.hasApiKey);
            setSecrets(settings.secrets ?? []);
            setAppVersion(settings.appVersion);
          });
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-surface">
        <div className="app-drag h-11 shrink-0" />
        {availableUpdate && (
          <div className="flex items-center justify-between gap-3 bg-accent/15 px-5 py-2.5">
            <p className="min-w-0 text-[13px] text-ink">
              {t("updateAvailable", { version: availableUpdate.version })}
            </p>
            <button
              type="button"
              onClick={() => openUpdate(availableUpdate.url)}
              className="app-no-drag shrink-0 rounded-full bg-accent px-3 py-1.5 text-[13px] font-medium text-white"
            >
              {t("updateTo", { version: availableUpdate.version })}
            </button>
          </div>
        )}
        {hasApiKey === false && (
          <div className="mx-5 mb-2 rounded-2xl bg-wait/10 px-4 py-3 text-[13px] text-wait">
            {t("pasteApiKey")}{" "}
            <button type="button" className="underline" onClick={() => setSettingsOpen(true)}>
              {t("open")}
            </button>
          </div>
        )}

        {bots.length === 0 ? (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div className="fade-up">
              <Sparkles className="mx-auto text-accent" size={36} />
              <p className="mt-5 text-[20px] font-semibold">{t("buildATeam")}</p>
              <p className="mt-2 max-w-sm text-[14px] leading-6 text-mute">
                {t("emptyTeamLead")}
              </p>
              {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              <button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  setCreating(true);
                }}
                className="mt-5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
              >
                {t("createBot")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between gap-4 px-6 pb-3">
              <div className="flex min-w-0 items-center gap-3">
                {isTeam || isGroup ? (
                  <div className="flex -space-x-2">
                    {(isGroup
                      ? bots.filter((bot) => selectedGroup?.botIds.includes(bot.id))
                      : bots
                    )
                      .slice(0, 4)
                      .map((bot) => (
                        <BotFace
                          key={bot.id}
                          bot={bot}
                          mood={thinkingIds.includes(bot.id) ? "thinking" : "idle"}
                          size={34}
                        />
                      ))}
                  </div>
                ) : selected ? (
                  <BotFace
                    bot={selected}
                    mood={thinkingIds.includes(selected.id) ? "thinking" : "idle"}
                    size={40}
                  />
                ) : null}
                <div className="min-w-0">
                  <h1 className="truncate text-[17px] font-semibold tracking-tight">
                    {isTeam ? t("team") : selectedGroup?.name ?? selected?.name}
                  </h1>
                  <p className="truncate text-[12px] text-mute">{headerStatus}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {availableUpdate && (
                  <button
                    type="button"
                    onClick={() => openUpdate(availableUpdate.url)}
                    className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-white"
                  >
                    {t("updateTo", { version: availableUpdate.version })}
                  </button>
                )}
                {selected?.agentId && (
                  <button
                    type="button"
                    onClick={() =>
                      void window.cursorBots.openExternal("https://cursor.com/agents")
                    }
                    className="rounded-full px-3 py-1.5 text-[12px] text-mute hover:text-ink"
                  >
                    Cursor
                  </button>
                )}
                {selected && (
                  <button
                    type="button"
                    onClick={() => void pinBot(selected)}
                    className={`grid size-8 place-items-center rounded-lg hover:bg-white/5 ${
                      selected.pinned ? "text-accent" : "text-faint hover:text-ink"
                    }`}
                    title={selected.pinned ? t("unpin") : t("pin")}
                  >
                    <PinIcon size={15} />
                  </button>
                )}
                {selectedGroup && (
                  <button
                    type="button"
                    onClick={() => void removeGroup(selectedGroup)}
                    className="grid size-8 place-items-center rounded-lg text-faint hover:bg-white/5 hover:text-danger"
                    title={t("delete")}
                  >
                    <TrashIcon />
                  </button>
                )}
                {selected && (
                  <button
                    type="button"
                    onClick={() => void removeBot(selected)}
                    className="grid size-8 place-items-center rounded-lg text-faint hover:bg-white/5 hover:text-danger"
                    title={t("delete")}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            </header>

            {editingBot ? (
              <EditPanel
                bot={editingBot}
                models={models}
                hasApiKey={hasApiKey}
                onOpenAgent={() => void openAgent(editingBot)}
                onCancel={() => setEditingBotId(null)}
                onSaved={(updated) => {
                  setBots((current) =>
                    sortBots(current.map((item) => (item.id === updated.id ? updated : item))),
                  );
                  setEditingBotId(null);
                }}
              />
            ) : editingGroup ? (
              <GroupEditPanel
                group={editingGroup}
                bots={bots}
                onCancel={() => setEditingGroupId(null)}
                onSaved={(updated) => {
                  setGroups((current) =>
                    current.map((item) => (item.id === updated.id ? updated : item)),
                  );
                  setEditingGroupId(null);
                }}
              />
            ) : (
              <>
                <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  <Thread
                    items={items}
                    bots={bots}
                    viewerId={selected && !isTeam && !isGroup ? selected.id : undefined}
                    collapseHandoffs
                    empty={
                      <div className="fade-up mx-auto grid max-w-md place-items-center pt-16 text-center">
                        {isTeam || isGroup ? (
                          <Sparkles className="text-accent" size={40} />
                        ) : selected ? (
                          <BotFace bot={selected} size={88} />
                        ) : null}
                        <p className="mt-5 text-[18px] font-semibold tracking-tight">
                          {isTeam
                            ? t("teamThreadEmpty")
                            : isGroup
                              ? t("groupThreadEmpty")
                              : t("giveJob", { name: selected?.name ?? "" })}
                        </p>
                        <p className="mt-2 text-[14px] leading-6 text-mute">
                          {isTeam
                            ? t("teamEmptyHint")
                            : isGroup
                              ? t("groupEmptyHint")
                              : t("botEmptyHint")}
                        </p>
                      </div>
                    }
                  />
                  {thinkingIds.length > 0 && (tools.length > 0 || relay) && (
                    <div className="mx-auto mt-3 max-w-3xl text-[12px] text-faint">
                      {relay && <p>{relay}</p>}
                      {tools.length > 0 && <p className="mt-1">{tools.join("  ·  ")}</p>}
                    </div>
                  )}
                </div>

                {error && <p className="px-6 pb-2 text-sm text-danger">{error}</p>}

                <div className="px-4 pb-4">
                  <Composer
                    bots={
                      selectedGroup
                        ? bots.filter((bot) => selectedGroup.botIds.includes(bot.id))
                        : bots
                    }
                    draft={draft}
                    placeholder={
                      isTeam
                        ? t("teamPlaceholder")
                        : isGroup
                          ? t("groupPlaceholder", { name: selectedGroup?.name ?? "" })
                          : t("botPlaceholder", { name: selected?.name ?? t("theBot") })
                    }
                    onDraft={setDraft}
                    onSend={() => void sendMessage()}
                  />
                </div>
              </>
            )}
          </>
        )}
      </main>

      {creating && (
        <CreateDialog
          character={newCharacter}
          models={models}
          error={createError}
          onCharacter={setNewCharacter}
          onClose={() => setCreating(false)}
          onCreate={(form) => void createBot(form)}
        />
      )}

      {creatingGroup && (
        <CreateGroupDialog
          bots={bots}
          error={createGroupError}
          onClose={() => setCreatingGroup(false)}
          onCreate={(form) => void createGroup(form)}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          hasApiKey={hasApiKey}
          secrets={secrets}
          apiKeyDraft={apiKeyDraft}
          appVersion={appVersion}
          onApiKeyDraft={setApiKeyDraft}
          onSaveKey={saveKey}
          onSettings={(settings) => {
            setHasApiKey(settings.hasApiKey);
            setSecrets(settings.secrets ?? []);
            setAppVersion(settings.appVersion);
          }}
          onUpdateResult={applyUpdateResult}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
