import { sortBots } from "@shared/bots";
import type { Bot } from "@shared/types";

const KEY = "cursor-bots.pinned";

export function readPinnedIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function writePinnedIds(ids: string[]): void {
  localStorage.setItem(KEY, JSON.stringify([...new Set(ids)]));
}

export function applyPins(bots: Bot[]): Bot[] {
  const pinned = new Set(readPinnedIds());
  return sortBots(
    bots.map((bot) => ({
      ...bot,
      pinned: Boolean(bot.pinned || pinned.has(bot.id)),
    })),
  );
}

export function togglePinnedId(botId: string, pinned: boolean): string[] {
  const current = readPinnedIds();
  const next = pinned
    ? [...current, botId]
    : current.filter((id) => id !== botId);
  writePinnedIds(next);
  return next;
}
