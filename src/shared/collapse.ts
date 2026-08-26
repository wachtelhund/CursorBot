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
  name?: string;
};

export type DmMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  source?: string;
  fromBotId?: string;
  fromName?: string;
  toBotIds?: string[];
};

export type DmRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  inspect: boolean;
  fromPeer: boolean;
  fromBotId?: string;
  fromName?: string;
  toBotIds?: string[];
  thinking?: boolean;
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

function sameAssignment(message: DmMessage, hop: LogHop, speakerId: string): boolean {
  if (hop.botId !== speakerId) return false;
  return hop.content.trim() === message.content.trim();
}

function sameHopContent(message: { content: string }, hop: { content: string }): boolean {
  return message.content.trim() === hop.content.trim();
}

/** Assignments to this bot plus that bot's handoff replies — for the target DM. */
export function hopsTowardBot<T extends LogHop>(log: T[], botId: string): T[] {
  const seen = new Set<string>();
  const hops: T[] = [];
  for (const message of log) {
    if (message.from === "user") continue;
    if (message.source === "system" || isRosterNotice(message.content)) continue;
    const toMe = Boolean(message.toBotIds?.includes(botId));
    const myReply =
      message.source === "handoff" &&
      message.botId === botId &&
      !message.toBotIds?.length;
    if (!toMe && !myReply) continue;
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    hops.push(message);
  }
  return hops;
}

/** Counterpart in a Messaged row: recipients, or the sender when this chat is the target. */
export function hopCounterpartIds(
  items: { toBotIds?: string[]; content: string; botId?: string; fromBotId?: string }[],
  roster: RosterEntry[],
  speakerId?: string,
): string[] {
  const targets = handoffRecipientIds(items, roster);
  if (!speakerId) return targets;
  const others = targets.filter((id) => id !== speakerId);
  if (others.length > 0) return others;
  return uniqueKeys(
    items
      .map((item) => item.fromBotId)
      .filter((id): id is string => Boolean(id && id !== speakerId)),
    (id) => id,
  );
}

/** Last DM sidebar line: user-facing text, else the latest hop on this bot. */
export function lastDmPreview(
  messages: DmMessage[],
  input: { botId: string; team?: LogHop[] },
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") return message.content;
    if (message.source === "handoff") {
      const text = message.content.trim();
      if (text) return text;
      continue;
    }
    if (message.source === "bot" && message.fromBotId && message.fromBotId !== input.botId) {
      continue;
    }
    const text = publicBotText(message.content);
    if (text) return text;
  }
  const hop = input.team ? hopsTowardBot(input.team, input.botId).at(-1) : undefined;
  return hop?.content.trim() ?? "";
}

export function dmActivityAt(
  bot: { id: string; updatedAt: string },
  team: LogHop[],
): string {
  const hop = hopsTowardBot(team, bot.id).at(-1);
  if (!hop) return bot.updatedAt;
  return Date.parse(hop.createdAt) > Date.parse(bot.updatedAt) ? hop.createdAt : bot.updatedAt;
}

function hopToRow(hop: LogHop, speakerId: string): DmRow {
  return {
    id: hop.id,
    role: "assistant",
    content: hop.content,
    inspect: true,
    fromPeer: Boolean(hop.botId && hop.botId !== speakerId),
    fromBotId: hop.botId,
    fromName: hop.name,
    toBotIds: hop.toBotIds,
    createdAt: hop.createdAt,
  };
}

/** DM rows: human text as bubbles; @Name: hops stay inspectable in this window. */
export function buildDmRows(
  messages: DmMessage[],
  input: { speakerId: string; thinking: boolean; team: LogHop[] },
): DmRow[] {
  const rows: DmRow[] = [];
  const seen = new Set<string>();

  const push = (row: DmRow) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    rows.push(row);
  };

  for (const [index, message] of messages.entries()) {
    const fromPeer = Boolean(
      message.fromBotId &&
        message.fromBotId !== input.speakerId &&
        (message.source === "bot" || message.source === "handoff"),
    );
    const isLast = message.role === "assistant" && index === messages.length - 1;
    const inspect =
      fromPeer ||
      message.source === "handoff" ||
      (message.role === "assistant" &&
        isInspectMessage(
          {
            from: "bot",
            content: message.content,
            toBotIds: message.toBotIds,
            source: message.source,
            botId: input.speakerId,
          },
          messages.slice(0, index).map((item) => ({
            from: item.role === "user" ? "user" : "bot",
            content: item.content,
            toBotIds: item.toBotIds,
            source: item.source,
            botId:
              item.fromBotId && item.fromBotId !== input.speakerId
                ? item.fromBotId
                : input.speakerId,
          })),
        ));
    const content =
      message.role === "assistant" && !inspect
        ? publicBotText(message.content)
        : message.content;
    const thinking = Boolean(isLast && input.thinking && !content.trim());
    const hide = message.role !== "user" && !inspect && !content.trim() && !thinking;

    if (!hide) {
      push({
        id: message.id,
        role: message.role,
        content,
        inspect,
        fromPeer,
        fromBotId: fromPeer ? message.fromBotId : undefined,
        fromName: message.fromName,
        toBotIds: message.toBotIds,
        thinking,
        createdAt: message.createdAt,
      });
    }

    if (message.role !== "assistant") continue;
    if (message.source === "handoff") continue;
    const nextUser = messages.slice(index + 1).find((item) => item.role === "user");
    for (const hop of hopsFromLog(input.team, {
      speakerId: input.speakerId,
      since: message.createdAt,
      until: nextUser?.createdAt,
    })) {
      if (isRosterNotice(hop.content) || hop.source === "system") continue;
      if (sameAssignment(message, hop, input.speakerId)) continue;
      if (messages.some((item) => sameHopContent(item, hop))) continue;
      push(hopToRow(hop, input.speakerId));
    }
  }

  if (messages.length === 0) {
    for (const hop of hopsTowardBot(input.team, input.speakerId)) {
      if (seen.has(hop.id)) continue;
      push(hopToRow(hop, input.speakerId));
    }
  }

  return rows;
}
