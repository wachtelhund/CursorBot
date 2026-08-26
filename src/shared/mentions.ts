import { isGroupCommandLine } from "./groups.ts";

export type RosterEntry = {
  id: string;
  name: string;
};

export type Handoff = {
  botId: string;
  name: string;
  body: string;
};

export type RosterMention = {
  bot: RosterEntry;
  consumed: number;
};

const ALL = new Set(["alla", "all", "team"]);
const SPAWN = new Set(["ny", "new", "grupp"]);
const ASSIGNMENT_RE = /^(?:[-*]\s+)?@([^\s:：]+)[:：]?\s*(.*)$/;
const ASSIGNMENT_LINE_RE = /^(?:[-*]\s+)?@(.*)$/;

export function isRoutingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (isGroupCommandLine(trimmed)) return true;
  return ASSIGNMENT_RE.test(trimmed);
}

export function stripRoutingLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !isRoutingLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
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
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;

  let sawAssignment = false;
  for (const line of lines) {
    if (isGroupCommandLine(line)) continue;
    const match = ASSIGNMENT_RE.exec(line);
    if (!match) return false;
    const key = match[1]?.toLowerCase() ?? "";
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
  return next === undefined || next === ":" || next === "：" || /\s/.test(next);
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

  const token = firstToken(afterAt);
  if (!token) return null;
  const needle = token.toLowerCase();
  const hits = roster.filter((bot) => bot.name.toLowerCase().startsWith(needle));
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

export function parseHandoffs(text: string, roster: RosterEntry[]): Handoff[] {
  if (!text.trim() || roster.length === 0) return [];

  const found: Handoff[] = [];
  const seen = new Set<string>();

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (isGroupCommandLine(line)) continue;
    const match = ASSIGNMENT_LINE_RE.exec(line);
    if (!match) continue;

    const afterAt = match[1] ?? "";
    const key = firstToken(afterAt).toLowerCase();
    if (!key || SPAWN.has(key)) continue;

    if (ALL.has(key)) {
      const body = afterAt.slice(key.length).replace(/^[:：]\s*/, "").trim();
      for (const bot of roster) {
        if (seen.has(bot.id)) continue;
        seen.add(bot.id);
        found.push({ botId: bot.id, name: bot.name, body });
      }
      continue;
    }

    const hit = matchRosterMention(afterAt, roster);
    if (!hit || seen.has(hit.bot.id)) continue;
    const body = afterAt.slice(hit.consumed).replace(/^[:：]\s*/, "").trim();
    seen.add(hit.bot.id);
    found.push({ botId: hit.bot.id, name: hit.bot.name, body });
  }

  return found;
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
