import { AgentBusyError, AgentNotFoundError, CursorAgentError } from "@cursor/sdk";
import type { WebContents } from "electron";
import { parseGroupCommands } from "../shared/groups";
import { publicBotText } from "../shared/mentions";
import {
  deliveryPlan,
  incomingHopContent,
  outgoingHandoffs,
  persistPlan,
} from "../shared/route";
import { logGroupId, resolveLogThread } from "../shared/send";
import { parseSpawns, shouldSkipSpawn } from "../shared/spawn";
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
  updateBot,
  updateMessage,
} from "./store";

export type Wake = {
  sender: WebContents;
  botId: string;
  text: string;
  source: WakeSource;
  fromBotId?: string;
  fromName?: string;
  hop: number;
  groupId?: string;
  dm?: boolean;
  originBotId?: string;
};

const tails = new Map<string, Promise<unknown>>();
const inflight = new Set<string>();
const pending = new Map<string, number>();

function emit(sender: WebContents, event: StreamEvent) {
  if (sender.isDestroyed()) return;
  sender.send("bots:event", event);
}

function queuedCount(botId: string): number {
  return pending.get(botId) ?? 0;
}

function enqueue(botId: string, task: () => Promise<void>): void {
  pending.set(botId, queuedCount(botId) + 1);
  const prev = tails.get(botId) ?? Promise.resolve();
  const next = prev.then(task, task);
  tails.set(
    botId,
    next.then(
      () => {
        const left = queuedCount(botId) - 1;
        if (left <= 0) pending.delete(botId);
        else pending.set(botId, left);
      },
      () => {
        const left = queuedCount(botId) - 1;
        if (left <= 0) pending.delete(botId);
        else pending.set(botId, left);
      },
    ),
  );
}

function coalesceKey(wake: Wake): string {
  return `${wake.botId}:${wake.groupId ?? ""}:${wake.source}:${wake.text.trim().slice(0, 240)}`;
}

async function rosterOf() {
  return (await listBots()).map((bot) => ({
    id: bot.id,
    name: bot.name,
    role: bot.role,
  }));
}

export async function postTeam(
  sender: WebContents,
  message: Omit<TeamMessage, "id" | "createdAt">,
): Promise<void> {
  const saved = await appendTeamMessage(message);
  emit(sender, { type: "team", message: saved });
}

export async function postGroup(
  sender: WebContents,
  groupId: string,
  message: Omit<TeamMessage, "id" | "createdAt">,
): Promise<void> {
  const saved = await appendGroupMessage(groupId, message);
  if (!saved) return;
  emit(sender, { type: "group-message", groupId, message: saved });
}

export async function postLog(
  sender: WebContents,
  groupId: string | undefined,
  message: Omit<TeamMessage, "id" | "createdAt">,
): Promise<void> {
  if (groupId) {
    await postGroup(sender, groupId, message);
    return;
  }
  await postTeam(sender, message);
}

export function latestActiveId(bots: { id: string; updatedAt: string }[]): string | undefined {
  return [...bots].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]?.id;
}

function emitQueued(sender: WebContents, botId: string): void {
  emit(sender, { type: "thinking", botId, thinking: true });
  emit(sender, {
    type: "status",
    botId,
    status: "queued",
    message: "Väntar på förra körningen",
  });
}

export function wake(input: Wake): void {
  const text = input.text.trim();
  if (!text) return;
  const key = coalesceKey({ ...input, text });
  if (inflight.has(key)) return;
  inflight.add(key);
  if (queuedCount(input.botId) > 0) {
    emitQueued(input.sender, input.botId);
  }
  enqueue(input.botId, async () => {
    try {
      await runTurn({ ...input, text });
    } finally {
      inflight.delete(key);
    }
  });
}

export function wakeMany(
  sender: WebContents,
  botIds: string[],
  text: string,
  source: WakeSource = "user",
  groupId?: string,
  dm?: boolean,
): void {
  for (const botId of botIds) {
    wake({ sender, botId, text, source, hop: 0, groupId, dm, originBotId: botId });
  }
}

