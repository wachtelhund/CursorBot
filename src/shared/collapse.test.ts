import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDmRows,
  bundleHandoffs,
  handoffRecipientIds,
  hopsFromLog,
  isHandoffMessage,
  isInspectMessage,
  isRosterNotice,
  uniqueKeys,
} from "./collapse.ts";

test("isHandoffMessage is true for assignment pings and toBotIds", () => {
  assert.equal(
    isHandoffMessage({ from: "bot", content: "@Apptestare: stå upp — du är QA." }),
    true,
  );
  assert.equal(
    isHandoffMessage({ from: "bot", content: "Klart.", toBotIds: ["bot_2"] }),
    true,
  );
  assert.equal(isHandoffMessage({ from: "user", content: "@Apptestare: stå upp" }), false);
  assert.equal(
    isHandoffMessage({
      from: "bot",
      content: "Klart. Apptestare är tillagd.\n@Apptestare: stå upp",
    }),
    false,
  );
  assert.equal(isHandoffMessage({ from: "bot", content: "Chefen skapade App" }), false);
  assert.equal(
    isHandoffMessage({
      from: "bot",
      content: "@ny Apptestare: QA\n@team App: Utvecklare, Apptestare\n@Apptestare: stå upp",
    }),
    true,
  );
});

test("bundleHandoffs keeps user and result bubbles, collapses assignment runs", () => {
  const items = [
    { id: "u1", user: true, handoff: false },
    { id: "h1", user: false, handoff: true },
    { id: "h2", user: false, handoff: true },
    { id: "r1", user: false, handoff: false },
    { id: "h3", user: false, handoff: true },
  ];
  const grouped = bundleHandoffs(
    items,
    (item) => item.user,
    (item) => item.handoff,
  );
  assert.deepEqual(
    grouped.map((segment) =>
      segment.kind === "item" ? segment.item.id : segment.items.map((item) => item.id),
    ),
    ["u1", ["h1", "h2"], "r1", ["h3"]],
  );
});

test("uniqueKeys keeps first-seen participants", () => {
  assert.deepEqual(
    uniqueKeys(
      [{ name: "Chefen" }, { name: "Apptestare" }, { name: "Chefen" }],
      (item) => item.name,
    ),
    ["Chefen", "Apptestare"],
  );
});

const roster = [
  { id: "chef", name: "Chefen" },
  { id: "qa", name: "Apptestare" },
  { id: "dev", name: "Utvecklare" },
];

test("handoffRecipientIds prefers toBotIds over the speaker", () => {
  assert.deepEqual(
    handoffRecipientIds(
      [{ toBotIds: ["qa"], content: "@Apptestare: stå upp" }],
      roster,
    ),
    ["qa"],
  );
});

test("handoffRecipientIds unions recipients across a bundle", () => {
  assert.deepEqual(
    handoffRecipientIds(
      [
        { toBotIds: ["qa"], content: "@Apptestare: kolla" },
        { toBotIds: ["dev"], content: "@Utvecklare: fixa" },
      ],
      roster,
    ),
    ["qa", "dev"],
  );
});

test("handoffRecipientIds parses @Name: when toBotIds is missing", () => {
  assert.deepEqual(
    handoffRecipientIds([{ content: "@Apptestare: stå upp" }], roster),
    ["qa"],
  );
});

test("handoffRecipientIds does not treat the speaker as a recipient", () => {
  assert.equal(
    handoffRecipientIds([{ content: "@Apptestare: stå upp" }], roster).includes("chef"),
    false,
  );
});

test("handoffRecipientIds falls back to @Name: when some items lack toBotIds", () => {
  assert.deepEqual(
    handoffRecipientIds(
      [
        { toBotIds: ["qa"], content: "@Apptestare: kolla" },
        { content: "@Utvecklare: fixa" },
      ],
      roster,
    ),
    ["qa", "dev"],
  );
});

test("handoffRecipientIds uses the reply author when the assignment is missing", () => {
  assert.deepEqual(
    handoffRecipientIds([{ botId: "qa", content: "Hej Chefen, Apptestare här." }], roster),
    ["qa"],
  );
});

test("isRosterNotice matches spawn and group echoes only", () => {
  assert.equal(isRosterNotice("Chefen skapade App"), true);
  assert.equal(isRosterNotice("Du la till Apptestare i App"), true);
  assert.equal(isRosterNotice("Jag skapade en plan för releasen."), false);
});

test("isInspectMessage hides assignments, handoff replies, and roster echoes", () => {
  assert.equal(isInspectMessage({ from: "user", content: "@Apptestare: kolla" }), false);
  assert.equal(
    isInspectMessage({ from: "bot", content: "@Apptestare: stå upp", toBotIds: ["qa"] }),
    true,
  );
  assert.equal(
    isInspectMessage({ from: "bot", content: "Hej Chefen, Apptestare här.", source: "handoff" }),
    true,
  );
  assert.equal(isInspectMessage({ from: "bot", content: "Chefen skapade App" }), true);
  assert.equal(
    isInspectMessage({ from: "bot", content: "Här är QA-rapporten." }),
    false,
  );
});

