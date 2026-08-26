import assert from "node:assert/strict";
import { test } from "node:test";
import {
  destinationGroupName,
  isGroupCommandLine,
  parseGroupCommands,
  targetedGroupName,
} from "./groups.ts";

test("parseGroupCommands reads @team App: A, B", () => {
  const found = parseGroupCommands("@team App: Apputvecklare, Tester, Chefen");
  assert.deepEqual(found, [
    {
      kind: "create",
      name: "App",
      members: ["Apputvecklare", "Tester", "Chefen"],
    },
  ]);
});

test("parseGroupCommands accepts @grupp", () => {
  const found = parseGroupCommands("@grupp Marketing: Writer, Chefen");
  assert.deepEqual(found, [
    { kind: "create", name: "Marketing", members: ["Writer", "Chefen"] },
  ]);
});

test("parseGroupCommands reads @team App +: Writer", () => {
  assert.deepEqual(parseGroupCommands("@team App +: Writer"), [
    { kind: "add", name: "App", members: ["Writer"] },
  ]);
  assert.deepEqual(parseGroupCommands("@grupp App+: Writer"), [
    { kind: "add", name: "App", members: ["Writer"] },
  ]);
});

test("parseGroupCommands treats @team App as a target", () => {
  const found = parseGroupCommands("@team App\n@Writer: do X");
  assert.deepEqual(found, [{ kind: "target", name: "App" }]);
  assert.equal(destinationGroupName(found), "App");
  assert.equal(targetedGroupName(found), "App");
});

test("targetedGroupName ignores create and add", () => {
  assert.equal(targetedGroupName(parseGroupCommands("@team App: A, B")), undefined);
  assert.equal(targetedGroupName(parseGroupCommands("@team App +: Writer")), undefined);
  assert.equal(
    targetedGroupName(parseGroupCommands("@team App: A, B\n@team App\n@Writer: do X")),
    "App",
  );
});

test("parseGroupCommands ignores @team broadcast and mid-sentence text", () => {
  assert.deepEqual(parseGroupCommands("@team"), []);
  assert.deepEqual(parseGroupCommands("@team: synka status"), []);
  assert.deepEqual(parseGroupCommands("@alla: synka"), []);
  assert.deepEqual(parseGroupCommands("please use @team App: Writer"), []);
});

test("parseGroupCommands skips reserved and empty names", () => {
  assert.deepEqual(parseGroupCommands("@team team: Writer"), []);
  assert.deepEqual(parseGroupCommands("@grupp alla: Writer"), []);
  assert.deepEqual(parseGroupCommands("@team : Writer"), []);
});

test("isGroupCommandLine is true only for group lines", () => {
  assert.equal(isGroupCommandLine("@team App: A, B"), true);
  assert.equal(isGroupCommandLine("@grupp App +: Writer"), true);
  assert.equal(isGroupCommandLine("@team App"), true);
  assert.equal(isGroupCommandLine("@team: synka"), false);
  assert.equal(isGroupCommandLine("@Writer: do X"), false);
});

test("a fenced @team line does not create a group", () => {
  const text = ["Example:", "```", "@team Grid: Ada, Bo", "```"].join("\n");
  assert.deepEqual(parseGroupCommands(text), []);
  assert.equal(parseGroupCommands("@team Grid: Ada, Bo").length, 1);
});
