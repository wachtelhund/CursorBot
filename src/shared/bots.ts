import type { Bot } from "./types";

export function sortBots(bots: Bot[]): Bot[] {
  return [...bots].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) {
      return Date.parse(b.pinnedAt ?? b.updatedAt) - Date.parse(a.pinnedAt ?? a.updatedAt);
    }
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}
