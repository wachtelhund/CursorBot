import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHandoffs } from "./mentions.ts";
import {
  deliveryPlan,
  emptyWakeNotice,
  hopLimitNotice,
  incomingHopContent,
  isHarnessOnlyUserText,
  offThreadNotice,
  outgoingHandoffs,
  persistPlan,
  shouldLogAssignment,
  shouldPostUserMessage,
  shouldWakeTargets,
  unknownNameNotice,
} from "./route.ts";
import { resolveLogThread } from "./send.ts";

const team = resolveLogThread({});
const group = resolveLogThread({ groupId: "grp_app" });
const dm = resolveLogThread({ dm: true });

test("isHarnessOnlyUserText is true for spawn/group lines only", () => {
  assert.equal(isHarnessOnlyUserText("@ny Tester: QA"), true);
  assert.equal(isHarnessOnlyUserText("@new Reviewer: Reviews PRs"), true);
  assert.equal(isHarnessOnlyUserText("@team App: Writer, Chief"), true);
  assert.equal(isHarnessOnlyUserText("@grupp App +: Writer"), true);
  assert.equal(isHarnessOnlyUserText("@team App"), true);
  assert.equal(isHarnessOnlyUserText("@ny Tester: QA\n@team App: Tester, Chief"), true);
  assert.equal(isHarnessOnlyUserText("@Tester: stå upp"), false);
  assert.equal(isHarnessOnlyUserText("@ny Tester: QA\n@Tester: stå upp"), false);
  assert.equal(isHarnessOnlyUserText("hej\n@ny Tester: QA"), false);
  assert.equal(isHarnessOnlyUserText("@alla: synka"), false);
  assert.equal(isHarnessOnlyUserText(""), false);
});

test("shouldWakeTargets skips harness-only, including directed DMs", () => {
  assert.equal(shouldWakeTargets({ harnessOnly: true }), false);
  assert.equal(shouldWakeTargets({ harnessOnly: true, botId: "chef" }), false);
  assert.equal(shouldWakeTargets({ harnessOnly: false, botId: "chef" }), true);
  assert.equal(shouldWakeTargets({ harnessOnly: false }), true);
});

test("shouldPostUserMessage never writes a DM or a harness-only echo", () => {
  assert.equal(shouldPostUserMessage({ harnessOnly: true }), false);
  assert.equal(shouldPostUserMessage({ harnessOnly: false, botId: "chef" }), false);
  assert.equal(shouldPostUserMessage({ harnessOnly: false }), true);
  assert.equal(shouldPostUserMessage({ harnessOnly: false, groupId: "grp_app" }), true);
});

test("shouldLogAssignment stays off Team when the user thread is a DM", () => {
  assert.equal(shouldLogAssignment(dm), false);
  assert.equal(shouldLogAssignment(team), true);
  assert.equal(shouldLogAssignment(group), true);
});

test("persistPlan: Team user writes nothing to a bot DM", () => {
  assert.deepEqual(persistPlan({ source: "user", dm: false }), {
    incomingHop: false,
    userMessage: false,
    assistant: false,
    assistantSource: "bot",
  });
});

test("persistPlan: user DM keeps the human turn on that bot", () => {
  assert.deepEqual(persistPlan({ source: "user", dm: true }), {
    incomingHop: false,
    userMessage: true,
    assistant: true,
    assistantSource: "bot",
  });
});

test("persistPlan: hop persist is inspect on the target, Team or DM", () => {
  assert.deepEqual(persistPlan({ source: "handoff", dm: false }), {
    incomingHop: true,
    userMessage: false,
    assistant: true,
    assistantSource: "handoff",
  });
  assert.deepEqual(persistPlan({ source: "handoff", dm: true }), {
    incomingHop: true,
    userMessage: false,
    assistant: true,
    assistantSource: "handoff",
  });
});

test("persistPlan: result relay persists only on the originator DM", () => {
  assert.deepEqual(persistPlan({ source: "result", dm: true }), {
    incomingHop: false,
    userMessage: false,
    assistant: true,
    assistantSource: "bot",
  });
  assert.deepEqual(persistPlan({ source: "result", dm: false }), {
    incomingHop: false,
    userMessage: false,
    assistant: false,
    assistantSource: "bot",
  });
});

test("incomingHopContent restates the assignment for the target DM", () => {
  assert.equal(
    incomingHopContent("Ediel Expert", "vad är senaste status?"),
    "@Ediel Expert: vad är senaste status?",
  );
});

test("one delegated result stands on the thread without a second run", () => {
  const plan = deliveryPlan({
    source: "handoff",
    publicText: "Oförändrat 26 aug.",
    originBotId: "chef",
    botId: "ediel",
    hop: 1,
    userThread: team,
    busThread: team,
  });
  assert.deepEqual(plan, {
    postPublic: true,
    postHop: false,
    relay: false,
    logAssignments: true,
    continueHandoffs: true,
  });
});

