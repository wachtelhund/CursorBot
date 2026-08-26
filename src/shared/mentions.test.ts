import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterRoster,
  isAssignmentPing,
  isRoutingLine,
  matchRosterMention,
  mentionQueryAt,
  parseHandoffs,
  publicBotText,
  routingText,
  stripRoutingLines,
  unmatchedMentions,
} from "./mentions.ts";

const roster = [
  { id: "1", name: "Chief" },
  { id: "2", name: "Research" },
  { id: "3", name: "Writer" },
];

const swedish = [
  { id: "c", name: "Chefen" },
  { id: "u", name: "Utvecklare" },
];

test("parseHandoffs finds exact @Name lines", () => {
  const found = parseHandoffs(
    "@Research: hitta källor om Zap\n@Writer: vänta\n- @Chief: review",
    roster,
  );
  assert.deepEqual(
    found.map((item) => [item.name, item.body]),
    [
      ["Research", "hitta källor om Zap"],
      ["Writer", "vänta"],
      ["Chief", "review"],
    ],
  );
});

test("parseHandoffs accepts @Name body without a colon", () => {
  const found = parseHandoffs("@Utvecklare hej från Chefen", swedish);
  assert.deepEqual(
    found.map((item) => [item.name, item.body]),
    [["Utvecklare", "hej från Chefen"]],
  );
});

test("parseHandoffs ignores mid-sentence @Name", () => {
  assert.deepEqual(parseHandoffs("Kan du säga hej till @Utvecklare", swedish), []);
  assert.deepEqual(parseHandoffs("säg hej till @Utvecklare tack", swedish), []);
  assert.deepEqual(parseHandoffs("Please ask @Research: hitta källor", roster), []);
});

test("parseHandoffs accepts @Name: request on its own line", () => {
  const found = parseHandoffs(
    "@Utvecklare: hej från Chefen. Välkommen in, säg till när du är redo.",
    swedish,
  );
  assert.deepEqual(
    found.map((item) => [item.name, item.body]),
    [["Utvecklare", "hej från Chefen. Välkommen in, säg till när du är redo."]],
  );
});

test("parseHandoffs expands @alla only as an assignment", () => {
  const colon = parseHandoffs("@alla: synka status", roster);
  assert.equal(colon.length, 3);
  assert.equal(colon[0]?.body, "synka status");

  const lineStart = parseHandoffs("@alla", roster);
  assert.equal(lineStart.length, 3);

  assert.equal(parseHandoffs("hej @alla, synka", roster).length, 0);
  assert.equal(parseHandoffs("ping @all later", roster).length, 0);
});

test("parseHandoffs ignores unknown names", () => {
  assert.equal(parseHandoffs("@Nope: hej", roster).length, 0);
});

test("parseHandoffs does not treat @ny or @new as teammates", () => {
  const withNy = [...roster, { id: "9", name: "ny" }];
  assert.equal(parseHandoffs("@ny Writer: Drafts PRs", withNy).length, 0);
  assert.equal(parseHandoffs("@new Writer: Drafts PRs", roster).length, 0);
});

test("parseHandoffs still broadcasts @team: but not @team App", () => {
  assert.equal(parseHandoffs("@team: synka status", roster).length, 3);
  assert.equal(parseHandoffs("@team", roster).length, 3);
  assert.equal(parseHandoffs("@team App: Writer, Chief", roster).length, 0);
  assert.equal(parseHandoffs("@grupp App: Writer, Chief", roster).length, 0);
  assert.equal(parseHandoffs("@team App\n@Writer: do X", roster).length, 1);
});

test("parseHandoffs ignores Chefens markdown roster", () => {
  const paste = `Appteamet är uppe.

**Team**
- **Chefen** — jag, leder. https://cursor.com/agents/bc-91172475-a2a5-429a-8483-214bcf1d56ab
- **Apputvecklare** — online. https://cursor.com/agents/bc-ab87c7bd-78ca-5346-b2d9-86e5a06acedd`;
  const team = [
    { id: "1", name: "Chefen" },
    { id: "2", name: "Apputvecklare" },
  ];
  assert.equal(parseHandoffs(paste, team).length, 0);
});

test("parseHandoffs matches a spaced name on its own line", () => {
  const spaced = [
    { id: "c", name: "Chief" },
    { id: "e", name: "Ediel Expert" },
  ];
  assert.deepEqual(
    parseHandoffs("@Ediel Expert: vad är senaste status?", spaced).map((item) => [
      item.name,
      item.body,
    ]),
    [["Ediel Expert", "vad är senaste status?"]],
  );
  assert.deepEqual(
    parseHandoffs("@Ediel Expert vad är senaste status?", spaced).map((item) => [
      item.name,
      item.body,
    ]),
    [["Ediel Expert", "vad är senaste status?"]],
  );
  assert.deepEqual(
    parseHandoffs("@Ediel Expert", spaced).map((item) => item.name),
    ["Ediel Expert"],
  );
});

