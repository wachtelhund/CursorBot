import assert from "node:assert/strict";
import test from "node:test";
import { DIGEST_HEADER, digestLine, threadDigest } from "./digest.ts";

const roster = [
  { id: "b1", name: "Ada" },
  { id: "b2", name: "Bo" },
];

test("threadDigest gives a woken bot the thread it was pulled into", () => {
  const digest = threadDigest(
    [
      { name: "You", from: "user", content: "The P1 parser drops the export register." },
      { name: "Ada", from: "bot", content: "Reproduced it on a Swedish meter." },
    ],
    { roster },
  );
  assert.equal(
    digest,
    [
      DIGEST_HEADER,
      "You: The P1 parser drops the export register.",
      "Ada: Reproduced it on a Swedish meter.",
    ].join("\n"),
  );
});

test("an assignment row shows who was put on it", () => {
  const line = digestLine(
    { name: "Ada", from: "bot", content: "@Bo: check the register map", source: "handoff", toBotIds: ["b2"] },
    { roster },
  );
  assert.equal(line, "Ada → Bo: @Bo: check the register map");
});

test("roster notices and other system rows stay out of the digest", () => {
  assert.equal(
    digestLine({ name: "Ada", from: "bot", content: "Ada created Bo", source: "system" }),
    null,
  );
});

test("a bot turn is reduced to its public text", () => {
  const line = digestLine({
    name: "Ada",
    from: "bot",
    content: "The register is 1-8-2.\n@Bo: write it up",
  });
  assert.equal(line, "Ada: The register is 1-8-2.");
});

test("a turn that is only routing still shows the delegation", () => {
  const line = digestLine({ name: "Ada", from: "bot", content: "@Bo: write it up" });
  assert.equal(line, "Ada: @Bo: write it up");
});

test("long turns are clipped per line", () => {
  const line = digestLine(
    { name: "Ada", from: "bot", content: "x".repeat(400) },
    { lineBudget: 20 },
  );
  assert.equal(line, `Ada: ${"x".repeat(19)}…`);
});

test("the digest keeps the most recent turns inside the budget", () => {
  const messages = Array.from({ length: 30 }, (_, index) => ({
    name: "Ada",
    from: "bot" as const,
    content: `turn ${index}`,
  }));
  const digest = threadDigest(messages, { limit: 5, budget: 40 });
  const lines = digest.split("\n").slice(1);
  assert.ok(lines.length < 5);
  assert.equal(lines.at(-1), "Ada: turn 29");
});

test("the trigger text is not repeated: it is appended as the task", () => {
  const digest = threadDigest(
    [
      { name: "You", from: "user", content: "earlier context" },
      { name: "You", from: "user", content: "the new ask" },
    ],
    { exclude: "the new ask" },
  );
  assert.equal(digest, `${DIGEST_HEADER}\nYou: earlier context`);
});

test("an empty or all-system thread produces no digest block", () => {
  assert.equal(threadDigest([]), "");
  assert.equal(
    threadDigest([{ name: "Ada", from: "bot", content: "Ada created Bo", source: "system" }]),
    "",
  );
});