test("a fan-out relays once, and only after the last branch lands", () => {
  const branch = {
    source: "handoff" as const,
    publicText: "Meter side is fine.",
    originBotId: "chef",
    botId: "ediel",
    hop: 1,
    userThread: team,
    busThread: team,
    branches: 2,
  };
  assert.equal(deliveryPlan({ ...branch, joinDone: false }).relay, false);
  assert.equal(deliveryPlan({ ...branch, joinDone: false }).postPublic, true);

  const last = deliveryPlan({ ...branch, joinDone: true });
  assert.equal(last.relay, true);
  assert.equal(last.continueHandoffs, false);
});

test("an answer to a question goes back to the asker, not into the user thread", () => {
  const plan = deliveryPlan({
    source: "question",
    publicText: "Register 1-8-2.",
    originBotId: "chef",
    botId: "ediel",
    hop: 1,
    userThread: team,
    busThread: team,
  });
  assert.deepEqual(plan, {
    postPublic: false,
    postHop: true,
    relay: true,
    logAssignments: true,
    continueHandoffs: false,
  });
});

test("an answering bot does not start work of its own", () => {
  const plan = deliveryPlan({
    source: "question",
    publicText: "I do not know.",
    originBotId: "chef",
    botId: "ediel",
    hop: 1,
    userThread: team,
    busThread: team,
  });
  assert.equal(plan.continueHandoffs, false);
});

test("deliveryPlan posts a hop result on a group, not onto Team", () => {
  const plan = deliveryPlan({
    source: "handoff",
    publicText: "Klart i gruppen.",
    originBotId: "chef",
    botId: "dev",
    hop: 1,
    userThread: group,
    busThread: group,
  });
  assert.equal(plan.postPublic, true);
  assert.equal(plan.relay, false);
  assert.equal(plan.logAssignments, true);
  assert.equal(plan.continueHandoffs, true);
});

test("deliveryPlan writes a hop result onto the originator DM and does not log Team", () => {
  const plan = deliveryPlan({
    source: "handoff",
    publicText: "Oförändrat 26 aug.",
    originBotId: "chef",
    botId: "ediel",
    hop: 1,
    userThread: dm,
    busThread: dm,
  });
  assert.deepEqual(plan, {
    postPublic: true,
    postHop: false,
    relay: false,
    logAssignments: false,
    continueHandoffs: true,
  });
});

test("deliveryPlan posts a Team user reply as klartext and may still assign", () => {
  const plan = deliveryPlan({
    source: "user",
    publicText: "Jag tar det.",
    originBotId: "chef",
    botId: "chef",
    hop: 0,
    userThread: team,
    busThread: team,
  });
  assert.deepEqual(plan, {
    postPublic: true,
    postHop: false,
    relay: false,
    logAssignments: true,
    continueHandoffs: true,
  });
});

test("deliveryPlan does not postLog a user/result DM — persist owns that bubble", () => {
  const userDm = deliveryPlan({
    source: "user",
    publicText: "Hej.",
    originBotId: "chef",
    botId: "chef",
    hop: 0,
    userThread: dm,
    busThread: dm,
  });
  assert.equal(userDm.postPublic, false);
  assert.equal(userDm.continueHandoffs, true);
  assert.equal(userDm.logAssignments, false);

  const resultDm = deliveryPlan({
    source: "result",
    publicText: "Ediel sa att det är oförändrat.",
    originBotId: "chef",
    botId: "chef",
    hop: 2,
    userThread: dm,
    busThread: dm,
  });
  assert.deepEqual(resultDm, {
    postPublic: false,
    postHop: false,
    relay: false,
    logAssignments: false,
    continueHandoffs: false,
  });
});

test("deliveryPlan posts the originator relay onto Team, then stops", () => {
  const plan = deliveryPlan({
    source: "result",
    publicText: "Ediel sa att det är oförändrat.",
    originBotId: "chef",
    botId: "chef",
    hop: 2,
    userThread: team,
    busThread: team,
  });
  assert.deepEqual(plan, {
    postPublic: true,
    postHop: false,
    relay: false,
    logAssignments: false,
    continueHandoffs: false,
  });
});

test("deliveryPlan does not invent a result when the hop has no public text", () => {
  const plan = deliveryPlan({
    source: "handoff",
    publicText: "",
    originBotId: "chef",
    botId: "ediel",
    hop: 1,
    userThread: team,
    busThread: team,
  });
  assert.deepEqual(plan, {
    postPublic: false,
    postHop: false,
    relay: false,
    logAssignments: true,
    continueHandoffs: true,
  });
});

test("deliveryPlan stops chaining after max hops when there is no result to relay", () => {
  const plan = deliveryPlan({
    source: "handoff",
    publicText: "",
    originBotId: "chef",
    botId: "ediel",
    hop: 3,
    userThread: team,
    busThread: team,
  });
  assert.equal(plan.continueHandoffs, false);
  assert.equal(plan.relay, false);
});

