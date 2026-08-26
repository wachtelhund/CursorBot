import { publicBotText, routingText } from "./mentions.ts";

/**
 * Bots do not share Cloud Agent memory and cannot read the app's threads.
 * Every wake carries a clipped view of the thread it happened on, so a bot
 * woken by `@Name: do x` knows what was asked before and by whom.
 */

export type DigestMessage = {
  name: string;
  content: string;
  from?: "user" | "bot";
  source?: string;
  toBotIds?: string[];
};

export type DigestOptions = {
  limit?: number;
  budget?: number;
  lineBudget?: number;
  roster?: { id: string; name: string }[];
  /** Drop trailing entries that only repeat the task text appended below. */
  exclude?: string;
};

export const DIGEST_LIMIT = 14;
export const DIGEST_BUDGET = 2200;
export const DIGEST_LINE = 320;
export const DIGEST_HEADER = "Thread so far (oldest first, clipped):";

function clip(text: string, max: number): string {
  const flat = text.replace(/\s*\n\s*/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function speakerOf(message: DigestMessage): string {
  if (message.name.trim()) return message.name.trim();
  return message.from === "user" ? "You" : "Bot";
}

function targetsOf(
  message: DigestMessage,
  roster: { id: string; name: string }[],
): string {
  const names = (message.toBotIds ?? [])
    .map((id) => roster.find((bot) => bot.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return names.join(", ");
}

export function digestLine(
  message: DigestMessage,
  options: DigestOptions = {},
): string | null {
  if (message.source === "system") return null;
  const lineBudget = options.lineBudget ?? DIGEST_LINE;
  const roster = options.roster ?? [];

  const body =
    message.from === "user"
      ? message.content
      : publicBotText(message.content) || routingText(message.content);
  if (!body.trim()) return null;

  const speaker = speakerOf(message);
  const targets = targetsOf(message, roster);
  const who = targets ? `${speaker} → ${targets}` : speaker;
  return `${who}: ${clip(body, lineBudget)}`;
}

export function threadDigest(
  messages: DigestMessage[],
  options: DigestOptions = {},
): string {
  if (messages.length === 0) return "";
  const limit = options.limit ?? DIGEST_LIMIT;
  const budget = options.budget ?? DIGEST_BUDGET;

  let recent = messages.slice(-limit);
  const exclude = options.exclude?.trim();
  while (exclude && recent.length > 0) {
    const last = recent[recent.length - 1];
    if (last.content.trim() !== exclude) break;
    recent = recent.slice(0, -1);
  }

  const lines: string[] = [];
  for (const message of recent) {
    const line = digestLine(message, options);
    if (line) lines.push(line);
  }
  if (lines.length === 0) return "";

  while (lines.length > 1 && lines.join("\n").length > budget) {
    lines.shift();
  }
  return `${DIGEST_HEADER}\n${lines.join("\n")}`;
}
