import assert from "node:assert/strict";
import { test } from "node:test";
import {
  backfillSourcesFrom,
  collectBackfillSpawns,
  MAX_SPAWNS,
  parseSpawns,
  shouldSkipSpawn,
} from "./spawn.ts";

test("parseSpawns reads @ny Name: role", () => {
  const found = parseSpawns("@ny Writer: Drafts PRs and docs");
  assert.deepEqual(found, [
    { name: "Writer", role: "Drafts PRs and docs", source: "command" },
  ]);
});

test("parseSpawns accepts @new for English models", () => {
  const found = parseSpawns("@new Reviewer: Reviews pull requests");
  assert.deepEqual(found, [
    { name: "Reviewer", role: "Reviews pull requests", source: "command" },
  ]);
});

test("parseSpawns allows an empty role", () => {
  assert.deepEqual(parseSpawns("@ny Scribe:"), [
    { name: "Scribe", role: "", source: "command" },
  ]);
});

test("parseSpawns requires a name and a colon", () => {
  assert.deepEqual(parseSpawns("@ny"), []);
  assert.deepEqual(parseSpawns("@ny : saknar namn"), []);
  assert.deepEqual(parseSpawns("@ny Writer"), []);
  assert.deepEqual(parseSpawns("@new"), []);
});

test("parseSpawns ignores junk lookalikes", () => {
  assert.deepEqual(parseSpawns("@nya Writer: nej"), []);
  assert.deepEqual(parseSpawns("@newbie Writer: nej"), []);
  assert.deepEqual(parseSpawns("@Writer: gör jobbet"), []);
  assert.deepEqual(parseSpawns("use @new if you want"), []);
});

test("parseSpawns keeps several valid lines and drops reserved names", () => {
  const found = parseSpawns(
    [
      "Jag lägger till hjälp.",
      "@ny Writer: Drafts PRs and docs",
      "@new alla: broadcast",
      "* @new Reviewer: Reviews PRs",
      "@ny Writer: duplicate",
    ].join("\n"),
  );
  assert.deepEqual(found, [
    { name: "Writer", role: "Drafts PRs and docs", source: "command" },
    { name: "Reviewer", role: "Reviews PRs", source: "command" },
  ]);
});

test("parseSpawns caps how many bots one message can add", () => {
  const lines = Array.from(
    { length: MAX_SPAWNS + 3 },
    (_, index) => `@ny Bot${index + 1}: role ${index + 1}`,
  );
  assert.equal(parseSpawns(lines.join("\n")).length, MAX_SPAWNS);
});

test("parseSpawns reads Chefens markdown roster and skips the speaker", () => {
  const paste = `Appteamet är uppe. Båda har stått upp och väntar på första uppgiften.

**Team**
- **Chefen** — jag, leder. https://cursor.com/agents/bc-91172475-a2a5-429a-8483-214bcf1d56ab
- **Apputvecklare** — online, bygger iOS/Android/web/backend. Behöver repo eller spec innan kod. https://cursor.com/agents/bc-ab87c7bd-78ca-5346-b2d9-86e5a06acedd
- **Tester** — online, QA. Inget att testa än. https://cursor.com/agents/bc-254b006e-388e-5103-91b9-a5947669e5a7`;

  const found = parseSpawns(paste, ["Chefen"]);
  assert.deepEqual(
    found.map((item) => [item.name, item.agentId]),
    [
      ["Apputvecklare", "bc-ab87c7bd-78ca-5346-b2d9-86e5a06acedd"],
      ["Tester", "bc-254b006e-388e-5103-91b9-a5947669e5a7"],
    ],
  );
  assert.equal(
    found[0]?.role,
    "online, bygger iOS/Android/web/backend. Behöver repo eller spec innan kod.",
  );
  assert.equal(found[1]?.role, "online, QA. Inget att testa än.");
  assert.equal(
    found.some((item) => item.name === "Chefen"),
    false,
  );
});

test("parseSpawns ignores a bold name without an agent URL", () => {
  assert.deepEqual(parseSpawns("- **Writer** — drafts docs"), []);
});

const chefensPaste = `**Teamet nu (används)**
- **Chefen** — jag, kör. https://cursor.com/agents/bc-91172475-a2a5-429a-8483-214bcf1d56ab
- **Utvecklare** — Developer, idle. https://cursor.com/agents/bc-a8cd19db-1111-2222-3333-444444444444
- **Apputvecklare** — appbygg, idle. https://cursor.com/agents/bc-ab87c7bd-78ca-5346-b2d9-86e5a06acedd
- **Tester** — QA, idle. https://cursor.com/agents/bc-254b006e-388e-5103-91b9-a5947669e5a7

**Kvarlämnat / hjälp (inte i teamet)**
- **Äldre Apputvecklare** från förra Chefen
- Cursor agent docs, Cursor agent launch docs, Summarize Chief transcripts

Alla utom jag är idle. Inget repo inkopplat.`;

test("collectBackfillSpawns creates Apputvecklare and Tester from Chefens paste", () => {
  const found = collectBackfillSpawns(
    [{ speaker: "Chefen", text: chefensPaste }],
    ["Chefen", "Utvecklare"],
  );
  assert.deepEqual(
    found.map((item) => item.name),
    ["Apputvecklare", "Tester"],
  );
  assert.equal(
    found[0]?.agentId,
    "bc-ab87c7bd-78ca-5346-b2d9-86e5a06acedd",
  );
  assert.equal(found[1]?.agentId, "bc-254b006e-388e-5103-91b9-a5947669e5a7");
  assert.equal(
    found.some((item) => item.name === "Chefen"),
    false,
  );
  assert.equal(
    found.some((item) => /docs|Summarize|Äldre/i.test(item.name)),
    false,
  );
});

test("backfillSourcesFrom reads team and recent assistant messages", () => {
  const sources = backfillSourcesFrom({
    team: [{ name: "Chefen", content: chefensPaste }],
    bots: [
      {
        name: "Chefen",
        messages: [
          { role: "user", content: "vilka bottar har vi nu?" },
          { role: "assistant", content: chefensPaste },
        ],
      },
    ],
  });
  const found = collectBackfillSpawns(sources, ["Chefen", "Utvecklare"]);
  assert.deepEqual(
    found.map((item) => item.name),
    ["Apputvecklare", "Tester"],
  );
});

test("collectBackfillSpawns does not revive deleted roster names", () => {
  const found = collectBackfillSpawns(
    [{ speaker: "Chefen", text: chefensPaste }],
    ["Chefen", "Utvecklare"],
    ["Apputvecklare"],
  );
  assert.deepEqual(
    found.map((item) => item.name),
    ["Tester"],
  );
});

test("shouldSkipSpawn lets @ny recreate a deleted name", () => {
  const command = parseSpawns("@ny Apputvecklare: appbygg")[0];
  const roster = parseSpawns(
    "- **Apputvecklare** — appbygg. https://cursor.com/agents/bc-ab87c7bd-78ca-5346-b2d9-86e5a06acedd",
  )[0];
  assert.equal(command?.source, "command");
  assert.equal(shouldSkipSpawn(command!, ["Apputvecklare"]), false);
  assert.equal(shouldSkipSpawn(roster!, ["Apputvecklare"]), true);
});

test("a fenced @new line documents the syntax, it does not create a bot", () => {
  const text = ["To add someone write:", "```", "@new Nova: analyst", "```"].join("\n");
  assert.deepEqual(parseSpawns(text), []);
  assert.deepEqual(
    parseSpawns("@new Nova: analyst").map((spec) => spec.name),
    ["Nova"],
  );
});