export async function applySpawns(
  sender: WebContents,
  parent: Bot,
  text: string,
  speaker?: { id?: string; name: string } | null,
): Promise<void> {
  const who = speaker === undefined ? parent : speaker;
  const fromName = who?.name ?? "Du";
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
        content: `${fromName} skapade ${bot.name}`,
        source: "system",
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Kunde inte skapa botten";
      await postTeam(sender, {
        from: who ? "bot" : "user",
        botId: who?.id,
        name: fromName,
        content: `${fromName} kunde inte skapa ${spawn.name}: ${detail}`,
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
  sender: WebContents,
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
      name: speaker?.name ?? "Du",
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
        await note(`Ingen i ${command.name} matchade en bot`);
        continue;
      }
      try {
        const group = await createGroup({ name: command.name, botIds: memberIds });
        emit(sender, { type: "group", group });
        const created = `${speaker?.name ?? "Du"} skapade ${group.name}`;
        await note(created);
        await postGroup(sender, group.id, {
          from: speaker ? "bot" : "user",
          botId: speaker?.id,
          name: speaker?.name ?? "Du",
          content: created,
          source: "system",
        });
      } catch (error) {
        if (await findGroupByName(command.name)) continue;
        const detail = error instanceof Error ? error.message : "Gruppen finns redan";
        await note(`${command.name}: ${detail}`);
      }
      continue;
    }

    const group = await findGroupByName(command.name);
    if (!group) {
      await note(`Gruppen ${command.name} finns inte`);
      continue;
    }
    if (memberIds.length === 0) continue;
    const updated = await addGroupMembers(group.id, memberIds);
    if (updated) {
      emit(sender, { type: "group", group: updated });
      const added = `${speaker?.name ?? "Du"} la till ${command.members.join(", ")} i ${updated.name}`;
      await note(added);
      await postGroup(sender, updated.id, {
        from: speaker ? "bot" : "user",
        botId: speaker?.id,
        name: speaker?.name ?? "Du",
        content: added,
        source: "system",
      });
    }
  }

  return destId;
}

async function postOriginResult(
  sender: WebContents,
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

async function runTurn(job: Wake): Promise<void> {
  const { sender, botId, text, hop, fromBotId, fromName, source } = job;
  const bot = await getBot(botId);
  if (!bot) throw new Error("Botten finns inte");

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
    message: "Startar agent…",
  });

  try {
    let latest = (await getBot(botId)) ?? bot;
    const teammates = await rosterOf();
    const groups = await groupsForPrompt();
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
    });
    const cloud = Object.keys(envVars).length > 0 ? { cloud: { envVars } } : undefined;
    let run;
    try {
      run = await agent.send(prompt, cloud);
    } catch (error) {
      if (!isUnusableAgent(error) || !latest.agentId) throw error;
      await releaseBotAgent(botId);
      await updateBot(botId, { agentId: "" });
      latest = { ...latest, agentId: undefined };
      agent = await openBotAgent(latest);
      await updateBot(botId, { agentId: agent.agentId });
      emit(sender, { type: "agent", botId, agentId: agent.agentId });
      run = await agent.send(prompt, cloud);
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

    if (result.status === "error") {
      const message = result.error?.message || "Körningen misslyckades";
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
    const plan = deliveryPlan({
      source,
      publicText,
      originBotId,
      botId,
      hop,
      userThread,
      busThread,
    });

    if (plan.postPublic) {
      await postOriginResult(sender, userThread, originBotId, {
        botId,
        name: latest.name,
        content: publicText,
      });
    }

    emit(sender, {
      type: "done",
      botId,
      result: persist.assistant ? finalText : publicText,
      runId: result.id,
      status: result.status,
    });

    if (plan.relay && originBotId) {
      wake({
        sender,
        botId: originBotId,
        text: publicText,
        source: "result",
        fromBotId: botId,
        fromName: latest.name,
        hop: hop + 1,
        groupId: job.groupId,
        dm: job.dm,
        originBotId,
      });
      return;
    }

    if (!plan.continueHandoffs) return;

    const roster = threadId ? await groupRoster(threadId) : await rosterOf();
    const handoffs = outgoingHandoffs(finalText, roster, [
      botId,
      fromBotId,
      originBotId,
    ]);

    for (const handoff of handoffs) {
      emit(sender, {
        type: "relay",
        fromName: latest.name,
        toBotId: handoff.botId,
        toName: handoff.name,
      });
      const assigned = assignmentText(latest.name, handoff.body, finalText);
      const teamLine = handoff.body.trim()
        ? `@${handoff.name}: ${handoff.body.trim()}`
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
        });
      }
      wake({
        sender,
        botId: handoff.botId,
        text: assigned,
        source: "handoff",
        fromBotId: botId,
        fromName: latest.name,
        hop: hop + 1,
        groupId: threadId,
        dm: job.dm,
        originBotId: job.originBotId ?? (source === "user" ? botId : fromBotId),
      });
    }
  } catch (error) {
    if (error instanceof AgentNotFoundError) {
      await releaseBotAgent(botId);
    }
    const message =
      error instanceof AgentBusyError
        ? "Väntar på förra körningen"
        : error instanceof CursorAgentError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Något gick fel";
    if (assistantId) {
      await updateMessage(botId, assistantId, { content: message });
    }
    emit(sender, { type: "error", botId, message });
  } finally {
    if (queuedCount(botId) > 1) {
      emitQueued(sender, botId);
    } else {
      emit(sender, { type: "thinking", botId, thinking: false });
    }
  }
}
