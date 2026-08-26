export type GroupCommand =
  | { kind: "create"; name: string; members: string[] }
  | { kind: "add"; name: string; members: string[] }
  | { kind: "target"; name: string };

const RESERVED = new Set(["ny", "new", "alla", "all", "team", "grupp"]);
const COMMAND_RE =
  /^(?:[-*]\s+)?@(?:team|grupp)\s+([^\s:：+]+)(\s*\+)?\s*[:：]\s*(.*)$/i;
const TARGET_RE = /^(?:[-*]\s+)?@(?:team|grupp)\s+([^\s:：]+)\s*$/i;
const NAME_RE = /^[\p{L}][\p{L}\p{N}_-]{0,31}$/u;

export function isGroupName(name: string): boolean {
  const trimmed = name.trim();
  if (!NAME_RE.test(trimmed)) return false;
  return !RESERVED.has(trimmed.toLowerCase());
}

function parseMembers(rest: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const raw of rest.split(/[,，]/)) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key) || RESERVED.has(key)) continue;
    seen.add(key);
    found.push(name);
  }
  return found;
}

export function parseGroupCommandLine(line: string): GroupCommand | null {
  const trimmed = line.trim();
  const command = COMMAND_RE.exec(trimmed);
  if (command) {
    const name = command[1]?.trim() ?? "";
    if (!isGroupName(name)) return null;
    const members = parseMembers(command[3] ?? "");
    return command[2]
      ? { kind: "add", name, members }
      : { kind: "create", name, members };
  }

  const target = TARGET_RE.exec(trimmed);
  if (!target) return null;
  const name = target[1]?.trim() ?? "";
  if (!isGroupName(name)) return null;
  return { kind: "target", name };
}

export function isGroupCommandLine(line: string): boolean {
  return parseGroupCommandLine(line) !== null;
}

export function parseGroupCommands(text: string): GroupCommand[] {
  if (!text.trim()) return [];
  const found: GroupCommand[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const command = parseGroupCommandLine(raw);
    if (command) found.push(command);
  }
  return found;
}

export function destinationGroupName(commands: GroupCommand[]): string | undefined {
  return commands.at(-1)?.name;
}

export function targetedGroupName(commands: GroupCommand[]): string | undefined {
  for (let index = commands.length - 1; index >= 0; index--) {
    const command = commands[index];
    if (command?.kind === "target") return command.name;
  }
  return undefined;
}
