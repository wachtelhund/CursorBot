import { isRoutableLine, isCodeSpanLine, scanFences } from "./fences.ts";
import { isGroupCommandLine } from "./groups.ts";
import type { SendMode } from "./send-mode.ts";
import { parseSpawns } from "./spawn.ts";

export type RosterEntry = {
  id: string;
  name: string;
};

/** `@Name:` assigns, `@Name!:` interrupts, `@Name?:` asks and expects an answer back. */
export type HandoffKind = "assign" | "question";

export type Handoff = {
  botId: string;
  name: string;
  body: string;
  kind: HandoffKind;
  mode: SendMode;
};

export type RosterMention = {
  bot: RosterEntry;
  consumed: number;
};

const ALL = new Set(["alla", "all", "team"]);
const SPAWN = new Set(["ny", "new", "grupp"]);
const ASSIGNMENT_RE = /^(?:[-*]\s+)?@([^\s:：]+)[:：]?\s*(.*)$/;
const ASSIGNMENT_LINE_RE = /^(?:[-*]\s+)?@(.*)$/;
const DIRECTED_RE = /^(?:[-*]\s+)?@([^\s:：]+)\s*[:：]/;
const MARKER_RE = /^([?!])?\s*[:：]?\s*/;

/** `Ada?` / `Ada!` — the marker is delivery, not part of the name. */
function splitMarker(token: string): { key: string; marker?: "?" | "!" } {
  const last = token.at(-1);
  if (last === "?" || last === "!") {
    return { key: token.slice(0, -1).toLowerCase(), marker: last };
  }
  return { key: token.toLowerCase() };
}

function deliveryOf(marker?: "?" | "!"): { kind: HandoffKind; mode: SendMode } {
  if (marker === "?") return { kind: "question", mode: "queue" };
  if (marker === "!") return { kind: "assign", mode: "steer" };
  return { kind: "assign", mode: "queue" };
}

export function isRoutingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (isCodeSpanLine(line)) return false;
  if (isGroupCommandLine(trimmed)) return true;
  return ASSIGNMENT_RE.test(trimmed);
}

