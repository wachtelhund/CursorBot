import { isAssignmentPing, parseHandoffs, publicBotText, type RosterEntry } from "./mentions.ts";

export type InspectMessage = {
  from: string;
  content: string;
  toBotIds?: string[];
  source?: string;
  botId?: string;
};

export type LogHop = InspectMessage & {
  id: string;
  createdAt: string;
};

export type CollapseSegment<T> =
  | { kind: "item"; item: T }
  | { kind: "bundle"; items: T[] };

export function isHandoffMessage(message: {
  from: string;
  content: string;
  toBotIds?: string[];
}): boolean {
  if (message.from === "user") return false;
  if (message.toBotIds && message.toBotIds.length > 0) return true;
  if (isAssignmentPing(message.content)) return true;
  return Boolean(message.content.trim()) && !publicBotText(message.content);
}

export function bundleHandoffs<T>(
  items: T[],
  isUser: (item: T) => boolean,
  isHandoff: (item: T) => boolean,
): CollapseSegment<T>[] {
  const out: CollapseSegment<T>[] = [];
  let bundle: T[] = [];

  const flush = () => {
    if (bundle.length === 0) return;
    out.push({ kind: "bundle", items: bundle });
    bundle = [];
  };

  for (const item of items) {
    if (isUser(item) || !isHandoff(item)) {
      flush();
      out.push({ kind: "item", item });
      continue;
    }
    bundle.push(item);
  }
  flush();
  return out;
}

export function uniqueKeys<T>(items: T[], keyOf: (item: T) => string): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/** Recipients of collapsed @Name: / toBotIds handoffs — not the speaker. */
export function handoffRecipientIds(
  items: { toBotIds?: string[]; content: string; botId?: string }[],
  roster: RosterEntry[],
): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (item.toBotIds && item.toBotIds.length > 0) {
      ids.push(...item.toBotIds);
      continue;
    }
    const parsed = parseHandoffs(item.content, roster);
    if (parsed.length > 0) {
      for (const handoff of parsed) ids.push(handoff.botId);
      continue;
    }
    if (item.botId) ids.push(item.botId);
  }
  return uniqueKeys(ids, (id) => id);
}

/** Spawn / group command echoes — not addressed to the human. */
export function isRosterNotice(content: string): boolean {
  const line = content.trim();
  return (
    /^\S+ skapade \S+$/.test(line) ||
    /^\S+ kunde inte skapa /.test(line) ||
    /^\S+ la till .+ i \S+$/.test(line) ||
    /^Ingen i .+ matchade en bot$/.test(line) ||
    /^Gruppen \S+ finns inte$/.test(line)
  );
}

/** Bot-to-bot payload: hide from user bubbles, keep for Messaged inspect. */
export function isInspectMessage(
  message: InspectMessage,
  previous: InspectMessage[] = [],
): boolean {
  if (message.from === "user") return false;
  if (message.source === "handoff" || message.source === "system") return true;
  if (isRosterNotice(message.content)) return true;
  if (isHandoffMessage(message)) return true;
  for (let index = previous.length - 1; index >= 0; index -= 1) {
    const prev = previous[index];
    if (prev.from === "user") return false;
    if (message.botId && prev.toBotIds?.includes(message.botId)) return true;
    if (
      prev.botId === message.botId &&
      publicBotText(prev.content) &&
      !isHandoffMessage(prev)
    ) {
      return false;
    }
  }
  return false;
}

export function isUserFacingBotText(content: string): boolean {
  return Boolean(publicBotText(content)) && !isRosterNotice(content);
}

export function hopsFromLog<T extends LogHop>(
  log: T[],
  input: { speakerId: string; since: string; until?: string },
): T[] {
  const start = Date.parse(input.since);
  const end = input.until ? Date.parse(input.until) : Number.POSITIVE_INFINITY;
  const windowed = log.filter((message) => {
    const at = Date.parse(message.createdAt);
    return Number.isFinite(at) && at >= start && at <= end;
  });
  const assigns = windowed.filter(
    (message) =>
      message.botId === input.speakerId &&
      (Boolean(message.toBotIds?.length) || isAssignmentPing(message.content)),
  );
  const targets = new Set(assigns.flatMap((message) => message.toBotIds ?? []));
  const replies = windowed.filter((message) => {
    if (message.source !== "handoff" || !message.botId) return false;
    if (message.botId === input.speakerId) return false;
    return targets.size === 0 || targets.has(message.botId);
  });
  const seen = new Set<string>();
  const hops: T[] = [];
  for (const message of [...assigns, ...replies]) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    hops.push(message);
  }
  return hops;
}
