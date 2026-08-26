import { routableLines } from "./fences.ts";

export const MAX_SPAWNS = 5;

export type SpawnSpec = {
  name: string;
  role: string;
  agentId?: string;
  source: "command" | "roster";
};

const RESERVED = new Set(["ny", "new", "alla", "all", "team", "grupp"]);
const COMMAND_RE = /^(?:[-*]\s+)?@(ny|new)\s+([^\s:：]+)[:：]\s*(.*)$/i;
const ROSTER_RE = /^(?:[-*]\s+)?\*\*([^*]+)\*\*\s*[—–-]\s*(.+)$/;
const AGENT_URL_RE = /(?:https?:\/\/)?(?:www\.)?cursor\.com\/agents\/(bc-[a-f0-9-]+)/i;
const NAME_RE = /^[\p{L}][\p{L}\p{N}_-]{0,31}$/u;

function extractAgentId(text: string): string | undefined {
  const match = AGENT_URL_RE.exec(text);
  return match?.[1];
}

function stripAgentUrl(text: string): string {
  return text.replace(AGENT_URL_RE, "").replace(/\s+/g, " ").trim();
}

function asSpec(
  name: string,
  role: string,
  source: SpawnSpec["source"],
  agentId?: string,
): SpawnSpec | null {
  if (!NAME_RE.test(name)) return null;
  if (RESERVED.has(name.toLowerCase())) return null;
  const spec: SpawnSpec = { name, role, source };
  if (agentId) spec.agentId = agentId;
  return spec;
}

function parseLine(line: string): SpawnSpec | null {
  const command = COMMAND_RE.exec(line);
  if (command) {
    const name = command[2]?.trim() ?? "";
    const rest = command[3] ?? "";
    return asSpec(name, stripAgentUrl(rest), "command", extractAgentId(rest));
  }

  const roster = ROSTER_RE.exec(line);
  if (!roster) return null;
  const agentId = extractAgentId(line);
  if (!agentId) return null;
  const name = roster[1]?.trim() ?? "";
  const role = stripAgentUrl(roster[2] ?? "");
  return asSpec(name, role, "roster", agentId);
}

export function parseSpawns(text: string, skipNames: string[] = []): SpawnSpec[] {
  if (!text.trim()) return [];

  const skip = new Set(skipNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  const found: SpawnSpec[] = [];
  const seen = new Set<string>();

  for (const raw of routableLines(text)) {
    if (found.length >= MAX_SPAWNS) break;
    const spec = parseLine(raw.trim());
    if (!spec) continue;

    const key = spec.name.toLowerCase();
    if (skip.has(key) || seen.has(key)) continue;

    seen.add(key);
    found.push(spec);
  }

  return found;
}

export const MAX_BACKFILL = 20;
export const BACKFILL_RECENT = 40;

export type BackfillSource = {
  speaker?: string;
  text: string;
};

export function backfillSourcesFrom(input: {
  team: { name: string; content: string }[];
  bots: { name: string; messages: { role: string; content: string }[] }[];
}): BackfillSource[] {
  const sources: BackfillSource[] = [];

  for (const message of input.team.slice(-BACKFILL_RECENT)) {
    if (!message.content.trim()) continue;
    sources.push({ speaker: message.name, text: message.content });
  }

  for (const bot of input.bots) {
    const recent = bot.messages
      .filter((message) => message.role === "assistant" && message.content.trim())
      .slice(-BACKFILL_RECENT);
    for (const message of recent) {
      sources.push({ speaker: bot.name, text: message.content });
    }
  }

  return sources;
}

export function collectBackfillSpawns(
  sources: BackfillSource[],
  existingNames: string[] = [],
  removedNames: string[] = [],
): SpawnSpec[] {
  const existing = new Set(
    existingNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const removed = new Set(
    removedNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const found: SpawnSpec[] = [];

  for (const source of sources) {
    if (found.length >= MAX_BACKFILL) break;
    const skip = [...existing];
    if (source.speaker) skip.push(source.speaker);
    for (const spec of parseSpawns(source.text, skip)) {
      const key = spec.name.toLowerCase();
      if (existing.has(key)) continue;
      if (spec.source !== "command" && removed.has(key)) continue;
      existing.add(key);
      found.push(spec);
      if (found.length >= MAX_BACKFILL) break;
    }
  }

  return found;
}

export function shouldSkipSpawn(spec: SpawnSpec, removedNames: string[]): boolean {
  if (spec.source === "command") return false;
  return removedNames.some((name) => name.trim().toLowerCase() === spec.name.toLowerCase());
}