export function stripRoutingLines(text: string): string {
  return scanFences(text)
    .filter((line) => !isRoutableLine(line) || !isRoutingLine(line.text))
    .map((line) => line.text)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function routingText(text: string): string {
  return scanFences(text)
    .filter((line) => {
      if (!isRoutableLine(line)) return false;
      const trimmed = line.text.trim();
      if (!isRoutingLine(trimmed)) return false;
      if (isGroupCommandLine(trimmed)) return false;
      if (parseSpawns(trimmed).length > 0) return false;
      return true;
    })
    .map((line) => line.text)
    .join("\n")
    .trim();
}

export function isHandoffNarration(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return (
    /^(skickat|sent)\b/i.test(trimmed) ||
    /väntar inte på svar/i.test(trimmed) ||
    /not waiting\b/i.test(trimmed)
  );
}

export function publicBotText(text: string): string {
  return stripRoutingLines(text)
    .split(/\r?\n/)
    .filter((line) => !isHandoffNarration(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isAssignmentPing(content: string): boolean {
  const lines = scanFences(content)
    .filter(isRoutableLine)
    .map((line) => line.text.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;

  let sawAssignment = false;
  for (const line of lines) {
    if (isGroupCommandLine(line)) continue;
    const match = ASSIGNMENT_RE.exec(line);
    if (!match) return false;
    const { key } = splitMarker(match[1] ?? "");
    if (SPAWN.has(key)) return false;
    sawAssignment = true;
  }
  return sawAssignment;
}

function sortedRoster(roster: RosterEntry[]): RosterEntry[] {
  return [...roster].sort((a, b) => b.name.length - a.name.length);
}

function mentionBoundary(text: string, index: number): boolean {
  const next = text[index];
  return (
    next === undefined ||
    next === ":" ||
    next === "：" ||
    next === "?" ||
    next === "!" ||
    /\s/.test(next)
  );
}

function firstToken(text: string): string {
  return /^[^\s:：]+/.exec(text)?.[0] ?? "";
}

/** Longest exact name, else unique prefix. Case-insensitive. Names may contain spaces. */
export function matchRosterMention(
  afterAt: string,
  roster: RosterEntry[],
): RosterMention | null {
  if (!afterAt || roster.length === 0) return null;

  const lower = afterAt.toLowerCase();
  for (const bot of sortedRoster(roster)) {
    const name = bot.name.toLowerCase();
    if (!lower.startsWith(name)) continue;
    if (!mentionBoundary(afterAt, name.length)) continue;
    return { bot, consumed: bot.name.length };
  }

  const { key: token } = splitMarker(firstToken(afterAt));
  if (!token) return null;
  const hits = roster.filter((bot) => bot.name.toLowerCase().startsWith(token));
  if (hits.length !== 1) return null;

  const bot = hits[0];
  const nameLower = bot.name.toLowerCase();
  let consumed = token.length;
  while (consumed < bot.name.length && consumed < afterAt.length) {
    if (lower[consumed] !== nameLower[consumed]) break;
    consumed += 1;
  }
  if (!mentionBoundary(afterAt, consumed)) {
    while (consumed > token.length && !mentionBoundary(afterAt, consumed)) {
      consumed -= 1;
    }
    if (!mentionBoundary(afterAt, consumed)) return null;
  }
  return { bot, consumed };
}

function splitBody(rest: string): { body: string; marker?: "?" | "!" } {
  const match = MARKER_RE.exec(rest);
  const marker = match?.[1] as "?" | "!" | undefined;
  return { body: rest.slice(match?.[0].length ?? 0).trim(), marker };
}

export function parseHandoffs(text: string, roster: RosterEntry[]): Handoff[] {
  if (!text.trim() || roster.length === 0) return [];

  const found: Handoff[] = [];
  const seen = new Set<string>();

  for (const raw of scanFences(text)) {
    if (!isRoutableLine(raw)) continue;
    const line = raw.text.trim();
    if (isGroupCommandLine(line)) continue;
    const match = ASSIGNMENT_LINE_RE.exec(line);
    if (!match) continue;

    const afterAt = match[1] ?? "";
    const { key, marker: tokenMarker } = splitMarker(firstToken(afterAt));
    if (!key || SPAWN.has(key)) continue;

    if (ALL.has(key)) {
      const { body } = splitBody(afterAt.slice(firstToken(afterAt).length));
      const delivery = deliveryOf(tokenMarker);
      for (const bot of roster) {
        if (seen.has(bot.id)) continue;
        seen.add(bot.id);
        found.push({ botId: bot.id, name: bot.name, body, ...delivery });
      }
      continue;
    }

    const hit = matchRosterMention(afterAt, roster);
    if (!hit || seen.has(hit.bot.id)) continue;
    const { body, marker } = splitBody(afterAt.slice(hit.consumed));
    seen.add(hit.bot.id);
    found.push({
      botId: hit.bot.id,
      name: hit.bot.name,
      body,
      ...deliveryOf(marker),
    });
  }

  return found;
}

/**
 * `@Someone: do x` where Someone is on nobody's roster.
 * Today that line wakes no one and says nothing — the caller reports it.
 */
export function unmatchedMentions(text: string, roster: RosterEntry[]): string[] {
  if (!text.trim()) return [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const raw of scanFences(text)) {
    if (!isRoutableLine(raw)) continue;
    const line = raw.text.trim();
    if (isGroupCommandLine(line)) continue;
    if (parseSpawns(line).length > 0) continue;

    const directed = DIRECTED_RE.exec(line);
    if (!directed) continue;
    const token = directed[1] ?? "";
    const { key } = splitMarker(token);
    if (!key || SPAWN.has(key) || ALL.has(key)) continue;

    const afterAt = ASSIGNMENT_LINE_RE.exec(line)?.[1] ?? "";
    if (matchRosterMention(afterAt, roster)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    missing.push(token.replace(/[?!]$/, ""));
  }

  return missing;
}

export function mentionQueryAt(
  text: string,
  caret: number,
  names: string[] = [],
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const query = before.slice(at + 1);
  if (query.length > 64 || /[:：\n]/.test(query)) return null;
  if (names.length > 0) {
    const needle = query.toLowerCase();
    const open =
      needle.length === 0 ||
      names.some((name) => name.toLowerCase().startsWith(needle));
    if (!open) return null;
    return { start: at, query };
  }
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

export function filterRoster(roster: RosterEntry[], query: string): RosterEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return roster;
  return roster.filter((bot) => bot.name.toLowerCase().includes(needle));
}
