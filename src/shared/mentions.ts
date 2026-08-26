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

const ALL = new Set(["alla", "all", "team"]);
const SPAWN = new Set(["ny", "new", "grupp"]);
const ASSIGNMENT_RE = /^(?:[-*]\s+)?@([^\s:：]+)[:：]?\s*(.*)$/;

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

export function parseHandoffs(text: string, roster: RosterEntry[]): Handoff[] {
  if (!text.trim() || roster.length === 0) return [];

  const sorted = [...roster].sort((a, b) => b.name.length - a.name.length);
  const found: Handoff[] = [];
  const seen = new Set<string>();

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (isGroupCommandLine(line)) continue;
    const match = ASSIGNMENT_RE.exec(line);
    if (!match) continue;

    const key = match[1].toLowerCase();
    const body = (match[2] ?? "").trim();

    if (SPAWN.has(key)) continue;

    if (ALL.has(key)) {
      for (const bot of roster) {
        if (seen.has(bot.id)) continue;
        seen.add(bot.id);
        found.push({ botId: bot.id, name: bot.name, body });
      }
      continue;
    }

    const exact = sorted.find((bot) => bot.name.toLowerCase() === key);
    if (exact && !seen.has(exact.id)) {
      seen.add(exact.id);
      found.push({ botId: exact.id, name: exact.name, body });
    }
  }

  return found;
}

export function mentionQueryAt(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const query = before.slice(at + 1);
  if (query.length > 32 || /\s/.test(query)) return null;
  return { start: at, query };
}

export function filterRoster(roster: RosterEntry[], query: string): RosterEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return roster;
  return roster.filter((bot) => bot.name.toLowerCase().includes(needle));
}
