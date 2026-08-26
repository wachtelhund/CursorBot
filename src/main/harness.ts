import { AgentBusyError, AgentNotFoundError, CursorAgentError, type Run } from "@cursor/sdk";
import type { WebContents } from "electron";
import { publish } from "./bus";
import { threadDigest, type DigestMessage } from "../shared/digest";
import { parseGroupCommands } from "../shared/groups";
import { publicBotText, unmatchedMentions } from "../shared/mentions";
import {
  correctsActive,
  enqueue as enqueueWake,
  takeNext,
  threadKeyOf,
  type QueueEntry,
  type QueueKey,
} from "../shared/queue";
import { resolveWakeMode, sendDelivery, type SendMode } from "../shared/send-mode";
import {
  deliveryPlan,
  emptyWakeNotice,
  hopLimitNotice,
  incomingHopContent,
  outgoingHandoffs,
  offThreadNotice,
  persistPlan,
  unknownNameNotice,
  MAX_HOP,
} from "../shared/route";
import { logGroupId, resolveLogThread } from "../shared/send";
import { parseSpawns, shouldSkipSpawn } from "../shared/spawn";
import {
  addBranches,
  closeTask,
  completeBranch,
  dropBranch,
  openTask,
  relayText,
  shouldRelay,
  type TaskTable,
} from "../shared/tasks";
import { assignmentText, composeWakePrompt, type WakeSource } from "../shared/wake";
import type { Bot, StreamEvent, TeamMessage } from "../shared/types";
import { isUnusableAgent, openBotAgent, releaseBotAgent } from "./cursor";
import { id } from "./ids";
import { getSecretEnv } from "./settings";
import {
  addGroupMembers,
  appendGroupMessage,
  appendMessage,
  appendTeamMessage,
  createBot,
  createGroup,
  findGroupByName,
  getBot,
  getGroup,
  listBots,
  listGroups,
  listRemovedNames,
  listTeam,
  updateBot,
  updateMessage,
} from "./store";

export type Wake = {
  sender?: WebContents;
  botId: string;
  text: string;
  source: WakeSource;
  fromBotId?: string;
  fromName?: string;
  hop: number;
  groupId?: string;
  dm?: boolean;
  originBotId?: string;
  sendMode?: SendMode;
  /** The delegating turn this wake belongs to, for correlation and joins. */
  taskId?: string;
};

const waiting = new Map<string, QueueEntry<Wake>[]>();
const active = new Map<string, { key: QueueKey; text: string }>();
const busy = new Set<string>();
const activeRuns = new Map<string, Run>();
const turnGen = new Map<string, number>();
const tasks: TaskTable = new Map();

function emit(_sender: WebContents | undefined, event: StreamEvent) {
  publish(event);
}

function queuedCount(botId: string): number {
  return (waiting.get(botId)?.length ?? 0) + (busy.has(botId) ? 1 : 0);
}

async function pump(botId: string): Promise<void> {
  if (busy.has(botId)) return;
  const list = waiting.get(botId);
  if (!list?.length) {
    waiting.delete(botId);
    return;
  }
  const { entry, list: rest } = takeNext(list);
  if (rest.length === 0) waiting.delete(botId);
  else waiting.set(botId, rest);
  if (!entry) return;

  busy.add(botId);
  active.set(botId, { key: entry.key, text: entry.text });
  try {
    await runTurn({ ...entry.payload, text: entry.text, sendMode: entry.mode });
  } finally {
    busy.delete(botId);
    active.delete(botId);
    await pump(botId);
  }
}

function bumpTurn(botId: string): number {
  const next = (turnGen.get(botId) ?? 0) + 1;
  turnGen.set(botId, next);
  return next;
}

function isSuperseded(botId: string, gen: number): boolean {
  return (turnGen.get(botId) ?? 0) !== gen;
}

