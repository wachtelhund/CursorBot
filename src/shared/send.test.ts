import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSendPayload, resolveLogThread, resolveSendTargets } from "./send.ts";

test("parseSendPayload reads { text, botId }", () => {
  assert.deepEqual(parseSendPayload({ text: "  hej  ", botId: "bot_1" }), {
    text: "hej",
    botId: "bot_1",
    groupId: undefined,
  });
});

test("parseSendPayload accepts legacy (botId, text)", () => {
  assert.deepEqual(parseSendPayload("bot_1", "hej"), {
    text: "hej",
    botId: "bot_1",
  });
});

test("parseSendPayload reads groupId", () => {
  assert.deepEqual(parseSendPayload({ text: "hej", groupId: "grp_1" }), {
    text: "hej",
    botId: undefined,
    groupId: "grp_1",
  });
});

test("parseSendPayload does not drop text when renderer sends an object", () => {
  const parsed = parseSendPayload({ text: "ping", botId: "bot_1" }, undefined);
  assert.equal(parsed.text, "ping");
  assert.equal(parsed.botId, "bot_1");
});

test("parseSendPayload rejects missing text", () => {
  assert.equal(parseSendPayload("bot_1", undefined).text, "");
  assert.equal(parseSendPayload({ botId: "bot_1" }).text, "");
});

test("resolveSendTargets keeps a directed DM on that bot only", () => {
  assert.deepEqual(
    resolveSendTargets({
      botId: "chefen",
      mentionedIds: ["utvecklare", "chefen"],
      fallbackId: "chefen",
    }),
    ["chefen"],
  );
});

test("resolveSendTargets uses assignment mentions on Team", () => {
  assert.deepEqual(
    resolveSendTargets({
      mentionedIds: ["utvecklare"],
      fallbackId: "chefen",
    }),
    ["utvecklare"],
  );
});

test("resolveSendTargets falls back when Team has no assignment", () => {
  assert.deepEqual(
    resolveSendTargets({
      mentionedIds: [],
      fallbackId: "chefen",
    }),
    ["chefen"],
  );
});

test("resolveLogThread keeps a DM on that chat only", () => {
  assert.deepEqual(
    resolveLogThread({ dm: true, targetGroupId: "grp_app" }),
    { kind: "dm" },
  );
});

test("resolveLogThread stays on the group the user sent in", () => {
  assert.deepEqual(
    resolveLogThread({ groupId: "grp_app", targetGroupId: "grp_other" }),
    { kind: "group", groupId: "grp_app" },
  );
});

test("resolveLogThread routes Team work to an explicit @team target only", () => {
  assert.deepEqual(resolveLogThread({ targetGroupId: "grp_app" }), {
    kind: "group",
    groupId: "grp_app",
  });
  assert.deepEqual(resolveLogThread({}), { kind: "team" });
});
