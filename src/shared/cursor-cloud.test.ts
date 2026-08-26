import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentToBot,
  bootstrapPrompt,
  nextCursor,
  parseAgent,
  parseAgentList,
  parseRunList,
  runsToMessages,
} from "./cursor-cloud.ts";

test("parseAgentList keeps cloud agent ids", () => {
  const agents = parseAgentList({
    items: [
      { id: "bc-aaa", name: "Boss", updatedAt: "2026-08-26T12:00:00.000Z" },
      { id: "not-cloud", name: "Skip" },
    ],
    nextCursor: "page-2",
  });
  assert.equal(agents.length, 1);
  assert.equal(agents[0]?.id, "bc-aaa");
  assert.equal(nextCursor({ nextCursor: "page-2" }), "page-2");
  assert.equal(nextCursor({}), undefined);
});

test("parseAgent rejects junk", () => {
  assert.equal(parseAgent(null), undefined);
  assert.equal(parseAgent({ id: "abc" }), undefined);
  assert.equal(parseAgent({ id: "bc-1" })?.name, "bc-1");
});

test("parseRunList reads run ids", () => {
  assert.deepEqual(parseRunList({ items: [{ id: "run-1", result: "ok" }] }).map((run) => run.id), [
    "run-1",
  ]);
});

test("bootstrapPrompt includes the role", () => {
  assert.match(bootstrapPrompt("Boss", "Leads the team"), /Boss/);
  assert.match(bootstrapPrompt("Boss", "Leads the team"), /Leads the team/);
});

test("agentToBot uses the cloud id as the bot id", () => {
  const bot = agentToBot({
    id: "bc-aaa",
    name: "Boss",
    createdAt: "2026-08-26T12:00:00.000Z",
    repos: [{ url: "https://github.com/acme/repo", startingRef: "main" }],
  });
  assert.equal(bot.id, "bc-aaa");
  assert.equal(bot.agentId, "bc-aaa");
  assert.equal(bot.repoUrl, "https://github.com/acme/repo");
  assert.equal(bot.messages.length, 0);
});

test("runsToMessages is oldest first and keeps failed runs", () => {
  const messages = runsToMessages([
    { id: "run-2", result: "later", createdAt: "2026-08-26T13:00:00.000Z" },
    { id: "run-1", result: "first", createdAt: "2026-08-26T12:00:00.000Z" },
    { id: "run-err", status: "ERROR" },
  ]);
  assert.deepEqual(
    messages.map((message) => message.id),
    ["run-err", "run-1", "run-2"],
  );
  assert.equal(messages[0]?.content, "Run failed");
  assert.equal(messages[1]?.content, "first");
});