test("parseHandoffs uses a unique prefix when only one name fits", () => {
  const spaced = [{ id: "e", name: "Ediel Expert" }];
  assert.equal(parseHandoffs("@Ediel: status", spaced)[0]?.name, "Ediel Expert");
  assert.equal(parseHandoffs("@Ediel status", spaced)[0]?.name, "Ediel Expert");
  assert.equal(parseHandoffs("@ediel", spaced)[0]?.name, "Ediel Expert");
});

test("parseHandoffs does not invent a short name when two Ediel* bots exist", () => {
  const both = [
    { id: "a", name: "Ediel" },
    { id: "b", name: "Ediel Expert" },
  ];
  assert.equal(parseHandoffs("@Ediel: status", both)[0]?.name, "Ediel");
  assert.equal(parseHandoffs("@Ediel Expert: status", both)[0]?.name, "Ediel Expert");
  assert.equal(parseHandoffs("@Edi: status", both).length, 0);
});

test("parseHandoffs still ignores mid-sentence spaced mentions", () => {
  const spaced = [{ id: "e", name: "Ediel Expert" }];
  assert.deepEqual(parseHandoffs("fråga @Ediel Expert vad senaste status är", spaced), []);
  assert.deepEqual(parseHandoffs("Please ask @Ediel Expert: status", spaced), []);
});

test("matchRosterMention prefers the longest existing name", () => {
  const spaced = [
    { id: "c", name: "Chief" },
    { id: "e", name: "Ediel Expert" },
  ];
  const hit = matchRosterMention("Ediel Expert: status", spaced);
  assert.equal(hit?.bot.name, "Ediel Expert");
  assert.equal(hit?.consumed, "Ediel Expert".length);
  assert.equal(matchRosterMention("Nope: hej", spaced), null);
});

test("mentionQueryAt reads the open @token", () => {
  assert.deepEqual(mentionQueryAt("hej @Re", 7), { start: 4, query: "Re" });
  assert.equal(mentionQueryAt("hej @Re sen", 11), null);
});

test("mentionQueryAt keeps a spaced query open while it still prefixes a name", () => {
  const names = ["Chief", "Ediel Expert"];
  assert.deepEqual(mentionQueryAt("hej @Ediel", 10, names), { start: 4, query: "Ediel" });
  assert.deepEqual(mentionQueryAt("hej @Ediel ", 11, names), { start: 4, query: "Ediel " });
  assert.deepEqual(mentionQueryAt("hej @Ediel Ex", 13, names), {
    start: 4,
    query: "Ediel Ex",
  });
  assert.equal(mentionQueryAt("hej @Ediel Expert vad", 21, names), null);
});

test("filterRoster is case-insensitive", () => {
  assert.equal(filterRoster(roster, "chi")[0]?.name, "Chief");
});

test("filterRoster offers a spaced name from a unique prefix", () => {
  const spaced = [
    { id: "c", name: "Chief" },
    { id: "e", name: "Ediel Expert" },
  ];
  assert.equal(filterRoster(spaced, "Ediel")[0]?.name, "Ediel Expert");
  assert.equal(filterRoster(spaced, "ediel ex")[0]?.name, "Ediel Expert");
});

test("stripRoutingLines drops @ny, @team and @Name lines from a bot result", () => {
  const raw = [
    "@ny Apptestare: QA, testar appen",
    "@team App: Utvecklare, Apptestare",
    "@Apptestare: stå upp — du är QA i App-gruppen. Säg hej och att du är redo.",
    "Klart. Apptestare är tillagd, och App-gruppen är Utvecklare + Apptestare.",
  ].join("\n");
  assert.equal(
    stripRoutingLines(raw),
    "Klart. Apptestare är tillagd, och App-gruppen är Utvecklare + Apptestare.",
  );
  assert.equal(isRoutingLine("@Apptestare: stå upp"), true);
  assert.equal(isRoutingLine("Klart. Apptestare är tillagd."), false);
});

test("routingText keeps @Name assignments and drops spawn/group commands", () => {
  assert.equal(
    routingText("Klart.\n@Utvecklare: hej från Chefen\nSkickat."),
    "@Utvecklare: hej från Chefen",
  );
  assert.equal(routingText("@ny Tester: QA\n@team App: Tester\nKlart."), "");
  assert.equal(routingText("Bara klartext."), "");
});