test("isInspectMessage treats a reply after @Name: as inspect, not a user bubble", () => {
  const previous = [
    { from: "bot", botId: "chef", content: "Jag tar QA.", toBotIds: undefined },
    { from: "bot", botId: "chef", content: "@Apptestare: stå upp", toBotIds: ["qa"] },
  ];
  assert.equal(
    isInspectMessage(
      { from: "bot", botId: "qa", content: "Hej Chefen, Apptestare här." },
      previous,
    ),
    true,
  );
  assert.equal(
    isInspectMessage({ from: "bot", botId: "chef", content: "Klart för dig." }, [
      { from: "user", content: "Hur går det?" },
    ]),
    false,
  );
});

test("hopsFromLog returns the assignment and the target reply", () => {
  const hops = hopsFromLog(
    [
      {
        id: "a",
        from: "bot",
        botId: "chef",
        content: "@Apptestare: kolla",
        toBotIds: ["qa"],
        createdAt: "2026-08-26T10:00:01Z",
      },
      {
        id: "b",
        from: "bot",
        botId: "qa",
        content: "Hej Chefen.",
        source: "handoff",
        createdAt: "2026-08-26T10:00:02Z",
      },
      {
        id: "c",
        from: "bot",
        botId: "dev",
        content: "Annat hop.",
        source: "handoff",
        createdAt: "2026-08-26T10:00:03Z",
      },
    ],
    { speakerId: "chef", since: "2026-08-26T10:00:00Z" },
  );
  assert.deepEqual(
    hops.map((item) => item.id),
    ["a", "b"],
  );
});

test("buildDmRows keeps a blank DM assistant inspectable via team hops", () => {
  const rows = buildDmRows(
    [
      {
        id: "u1",
        role: "user",
        content: "skriv till honom igen",
        createdAt: "2026-08-26T09:29:00Z",
      },
      {
        id: "a1",
        role: "assistant",
        content: "",
        createdAt: "2026-08-26T09:29:01Z",
      },
    ],
    {
      speakerId: "chef",
      thinking: false,
      team: [
        {
          id: "hop-a",
          from: "bot",
          botId: "chef",
          name: "Chefen",
          content: "@Utvecklare: hej igen",
          toBotIds: ["dev"],
          source: "handoff",
          createdAt: "2026-08-26T09:29:02Z",
        },
        {
          id: "hop-b",
          from: "bot",
          botId: "dev",
          name: "Utvecklare",
          content: "Hej Chefen.",
          source: "handoff",
          createdAt: "2026-08-26T09:29:03Z",
        },
      ],
    },
  );
  assert.deepEqual(
    rows.map((row) => ({ id: row.id, inspect: row.inspect, fromPeer: row.fromPeer })),
    [
      { id: "u1", inspect: false, fromPeer: false },
      { id: "hop-a", inspect: true, fromPeer: false },
      { id: "hop-b", inspect: true, fromPeer: true },
    ],
  );
});

test("buildDmRows shows assignment-only DM text as inspect, not a klartext bubble", () => {
  const rows = buildDmRows(
    [
      {
        id: "u1",
        role: "user",
        content: "Hälsa på @Utvecklare",
        createdAt: "2026-08-26T09:28:00Z",
      },
      {
        id: "a1",
        role: "assistant",
        content: "@Utvecklare: hej från Chefen",
        createdAt: "2026-08-26T09:28:01Z",
      },
    ],
    {
      speakerId: "chef",
      thinking: false,
      team: [
        {
          id: "hop-a",
          from: "bot",
          botId: "chef",
          name: "Chefen",
          content: "@Utvecklare: hej från Chefen",
          toBotIds: ["dev"],
          source: "handoff",
          createdAt: "2026-08-26T09:28:02Z",
        },
      ],
    },
  );
  assert.deepEqual(
    rows.map((row) => ({ id: row.id, inspect: row.inspect, content: row.content })),
    [
      { id: "u1", inspect: false, content: "Hälsa på @Utvecklare" },
      { id: "a1", inspect: true, content: "@Utvecklare: hej från Chefen" },
    ],
  );
});

test("buildDmRows keeps mixed public text as a bubble and still attaches hops", () => {
  const rows = buildDmRows(
    [
      {
        id: "u1",
        role: "user",
        content: "skickade du något då?",
        createdAt: "2026-08-26T09:28:10Z",
      },
      {
        id: "a1",
        role: "assistant",
        content: "Ja. Första turen gick hälsningen ut.\n@Utvecklare: hej från Chefen",
        createdAt: "2026-08-26T09:28:11Z",
      },
    ],
    {
      speakerId: "chef",
      thinking: false,
      team: [
        {
          id: "hop-a",
          from: "bot",
          botId: "chef",
          name: "Chefen",
          content: "@Utvecklare: hej från Chefen",
          toBotIds: ["dev"],
          createdAt: "2026-08-26T09:28:12Z",
        },
      ],
    },
  );
  assert.deepEqual(
    rows.map((row) => ({ id: row.id, inspect: row.inspect, content: row.content })),
    [
      { id: "u1", inspect: false, content: "skickade du något då?" },
      { id: "a1", inspect: false, content: "Ja. Första turen gick hälsningen ut." },
      { id: "hop-a", inspect: true, content: "@Utvecklare: hej från Chefen" },
    ],
  );
});
