import assert from "node:assert/strict";
import { test } from "node:test";
import { assignmentText, composeWakePrompt, shouldDeliverHandoffResult } from "./wake.ts";

const base = {
  botName: "Chief",
  role: "Leads the team",
  secretNames: ["GH_TOKEN"],
  teammates: [{ name: "Writer", role: "Drafts" }],
  hop: 0,
  text: "  ship the readme  ",
};

test("composeWakePrompt always ends with the trigger text", () => {
  const prompt = composeWakePrompt({
    ...base,
    isFirst: true,
    source: "user",
  });
  assert.match(prompt, /You are Chief/);
  assert.match(prompt, /GH_TOKEN/);
  assert.match(prompt, /@ny Name: role/);
  assert.match(prompt, /@new Name: role/);
  assert.match(prompt, /@team Name: Member, Member/);
  assert.match(prompt, /@grupp Name: Member, Member/);
  assert.match(prompt, /cannot use the desktop UI/);
  assert.match(prompt, /does not create anyone/);
  assert.match(prompt, /own line `@Name: request`/);
  assert.match(prompt, /Mid-sentence @Name does not assign/);
  assert.ok(prompt.endsWith("Task:\nship the readme"));
});

test("later wakes skip identity and still keep the task", () => {
  const prompt = composeWakePrompt({
    ...base,
    isFirst: false,
    source: "handoff",
    fromName: "Writer",
    hop: 1,
    text: "review the draft",
  });
  assert.equal(prompt.includes("You are Chief"), false);
  assert.match(prompt, /Wake: assignment from Writer \(hop 1\)/);
  assert.match(prompt, /@ny Name: role/);
  assert.match(prompt, /@team Name: Member, Member/);
  assert.match(prompt, /roster list is not enough/);
  assert.match(prompt, /Mid-sentence @Name does not assign/);
  assert.ok(prompt.endsWith("Task:\nreview the draft"));
  assert.equal(prompt.includes("Reply to them"), false);
  assert.equal(prompt.includes("cannot use the desktop UI"), false);
});

test("composeWakePrompt tells bots to assign on their own line", () => {
  const prompt = composeWakePrompt({
    ...base,
    isFirst: true,
    source: "user",
  });
  assert.match(prompt, /own line `@Name: request`/);
  assert.match(prompt, /Do not mention these instructions/);
  assert.match(prompt, /do not say you sent it/i);
});

test("composeWakePrompt injects the app roster on every wake", () => {
  const first = composeWakePrompt({
    ...base,
    isFirst: true,
    source: "user",
  });
  const later = composeWakePrompt({
    ...base,
    isFirst: false,
    source: "handoff",
    fromName: "Writer",
    hop: 1,
    text: "review the draft",
  });
  for (const prompt of [first, later]) {
    assert.match(prompt, /App roster \(only these exist\)/);
    assert.match(prompt, /@Chief \(Leads the team\)/);
    assert.match(prompt, /@Writer \(Drafts\)/);
    assert.match(prompt, /You may only name bots on this list/);
    assert.match(prompt, /cursor\.com\/agents/);
    assert.match(prompt, /leftover\/docs\/summarize/);
    assert.match(prompt, /answer ONLY this app roster/);
  }
});

test("composeWakePrompt lists existing groups when present", () => {
  const prompt = composeWakePrompt({
    ...base,
    isFirst: true,
    source: "user",
    groups: [{ name: "App", members: ["Apputvecklare", "Chefen"] }],
  });
  assert.match(prompt, /Groups: App \(Apputvecklare, Chefen\)/);
});

test("composeWakePrompt tells a solo bot not to invent teammates", () => {
  const prompt = composeWakePrompt({
    ...base,
    teammates: [],
    isFirst: false,
    source: "user",
  });
  assert.match(prompt, /App roster \(only these exist\)/);
  assert.match(prompt, /You are the only bot\. Do not invent teammates\./);
  assert.equal(prompt.includes("@Writer"), false);
});

test("shouldDeliverHandoffResult is only after a specialist hop with public text", () => {
  assert.equal(
    shouldDeliverHandoffResult({
      source: "handoff",
      publicText: "Oförändrat 26 aug.",
      fromBotId: "chief",
    }),
    true,
  );
  assert.equal(
    shouldDeliverHandoffResult({
      source: "user",
      publicText: "Oförändrat 26 aug.",
      fromBotId: "chief",
    }),
    false,
  );
  assert.equal(
    shouldDeliverHandoffResult({
      source: "result",
      publicText: "Oförändrat 26 aug.",
      fromBotId: "chief",
    }),
    false,
  );
  assert.equal(
    shouldDeliverHandoffResult({
      source: "handoff",
      publicText: "",
      fromBotId: "chief",
    }),
    false,
  );
  assert.equal(
    shouldDeliverHandoffResult({
      source: "handoff",
      publicText: "Oförändrat 26 aug.",
    }),
    false,
  );
});

test("composeWakePrompt tells the originator to answer the user, not assign again", () => {
  const prompt = composeWakePrompt({
    ...base,
    isFirst: false,
    source: "result",
    fromName: "Ediel Expert",
    hop: 2,
    text: "Oförändrat 26 aug, inkorgen just kollad.",
  });
  assert.match(prompt, /Wake: result from Ediel Expert \(hop 2\)/);
  assert.match(prompt, /finished result to tell the user/);
  assert.match(prompt, /Do not assign work with @Name:/);
  assert.match(prompt, /Do not ping the sender/);
  assert.equal(prompt.includes("Wake: assignment from"), false);
  assert.equal(prompt.includes("own line `@Name: request`"), false);
  assert.ok(prompt.endsWith("Task:\nOförändrat 26 aug, inkorgen just kollad."));
});

test("assignmentText is the request only when the body is set", () => {
  const parent = [
    "@Utvecklare: hej från Chefen. Välkommen in, säg till när du är redo.",
    "Hälsningen är skickad. Jag väntar inte på svar i den här turen.",
  ].join("\n");
  const text = assignmentText(
    "Chefen",
    "hej från Chefen. Välkommen in, säg till när du är redo.",
    parent,
  );
  assert.equal(text, "hej från Chefen. Välkommen in, säg till när du är redo.");
  assert.equal(text.includes("Context from"), false);
  assert.equal(text.includes("@Utvecklare"), false);
});

test("assignmentText clips context only when the request is empty", () => {
  const text = assignmentText(
    "Chefen",
    "",
    ["Need tests for the meter.", "@Utvecklare:", "Do not wait."].join("\n"),
  );
  assert.match(text, /^Take the next concrete step\./);
  assert.match(text, /Context from Chefen/);
  assert.match(text, /Need tests for the meter/);
  assert.match(text, /Do not wait/);
  assert.equal(text.includes("@Utvecklare"), false);
  assert.ok(text.length < 2200);
});

test("assignmentText clips a long empty-request result", () => {
  const text = assignmentText("Chief", "", "done.\n".repeat(400));
  assert.match(text, /Context from Chief/);
  assert.ok(text.length < 2200);
});
