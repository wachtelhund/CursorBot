import { isGroupCommandLine } from "./groups.ts";
import { parseHandoffs, type Handoff, type RosterEntry } from "./mentions.ts";
import { type LogThread } from "./send.ts";
import { parseSpawns } from "./spawn.ts";
import { shouldDeliverHandoffResult, type WakeSource } from "./wake.ts";

export const MAX_HOP = 3;

export type PersistPlan = {
  incomingHop: boolean;
  userMessage: boolean;
  assistant: boolean;
  assistantSource: "handoff" | "bot";
};

export type DeliveryPlan = {
  postPublic: boolean;
  /** An answer to a bot's question: on the bus for inspect, not as a user bubble. */
  postHop: boolean;
  relay: boolean;
  logAssignments: boolean;
  continueHandoffs: boolean;
};

export function isHarnessOnlyUserText(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  return lines.every((line) => {
    if (isGroupCommandLine(line)) return true;
    return parseSpawns(line).length > 0;
  });
}

export function shouldWakeTargets(input: {
  harnessOnly: boolean;
  botId?: string;
}): boolean {
  return !input.harnessOnly;
}

export function shouldPostUserMessage(input: {
  harnessOnly: boolean;
  botId?: string;
  groupId?: string;
}): boolean {
  if (input.harnessOnly) return false;
  if (input.botId) return false;
  return true;
}

export function shouldLogAssignment(thread: LogThread): boolean {
  return thread.kind !== "dm";
}

export function persistPlan(input: {
  source: WakeSource;
  dm?: boolean;
}): PersistPlan {
  const incomingHop = input.source === "handoff" || input.source === "question";
  const userMessage = Boolean(input.dm) && input.source === "user";
  const assistant =
    incomingHop ||
    (Boolean(input.dm) && (input.source === "user" || input.source === "result"));
  return {
    incomingHop,
    userMessage,
    assistant,
    assistantSource: incomingHop ? "handoff" : "bot",
  };
}

export function incomingHopContent(botName: string, text: string): string {
  return `@${botName}: ${text}`;
}

export function deliveryPlan(input: {
  source: WakeSource;
  publicText: string;
  originBotId?: string;
  botId: string;
  hop: number;
  userThread: LogThread;
  busThread: LogThread;
  /** How many teammates this task was split across. */
  branches?: number;
  /** False while other branches of the same task are still running. */
  joinDone?: boolean;
  maxHop?: number;
}): DeliveryPlan {
  const maxHop = input.maxHop ?? MAX_HOP;
  const publicText = input.publicText.trim();
  const isQuestion = input.source === "question";
  const deliver = shouldDeliverHandoffResult({
    source: input.source,
    publicText,
    fromBotId: input.originBotId,
  });

  /**
   * A single delegated result already stands on the thread. Waking the sender
   * to restate it costs a run and shows the human the same answer twice, so the
   * sender is only woken for an answer it asked for or a fan-out to reconcile.
   */
  const relay =
    deliver &&
    Boolean(input.originBotId) &&
    input.originBotId !== input.botId &&
    (isQuestion || (input.branches ?? 1) > 1) &&
    (input.joinDone ?? true);

  const postHop = isQuestion && Boolean(publicText) && input.busThread.kind !== "dm";
  const postPublic =
    (deliver && !isQuestion) ||
    (Boolean(publicText) &&
      input.source !== "handoff" &&
      !isQuestion &&
      input.userThread.kind !== "dm");

  if (input.source === "result") {
    return {
      postPublic,
      postHop: false,
      relay: false,
      logAssignments: false,
      continueHandoffs: false,
    };
  }

  return {
    postPublic,
    postHop,
    relay,
    logAssignments: shouldLogAssignment(input.busThread),
    continueHandoffs: !relay && !isQuestion && input.hop < maxHop,
  };
}

export function outgoingHandoffs(
  text: string,
  roster: RosterEntry[],
  input: { selfId?: string; skipIds?: Array<string | undefined> },
): Handoff[] {
  const skip = new Set(
    (input.skipIds ?? []).filter((id): id is string => Boolean(id?.trim())),
  );
  return parseHandoffs(text, roster).filter((item) => {
    if (item.botId === input.selfId) return false;
    /** A question may go back to the sender — being able to ask is the point. */
    if (item.kind === "question") return true;
    return !skip.has(item.botId);
  });
}

function joinNames(names: string[]): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")} and ${clean.at(-1)}`;
}

/** A wake that does not happen is invisible unless the bus says so. */
export function hopLimitNotice(names: string[], maxHop = MAX_HOP): string {
  const who = joinNames(names);
  if (!who) return "";
  return `Hop limit ${maxHop} reached — ${who} ${names.length > 1 ? "were" : "was"} not woken. Send from this thread to carry it on.`;
}

export function unknownNameNotice(names: string[]): string {
  const who = joinNames(names);
  if (!who) return "";
  return `No teammate named ${who} — that line woke no one. Use a name from the roster, or add one with @new ${names[0]}: role.`;
}

/** On a group thread: a real teammate who is not in this group wakes no one. */
export function offThreadNotice(names: string[], groupName?: string): string {
  const who = joinNames(names);
  if (!who) return "";
  const where = groupName ? ` ${groupName}` : " this group";
  return `${who} ${names.length > 1 ? "are" : "is"} not in${where} — that line woke no one. Add them with @team${groupName ? ` ${groupName}` : " <group>"} +: ${names[0]}.`;
}

export function emptyWakeNotice(name: string): string {
  return `Nothing was sent to ${name} — the message had no text.`;
}
