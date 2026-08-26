import assert from "node:assert/strict";
import { test } from "node:test";
import { sortBots } from "./bots.ts";
import type { Bot } from "./types.ts";

function bot(partial: Partial<Bot> & Pick<Bot, "id" | "name">): Bot {
  return {
    role: "",
    model: "composer-2.5",
    messages: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("sortBots keeps pinned bots first, newest pin on top", () => {
  const sorted = sortBots([
    bot({ id: "a", name: "Alpha", updatedAt: "2026-08-26T12:00:00.000Z" }),
    bot({
      id: "b",
      name: "Bravo",
      pinned: true,
      pinnedAt: "2026-08-26T10:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    }),
    bot({
      id: "c",
      name: "Charlie",
      pinned: true,
      pinnedAt: "2026-08-26T11:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    }),
  ]);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["c", "b", "a"],
  );
});

test("sortBots orders unpinned bots by latest activity", () => {
  const sorted = sortBots([
    bot({ id: "old", name: "Old", updatedAt: "2026-08-01T00:00:00.000Z" }),
    bot({ id: "new", name: "New", updatedAt: "2026-08-26T00:00:00.000Z" }),
  ]);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["new", "old"],
  );
});