async function cancelActiveRun(botId: string): Promise<void> {
  const run = activeRuns.get(botId);
  if (!run?.supports("cancel")) return;
  try {
    await run.cancel();
  } catch {
    // Run may already be terminal.
  }
}

function queueKeyOf(wake: Wake): QueueKey {
  return {
    botId: wake.botId,
    threadKey: threadKeyOf(wake),
    source: wake.source,
    fromBotId: wake.fromBotId,
    taskId: wake.taskId,
  };
}

async function rosterOf() {
  return (await listBots()).map((bot) => ({
    id: bot.id,
    name: bot.name,
    role: bot.role,
  }));
}

export async function postTeam(
  sender: WebContents | undefined,
  message: Omit<TeamMessage, "id" | "createdAt">,
): Promise<void> {
  const saved = await appendTeamMessage(message);
  emit(sender, { type: "team", message: saved });
}

export async function postGroup(
  sender: WebContents | undefined,
  groupId: string,
  message: Omit<TeamMessage, "id" | "createdAt">,
): Promise<void> {
  const saved = await appendGroupMessage(groupId, message);
  if (!saved) return;
  emit(sender, { type: "group-message", groupId, message: saved });
}

export async function postLog(
  sender: WebContents | undefined,
  groupId: string | undefined,
  message: Omit<TeamMessage, "id" | "createdAt">,
): Promise<void> {
  if (groupId) {
    await postGroup(sender, groupId, message);
    return;
  }
  await postTeam(sender, message);
}

/**
 * A wake that does not happen is invisible from the thread. Say so where the
 * work was expected, instead of leaving the human to guess.
 */
export async function postNotice(
  sender: WebContents | undefined,
  where: { dm?: boolean; groupId?: string; botId: string },
  content: string,
): Promise<void> {
  if (!content.trim()) return;
  if (where.dm) {
    const saved = await appendMessage(where.botId, {
      role: "assistant",
      content,
      source: "notice",
    });
    if (saved) emit(sender, { type: "append", botId: where.botId, message: saved });
    return;
  }
  await postLog(sender, where.groupId, {
    from: "bot",
    name: "",
    content,
    source: "notice",
  });
}

export function latestActiveId(bots: { id: string; updatedAt: string }[]): string | undefined {
  return [...bots].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]?.id;
}

function emitQueued(sender: WebContents | undefined, botId: string): void {
  emit(sender, { type: "thinking", botId, thinking: true });
  emit(sender, {
    type: "status",
    botId,
    status: "queued",
    message: "Waiting for the previous run",
  });
}

export function wake(input: Wake): void {
  const text = input.text.trim();
  const botId = input.botId;
  if (!text) {
    void (async () => {
      const target = await getBot(botId);
      await postNotice(input.sender, input, emptyWakeNotice(target?.name ?? "the bot"));
    })().catch(() => {
      // The bus is best-effort here; the wake was already a no-op.
    });
    return;
  }

  const key = queueKeyOf(input);
  const running = active.get(botId);
  if (running && running.text === text && sameKey(running.key, key)) return;

  /** An interrupt is explicit (`⌘Enter`, `@Name!:`) or a correction to the run in progress. */
  const mode = resolveWakeMode({
    requested: input.sendMode,
    corrects: correctsActive(running?.key, key),
  });
  const pending = waiting.get(botId) ?? [];
  const wasWaiting = pending.length > 0 || busy.has(botId);
  const { list, action, replaced } = enqueueWake(pending, {
    key,
    mode,
    text,
    payload: { ...input, text, sendMode: mode },
  });
  if (action === "duplicate") return;
  // The folded-in wake never runs under its own task: release its branch.
  if (replaced?.key.taskId && replaced.key.taskId !== key.taskId) {
    dropBranch(tasks, replaced.key.taskId);
  }
  waiting.set(botId, list);

  if (mode === "steer") {
    bumpTurn(botId);
    void cancelActiveRun(botId);
    if (wasWaiting) {
      emit(input.sender, { type: "thinking", botId, thinking: true });
      emit(input.sender, {
        type: "status",
        botId,
        status: "starting",
        message: "Steering…",
      });
    }
  } else if (wasWaiting && action === "queued") {
    emitQueued(input.sender, botId);
  }

  void pump(botId);
}

