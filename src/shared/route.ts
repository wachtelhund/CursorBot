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
  const incomingHop = input.source === "handoff";
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
  maxHop?: number;
}): DeliveryPlan {
  const maxHop = input.maxHop ?? MAX_HOP;
  const publicText = input.publicText.trim();
  const deliver = shouldDeliverHandoffResult({
    source: input.source,
    publicText,
    fromBotId: input.originBotId,
  });
  const relay =
    deliver && Boolean(input.originBotId) && input.originBotId !== input.botId;
  const postPublic =
    deliver ||
    (Boolean(publicText) &&
      input.source !== "handoff" &&
      input.userThread.kind !== "dm");

  if (input.source === "result") {
    return {
      postPublic,
      relay: false,
      logAssignments: false,
      continueHandoffs: false,
    };
  }

  return {
    postPublic,
    relay,
    logAssignments: shouldLogAssignment(input.busThread),
    continueHandoffs: !relay && input.hop < maxHop,
  };
}

export function outgoingHandoffs(
  text: string,
  roster: RosterEntry[],
  skipIds: Array<string | undefined>,
): Handoff[] {
  const skip = new Set(
    skipIds.filter((id): id is string => Boolean(id?.trim())),
  );
  return parseHandoffs(text, roster).filter((item) => !skip.has(item.botId));
}