test("publicBotText drops assignment lines and handoff narration", () => {
  assert.equal(
    publicBotText(
      [
        "@Apptestare: hej från Chefen — du är QA i App-gruppen.",
        "Skickat. Jag väntar inte på svar i den här turen.",
      ].join("\n"),
    ),
    "",
  );
  assert.equal(
    publicBotText("@Apptestare: hej\nKlart. Apptestare är tillagd."),
    "Klart. Apptestare är tillagd.",
  );
});

test("isAssignmentPing is true only when every line is an assignment", () => {
  assert.equal(isAssignmentPing("@Apptestare: stå upp — du är QA i App-gruppen."), true);
  assert.equal(isAssignmentPing("@Apptestare"), true);
  assert.equal(
    isAssignmentPing("Klart. Apptestare är tillagd.\n@Apptestare: stå upp"),
    false,
  );
  assert.equal(isAssignmentPing("@ny Apptestare: QA"), false);
  assert.equal(isAssignmentPing("@team App: Utvecklare, Apptestare"), false);
});

test("parseHandoffs ignores assignments a bot only quoted in a fence", () => {
  const text = [
    "Here is how you delegate:",
    "```",
    "@Ada: check the parser",
    "```",
    "@Bo: ship it",
  ].join("\n");
  const found = parseHandoffs(text, [
    { id: "b1", name: "Ada" },
    { id: "b2", name: "Bo" },
  ]);
  assert.deepEqual(
    found.map((item) => item.name),
    ["Bo"],
  );
});

test("a plain @Name assignment queues", () => {
  const [handoff] = parseHandoffs("@Ada: read the meter", [{ id: "b1", name: "Ada" }]);
  assert.equal(handoff.kind, "assign");
  assert.equal(handoff.mode, "queue");
  assert.equal(handoff.body, "read the meter");
});

test("@Name! steers: it cancels the run that bot is in", () => {
  const [handoff] = parseHandoffs("@Ada!: stop, use Modbus not P1", [
    { id: "b1", name: "Ada" },
  ]);
  assert.equal(handoff.kind, "assign");
  assert.equal(handoff.mode, "steer");
  assert.equal(handoff.body, "stop, use Modbus not P1");
});

test("@Name? asks a question and stays queued", () => {
  const [handoff] = parseHandoffs("@Ada?: which register holds the export value", [
    { id: "b1", name: "Ada" },
  ]);
  assert.equal(handoff.kind, "question");
  assert.equal(handoff.mode, "queue");
  assert.equal(handoff.body, "which register holds the export value");
});

test("a question mark inside the body is not a question marker", () => {
  const [handoff] = parseHandoffs("@Ada: can you check the parser?", [
    { id: "b1", name: "Ada" },
  ]);
  assert.equal(handoff.kind, "assign");
  assert.equal(handoff.body, "can you check the parser?");
});

test("markers work without a colon and on a spaced name", () => {
  const roster = [{ id: "b1", name: "Grid Ops" }];
  assert.equal(parseHandoffs("@Grid Ops! drop everything", roster)[0]?.mode, "steer");
  assert.equal(parseHandoffs("@Grid Ops? are you done", roster)[0]?.kind, "question");
});

test("@all! wakes everyone by steering", () => {
  const found = parseHandoffs("@all!: stop what you are doing", [
    { id: "b1", name: "Ada" },
    { id: "b2", name: "Bo" },
  ]);
  assert.equal(found.length, 2);
  assert.ok(found.every((item) => item.mode === "steer"));
  assert.ok(found.every((item) => item.body === "stop what you are doing"));
});

test("unmatchedMentions reports an assignment to a name nobody has", () => {
  const roster = [{ id: "b1", name: "Ada" }];
  assert.deepEqual(unmatchedMentions("@Analyst: pull the numbers", roster), ["Analyst"]);
  assert.deepEqual(unmatchedMentions("@Ada: pull the numbers", roster), []);
});

test("unmatchedMentions stays quiet for spawn, group, and quoted lines", () => {
  const roster = [{ id: "b1", name: "Ada" }];
  assert.deepEqual(unmatchedMentions("@ny Nova: analyst", roster), []);
  assert.deepEqual(unmatchedMentions("@team Grid: Ada", roster), []);
  assert.deepEqual(unmatchedMentions("```\n@Ghost: do x\n```", roster), []);
  assert.deepEqual(unmatchedMentions("@all: do x", roster), []);
});

test("publicBotText keeps a fenced example that looks like routing", () => {
  const text = ["Use:", "```", "@Ada: do x", "```", "@Bo: ship it"].join("\n");
  assert.equal(publicBotText(text), "Use:\n```\n@Ada: do x\n```");
});

test("isAssignmentPing is false when the only @line is quoted", () => {
  assert.equal(isAssignmentPing("```\n@Ada: do x\n```"), false);
  assert.equal(isAssignmentPing("@Ada: do x"), true);
});