function sameKey(a: QueueKey, b: QueueKey): boolean {
  return (
    a.botId === b.botId &&
    a.threadKey === b.threadKey &&
    a.source === b.source &&
    (a.taskId ?? "") === (b.taskId ?? "")
  );
}

export function wakeMany(
  sender: WebContents | undefined,
  botIds: string[],
  text: string,
  source: WakeSource = "user",
  groupId?: string,
  dm?: boolean,
  sendMode: SendMode = "queue",
  taskId?: string,
): void {
  for (const botId of botIds) {
    wake({
      sender,
      botId,
      text,
      source,
      hop: 0,
      groupId,
      dm,
      originBotId: botId,
      sendMode,
      taskId,
    });
  }
}

/** Opened by the sender so the human turn is one task with one branch per bot. */
export function openUserTask(input: {
  taskId: string;
  request: string;
  branches: number;
}): void {
  openTask(tasks, { taskId: input.taskId, request: input.request });
  addBranches(tasks, input.taskId, input.branches);
}

export async function applySpawns(
  sender: WebContents | undefined,
  parent: Bot,
  text: string,
  speaker?: { id?: string; name: string } | null,
): Promise<void> {
  const who = speaker === undefined ? parent : speaker;
  const fromName = who?.name ?? "You";
  const wanted = parseSpawns(text, who?.name ? [who.name] : []);
  if (wanted.length === 0) return;

  const existing = await listBots();
  const removed = await listRemovedNames();

  for (const spawn of wanted) {
    if (shouldSkipSpawn(spawn, removed)) continue;
    const current = existing.find(
      (bot) => bot.name.toLowerCase() === spawn.name.toLowerCase(),
    );
    if (current) {
      if (spawn.agentId && current.agentId !== spawn.agentId) {
        const updated = await updateBot(current.id, { agentId: spawn.agentId });
        if (updated) {
          current.agentId = updated.agentId;
          emit(sender, { type: "bot", bot: updated });
        }
      }
      continue;
    }

    try {
      const bot = await createBot({
        name: spawn.name,
        role: spawn.role,
        model: parent.model,
        agentId: spawn.agentId,
      });
      existing.push(bot);
      emit(sender, { type: "bot", bot });
      await postTeam(sender, {
        from: who ? "bot" : "user",
        botId: who?.id,
        name: fromName,
        content: `${fromName} created ${bot.name}`,
        source: "system",
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not create the bot";
      await postTeam(sender, {
        from: who ? "bot" : "user",
        botId: who?.id,
        name: fromName,
        content: `${fromName} could not create ${spawn.name}: ${detail}`,
        source: "system",
      });
      emit(sender, { type: "error", botId: parent.id, message: detail });
    }
  }
}

function resolveMemberIds(names: string[], bots: Bot[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const bot = bots.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!bot || seen.has(bot.id)) continue;
    seen.add(bot.id);
    ids.push(bot.id);
  }
  return ids;
}

export async function applyGroupCommands(
  sender: WebContents | undefined,
  speaker: { id: string; name: string } | null,
  text: string,
): Promise<string | undefined> {
  const commands = parseGroupCommands(text);
  if (commands.length === 0) return undefined;

  const bots = await listBots();
  let destId: string | undefined;

  const note = async (content: string) => {
    await postTeam(sender, {
      from: speaker ? "bot" : "user",
      botId: speaker?.id,
      name: speaker?.name ?? "You",
      content,
      source: "system",
    });
  };

  for (const command of commands) {
    if (command.kind === "target") {
      const group = await findGroupByName(command.name);
      if (group) destId = group.id;
      continue;
    }

    const memberIds = resolveMemberIds(command.members, bots);
    if (command.kind === "create" && speaker && !memberIds.includes(speaker.id)) {
      memberIds.push(speaker.id);
    }

    if (command.kind === "create") {
      if (memberIds.length === 0) {
        await note(`No bot matched in ${command.name}`);
        continue;
      }
      try {
        const group = await createGroup({ name: command.name, botIds: memberIds });
        emit(sender, { type: "group", group });
        const created = `${speaker?.name ?? "You"} created ${group.name}`;
        await note(created);
        await postGroup(sender, group.id, {
          from: speaker ? "bot" : "user",
          botId: speaker?.id,
          name: speaker?.name ?? "You",
          content: created,
          source: "system",
        });
      } catch (error) {
        if (await findGroupByName(command.name)) continue;
        const detail = error instanceof Error ? error.message : "The group already exists";
        await note(`${command.name}: ${detail}`);
      }
      continue;
    }

    const group = await findGroupByName(command.name);
    if (!group) {
      await note(`Group ${command.name} does not exist`);
      continue;
    }
    if (memberIds.length === 0) continue;
    const updated = await addGroupMembers(group.id, memberIds);
    if (updated) {
      emit(sender, { type: "group", group: updated });
      const added = `${speaker?.name ?? "You"} added ${command.members.join(", ")} to ${updated.name}`;
      await note(added);
      await postGroup(sender, updated.id, {
        from: speaker ? "bot" : "user",
        botId: speaker?.id,
        name: speaker?.name ?? "You",
        content: added,
        source: "system",
      });
    }
  }

  return destId;
}

async function postOriginResult(
  sender: WebContents | undefined,
  thread: ReturnType<typeof resolveLogThread>,
  originBotId: string | undefined,
  input: { botId: string; name: string; content: string },
): Promise<void> {
  if (thread.kind === "dm") {
    if (!originBotId) return;
    const saved = await appendMessage(originBotId, {
      role: "assistant",
      content: input.content,
      source: "bot",
      fromBotId: input.botId,
      fromName: input.name,
    });
    if (saved) emit(sender, { type: "append", botId: originBotId, message: saved });
    return;
  }
  await postLog(sender, logGroupId(thread), {
    from: "bot",
    botId: input.botId,
    name: input.name,
    content: input.content,
  });
}

async function groupRoster(groupId: string) {
  const group = await getGroup(groupId);
  if (!group) return [];
  const bots = await listBots();
  return bots
    .filter((bot) => group.botIds.includes(bot.id))
    .map((bot) => ({ id: bot.id, name: bot.name, role: bot.role }));
}

async function groupsForPrompt() {
  const groups = await listGroups();
  const bots = await listBots();
  return groups.map((group) => ({
    name: group.name,
    members: group.botIds
      .map((id) => bots.find((bot) => bot.id === id)?.name)
      .filter((name): name is string => Boolean(name)),
  }));
}

/** Bots cannot read the app's threads, so every wake carries a clipped view. */
async function digestFor(
  job: Wake,
  bot: Bot,
  roster: { id: string; name: string }[],
): Promise<string> {
  const messages: DigestMessage[] = [];
  if (job.dm) {
    for (const message of bot.messages) {
      messages.push({
        name: message.role === "user" ? "You" : (message.fromName ?? bot.name),
        content: message.content,
        from: message.role === "user" ? "user" : "bot",
        source: message.source,
        toBotIds: message.toBotIds,
      });
    }
  } else {
    const log = job.groupId
      ? ((await getGroup(job.groupId))?.messages ?? [])
      : await listTeam();
    for (const message of log) {
      messages.push({
        name: message.name,
        content: message.content,
        from: message.from,
        source: message.source,
        toBotIds: message.toBotIds,
      });
    }
  }
  return threadDigest(messages, { roster, exclude: job.text });
}

function busyNamesFor(botId: string, roster: { id: string; name: string }[]): string[] {
  return [...busy]
    .filter((other) => other !== botId)
    .map((other) => roster.find((mate) => mate.id === other)?.name)
    .filter((name): name is string => Boolean(name));
}

async function runTurn(job: Wake): Promise<void> {
  const { sender, botId, text, hop, fromBotId, fromName, source } = job;
  const gen = turnGen.get(botId) ?? 0;
  let run: Run | undefined;
  const bot = await getBot(botId);
  if (!bot) throw new Error("Bot does not exist");

  await applySpawns(
    sender,
    bot,
    text,
    source === "user" ? null : { id: fromBotId, name: fromName ?? "Bot" },
  );

  const persist = persistPlan({ source, dm: job.dm });
  const isFirst = !bot.agentId && bot.messages.filter((message) => message.role === "user").length === 0;

  let assistantId: string | undefined;
  if (persist.incomingHop) {
    const incoming = await appendMessage(botId, {
      role: "assistant",
      content: incomingHopContent(bot.name, text),
      source: "handoff",
      fromBotId,
      fromName,
      toBotIds: fromBotId ? [fromBotId] : undefined,
    });
    if (incoming) emit(sender, { type: "append", botId, message: incoming });
  }

  if (persist.assistant) {
    if (persist.userMessage) {
      const userMessage = await appendMessage(botId, {
        role: "user",
        content: text,
        source: "user",
        fromBotId,
        fromName,
      });
      if (userMessage) emit(sender, { type: "append", botId, message: userMessage });
    }

    assistantId = id("msg");
    const assistantMessage = await appendMessage(botId, {
      id: assistantId,
      role: "assistant",
      content: "",
      source: persist.assistantSource,
      fromBotId: botId,
      fromName: bot.name,
      toBotIds: persist.incomingHop && fromBotId ? [fromBotId] : undefined,
    });
    if (assistantMessage) emit(sender, { type: "append", botId, message: assistantMessage });
  }

  emit(sender, { type: "thinking", botId, thinking: true });
  emit(sender, {
    type: "status",
    botId,
    status: "starting",
    message: "Starting agent…",
  });

  try {
    if (isSuperseded(botId, gen)) return;
    let latest = (await getBot(botId)) ?? bot;
    const teammates = await rosterOf();
    const groups = await groupsForPrompt();
    const digest = await digestFor(job, bot, teammates);
    let agent = await openBotAgent(latest);
    if (agent.agentId !== latest.agentId) {
      await updateBot(botId, { agentId: agent.agentId });
    }
    emit(sender, { type: "agent", botId, agentId: agent.agentId });

    const envVars = await getSecretEnv();
    const prompt = composeWakePrompt({
      botName: latest.name,
      role: latest.role,
      isFirst,
      secretNames: Object.keys(envVars).sort(),
      teammates,
      groups,
      source,
      fromName,
      hop,
      text,
      digest,
      busyNames: busyNamesFor(botId, teammates),
      taskRequest: job.taskId ? tasks.get(job.taskId)?.request : undefined,
    });
    const cloud = Object.keys(envVars).length > 0 ? { cloud: { envVars } } : undefined;
    const steer = sendDelivery(job.sendMode ?? "queue").cancelActive;
    if (isSuperseded(botId, gen)) return;
    try {
      run = await agent.send(prompt, cloud);
    } catch (error) {
      if (error instanceof AgentBusyError && steer) {
        await cancelActiveRun(botId);
        run = await agent.send(prompt, cloud);
      } else if (!isUnusableAgent(error) || !latest.agentId) {
        throw error;
      } else {
        await releaseBotAgent(botId);
        await updateBot(botId, { agentId: "" });
        latest = { ...latest, agentId: undefined };
        agent = await openBotAgent(latest);
        await updateBot(botId, { agentId: agent.agentId });
        emit(sender, { type: "agent", botId, agentId: agent.agentId });
        run = await agent.send(prompt, cloud);
      }
    }
    if (!run) throw new Error("Something went wrong");
    activeRuns.set(botId, run);
    if (isSuperseded(botId, gen) && run.supports("cancel")) {
      await run.cancel();
    }

    let assistantText = "";
    for await (const streamEvent of run.stream()) {
      if (streamEvent.type === "assistant") {
        for (const block of streamEvent.message.content) {
          if (block.type === "text" && block.text) {
            assistantText += block.text;
            emit(sender, { type: "text", botId, text: block.text });
          }
        }
      } else if (streamEvent.type === "tool_call") {
        emit(sender, {
          type: "tool",
          botId,
          name: streamEvent.name,
          status: streamEvent.status,
        });
      } else if (streamEvent.type === "status") {
        emit(sender, {
          type: "status",
          botId,
          status: streamEvent.status,
          message: streamEvent.message,
        });
      }
    }

    const result = await run.wait();
    const finalText = result.result || assistantText;
    const publicText = publicBotText(finalText);
    if (assistantId) {
      // Keep the full reply in the DM store. Hops stay source:handoff (inspect).
      // The user-thread copy is a separate public write below.
      await updateMessage(botId, assistantId, {
        content: finalText,
        runId: result.id,
      });
    }

    if (result.status === "cancelled") {
      if (job.taskId) dropBranch(tasks, job.taskId);
      emit(sender, {
        type: "done",
        botId,
        result: persist.assistant ? finalText : publicText,
        runId: result.id,
        status: result.status,
      });
      return;
    }

    if (result.status === "error") {
      const message = result.error?.message || "The run failed";
      emit(sender, { type: "error", botId, message });
      throw new Error(message);
    }

    await applySpawns(sender, latest, finalText);
    const targeted = await applyGroupCommands(sender, latest, finalText);
    const userThread = resolveLogThread({
      dm: job.dm,
      groupId: job.groupId,
      targetGroupId: source === "user" ? targeted : undefined,
    });
    const busThread = resolveLogThread({
      dm: job.dm,
      groupId: job.groupId,
      targetGroupId: targeted,
    });
    const threadId = logGroupId(busThread);
    const originBotId = job.originBotId ?? fromBotId;
    const where = { dm: job.dm, groupId: threadId, botId };

    /** Settle this bot's branch of the turn that woke it, so a fan-out can join. */
    const settled = job.taskId
      ? completeBranch(tasks, job.taskId, { name: latest.name, text: publicText })
      : { task: undefined, done: true };
    // A task pruned or already closed behaves like a single branch: deliver now.
    const parent = { task: settled.task, done: settled.task ? settled.done : true };

    const plan = deliveryPlan({
      source,
      publicText,
      originBotId,
      botId,
      hop,
      userThread,
      busThread,
      branches: parent.task?.branches ?? 1,
      joinDone: parent.done,
    });

    if (plan.postPublic) {
      await postOriginResult(sender, userThread, originBotId, {
        botId,
        name: latest.name,
        content: publicText,
      });
    } else if (plan.postHop) {
      await postLog(sender, threadId, {
        from: "bot",
        botId,
        name: latest.name,
        content: publicText,
        toBotIds: originBotId ? [originBotId] : undefined,
        source: "handoff",
        fromBotId: botId,
        taskId: job.taskId,
      });
    }

    emit(sender, {
      type: "done",
      botId,
      result: persist.assistant ? finalText : publicText,
      runId: result.id,
      status: result.status,
    });

    if (plan.relay && originBotId && (!parent.task || shouldRelay(parent.task))) {
      const joined = parent.task ? relayText(parent.task) || publicText : publicText;
      const several = (parent.task?.results.length ?? 1) > 1;
      if (parent.task) closeTask(tasks, parent.task.taskId);
      wake({
        sender,
        botId: originBotId,
        text: joined,
        source: "result",
        fromBotId: botId,
        fromName: several ? undefined : latest.name,
        hop: hop + 1,
        groupId: job.groupId,
        dm: job.dm,
        originBotId,
      });
      return;
    }
    if (parent.task && parent.done) closeTask(tasks, parent.task.taskId);

    if (source === "result" || source === "question") return;

    const roster = threadId ? await groupRoster(threadId) : await rosterOf();
    const handoffs = outgoingHandoffs(finalText, roster, {
      selfId: botId,
      skipIds: [fromBotId, originBotId],
    });

    const everyone = threadId ? await rosterOf() : roster;
    const unknown = unmatchedMentions(finalText, everyone);
    if (unknown.length > 0) {
      await postNotice(sender, where, unknownNameNotice(unknown));
    }
    if (threadId) {
      const offThread = unmatchedMentions(finalText, roster).filter(
        (name) => !unknown.includes(name),
      );
      if (offThread.length > 0) {
        const group = await getGroup(threadId);
        await postNotice(sender, where, offThreadNotice(offThread, group?.name));
      }
    }
    if (handoffs.length === 0) return;
    if (!plan.continueHandoffs) {
      if (hop >= MAX_HOP) {
        await postNotice(
          sender,
          where,
          hopLimitNotice(handoffs.map((handoff) => handoff.name)),
        );
      }
      return;
    }

    const asks = handoffs.filter(
      (handoff) => handoff.kind === "question" && handoff.body.trim(),
    );
    const jobs = handoffs.filter((handoff) => !asks.includes(handoff));

    let assignTaskId: string | undefined;
    if (jobs.length > 0) {
      assignTaskId = id("task");
      openTask(tasks, {
        taskId: assignTaskId,
        kind: "assign",
        request: text,
        originBotId: botId,
        originName: latest.name,
      });
      addBranches(tasks, assignTaskId, jobs.length);
    }

    for (const handoff of handoffs) {
      const asking = asks.includes(handoff);
      let taskId = assignTaskId;
      if (asking) {
        taskId = id("task");
        openTask(tasks, {
          taskId,
          kind: "question",
          request: handoff.body,
          originBotId: botId,
          originName: latest.name,
        });
        addBranches(tasks, taskId, 1);
      }

      emit(sender, {
        type: "relay",
        fromName: latest.name,
        toBotId: handoff.botId,
        toName: handoff.name,
      });
      const assigned = asking
        ? handoff.body
        : assignmentText(latest.name, handoff.body, finalText);
      const marker = asking ? "?" : "";
      const teamLine = handoff.body.trim()
        ? `@${handoff.name}${marker}: ${handoff.body.trim()}`
        : `@${handoff.name}`;
      if (plan.logAssignments) {
        await postLog(sender, threadId, {
          from: "bot",
          botId,
          name: latest.name,
          content: teamLine,
          toBotIds: [handoff.botId],
          source: "handoff",
          fromBotId: botId,
          taskId,
        });
      }
      wake({
        sender,
        botId: handoff.botId,
        text: assigned,
        source: asking ? "question" : "handoff",
        fromBotId: botId,
        fromName: latest.name,
        hop: hop + 1,
        groupId: threadId,
        dm: job.dm,
        originBotId: botId,
        sendMode: handoff.mode,
        taskId,
      });
    }
  } catch (error) {
    if (job.taskId) dropBranch(tasks, job.taskId);
    if (error instanceof AgentNotFoundError) {
      await releaseBotAgent(botId);
    }
    const message =
      error instanceof AgentBusyError
        ? "Waiting for the previous run"
        : error instanceof CursorAgentError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Something went wrong";
    if (assistantId) {
      await updateMessage(botId, assistantId, { content: message });
    }
    emit(sender, { type: "error", botId, message });
  } finally {
    if (run && activeRuns.get(botId) === run) activeRuns.delete(botId);
    if (queuedCount(botId) > 1) {
      emitQueued(sender, botId);
    } else {
      emit(sender, { type: "thinking", botId, thinking: false });
    }
  }
}