test("outgoingHandoffs never pings self, sender, or the originator", () => {
  const roster = [
    { id: "chef", name: "Chief" },
    { id: "ediel", name: "Ediel Expert" },
    { id: "dev", name: "Dev" },
  ];
  const found = outgoingHandoffs("@Chief: här är svaret\n@Dev: ta nästa steg", roster, {
    selfId: "ediel",
    skipIds: ["chef"],
  });
  assert.deepEqual(
    found.map((item) => item.name),
    ["Dev"],
  );
});

test("outgoingHandoffs matches a spaced roster name", () => {
  const roster = [
    { id: "chef", name: "Chief" },
    { id: "ediel", name: "Ediel Expert" },
  ];
  const found = outgoingHandoffs("@Ediel Expert: status", roster, { skipIds: ["chef"] });
  assert.deepEqual(
    found.map((item) => item.botId),
    ["ediel"],
  );
});

test("user send on Team with a spaced mention wakes that bot, not the fallback", () => {
  const mentioned = parseHandoffs("@Ediel Expert: status", [
    { id: "chef", name: "Chief" },
    { id: "ediel", name: "Ediel Expert" },
  ]).map((item) => item.botId);
  assert.deepEqual(mentioned, ["ediel"]);
  assert.equal(shouldWakeTargets({ harnessOnly: false }), true);
  assert.equal(shouldPostUserMessage({ harnessOnly: false }), true);
});

test("directed DM does not auto-wake extra mentions", () => {
  assert.equal(shouldWakeTargets({ harnessOnly: false, botId: "chef" }), true);
  assert.equal(shouldPostUserMessage({ harnessOnly: false, botId: "chef" }), false);
});

test("deliveryPlan leaves an empty hop on inspect and does not invent klartext", () => {
  const plan = deliveryPlan({
    source: "handoff",
    publicText: "",
    originBotId: "chef",
    botId: "ediel",
    hop: 1,
    userThread: dm,
    busThread: dm,
  });
  assert.deepEqual(plan, {
    postPublic: false,
    postHop: false,
    relay: false,
    logAssignments: false,
    continueHandoffs: true,
  });
});

test("@alla is a real assignment, not a harness-only command", () => {
  assert.equal(isHarnessOnlyUserText("@alla: synka status"), false);
  assert.equal(shouldWakeTargets({ harnessOnly: false }), true);
  assert.equal(shouldPostUserMessage({ harnessOnly: false }), true);
});

test("a result wake never logs new assignments even if the model outputs @Name:", () => {
  const plan = deliveryPlan({
    source: "result",
    publicText: "Klart.\n@Dev: gör mer",
    originBotId: "chef",
    botId: "chef",
    hop: 2,
    userThread: team,
    busThread: team,
  });
  assert.equal(plan.logAssignments, false);
  assert.equal(plan.continueHandoffs, false);
  assert.equal(plan.relay, false);
  assert.equal(plan.postPublic, true);
});

test("a question may go back to the sender — an assignment may not", () => {
  const roster = [
    { id: "chef", name: "Chief" },
    { id: "ediel", name: "Ediel Expert" },
  ];
  const scope = { selfId: "ediel", skipIds: ["chef", "chef"] };
  assert.deepEqual(outgoingHandoffs("@Chief: do it yourself", roster, scope), []);
  const [question] = outgoingHandoffs("@Chief?: which meter is this", roster, scope);
  assert.equal(question.name, "Chief");
  assert.equal(question.kind, "question");
  assert.deepEqual(outgoingHandoffs("@Ediel Expert?: talking to myself", roster, scope), []);
});

test("a wake that never happens is explained on the bus", () => {
  assert.equal(
    hopLimitNotice(["Ediel Expert"]),
    "Hop limit 3 reached — Ediel Expert was not woken. Send from this thread to carry it on.",
  );
  assert.match(hopLimitNotice(["Ada", "Bo"]), /Ada and Bo were not woken/);
  assert.equal(hopLimitNotice([]), "");
});

test("an assignment to a name nobody has is reported, not swallowed", () => {
  assert.match(unknownNameNotice(["Analyst"]), /No teammate named Analyst/);
  assert.match(unknownNameNotice(["Analyst"]), /@new Analyst: role/);
  assert.match(unknownNameNotice(["Ada", "Bo", "Cy"]), /Ada, Bo and Cy/);
  assert.equal(unknownNameNotice([]), "");
});

test("an empty wake says so instead of vanishing", () => {
  assert.equal(emptyWakeNotice("Ada"), "Nothing was sent to Ada — the message had no text.");
});

test("a teammate who exists but is not in the group is named as such", () => {
  assert.equal(
    offThreadNotice(["Ada"], "Grid"),
    "Ada is not in Grid — that line woke no one. Add them with @team Grid +: Ada.",
  );
  assert.match(offThreadNotice(["Ada", "Bo"]), /Ada and Bo are not in this group/);
  assert.equal(offThreadNotice([]), "");
});
