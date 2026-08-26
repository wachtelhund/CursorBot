import { parseSendMode, type SendMode } from "./send-mode.ts";

export type ParsedSend = {
  text: string;
  botId?: string;
  groupId?: string;
  sendMode: SendMode;
};

export function parseSendPayload(payload: unknown, maybeText?: unknown): ParsedSend {
  if (payload && typeof payload === "object") {
    const input = payload as {
      text?: unknown;
      botId?: unknown;
      groupId?: unknown;
      sendMode?: unknown;
    };
    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (text) {
      return {
        text,
        botId: typeof input.botId === "string" && input.botId ? input.botId : undefined,
        groupId: typeof input.groupId === "string" && input.groupId ? input.groupId : undefined,
        sendMode: parseSendMode(input.sendMode),
      };
    }
  }

  const legacyText = typeof maybeText === "string" ? maybeText.trim() : "";
  if (legacyText) {
    return {
      text: legacyText,
      botId: typeof payload === "string" && payload ? payload : undefined,
      sendMode: "queue",
    };
  }

  return { text: "", sendMode: "queue" };
}

export function resolveSendTargets(input: {
  botId?: string;
  mentionedIds: string[];
  fallbackId: string;
}): string[] {
  if (input.botId) return [input.botId];
  if (input.mentionedIds.length > 0) return [...input.mentionedIds];
  return [input.fallbackId];
}

export type LogThread =
  | { kind: "dm" }
  | { kind: "team" }
  | { kind: "group"; groupId: string };

export function resolveLogThread(input: {
  dm?: boolean;
  groupId?: string;
  targetGroupId?: string;
}): LogThread {
  if (input.dm) return { kind: "dm" };
  if (input.groupId) return { kind: "group", groupId: input.groupId };
  if (input.targetGroupId) return { kind: "group", groupId: input.targetGroupId };
  return { kind: "team" };
}

export function logGroupId(thread: LogThread): string | undefined {
  return thread.kind === "group" ? thread.groupId : undefined;
}
