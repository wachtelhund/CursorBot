import assert from "node:assert/strict";
import test from "node:test";
import { isCodeSpanLine, maskQuoted, routableLines, scanFences } from "./fences.ts";

test("scanFences marks the fence lines and everything between them", () => {
  const lines = scanFences("before\n```\n@Ada: do x\n```\nafter");
  assert.deepEqual(
    lines.map((line) => line.fenced),
    [false, true, true, true, false],
  );
});

test("routableLines drops assignments a bot only quoted", () => {
  const text = ["Use this syntax:", "```md", "@Ada: check the parser", "```", "@Bo: ship it"].join(
    "\n",
  );
  assert.deepEqual(routableLines(text), ["Use this syntax:", "@Bo: ship it"]);
});

test("routableLines drops a tilde fence and a whole-line code span", () => {
  const text = ["~~~", "@Ada: nope", "~~~", "`@Bo: also nope`", "@Cy: yes"].join("\n");
  assert.deepEqual(routableLines(text), ["@Cy: yes"]);
});

test("an unclosed fence swallows the rest of the message", () => {
  const text = ["intro", "```", "@Ada: quoted", "@Bo: also quoted"].join("\n");
  assert.deepEqual(routableLines(text), ["intro"]);
});

test("a longer fence closes a shorter one, a shorter one does not", () => {
  const text = ["````", "@Ada: quoted", "```", "@Bo: still quoted", "````", "@Cy: live"].join("\n");
  assert.deepEqual(routableLines(text), ["@Cy: live"]);
});

test("maskQuoted keeps the line count so line-indexed parsers stay aligned", () => {
  const text = "a\n```\n@Ada: x\n```\nb";
  assert.equal(maskQuoted(text), "a\n\n\n\nb");
});

test("isCodeSpanLine only matches a full line", () => {
  assert.equal(isCodeSpanLine("`@Ada: x`"), true);
  assert.equal(isCodeSpanLine("run `npm test` then @Ada: x"), false);
});
