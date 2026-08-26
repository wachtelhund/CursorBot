import assert from "node:assert/strict";
import test from "node:test";
import {
  correctsActive,
  enqueue,
  mergeText,
  sameLane,
  takeNext,
  threadKeyOf,
  type QueueEntry,
} from "./queue.ts";

function entry(
  text: string,
  overrides: Partial<QueueEntry<string>> & { key?: Partial<QueueEntry<string>["key"]> } = {},
): QueueEntry<string> {
  return {
    key: {
      botId: "ada",
      threadKey: "team",
      source: "user",
      ...overrides.key,
    },
    mode: overrides.mode ?? "queue",
    text,
    payload: overrides.payload ?? text,
  };
}

test("three quick human sends become one run, not three", () => {
  let list: QueueEntry<string>[] = [];
  for (const text of ["first", "second", "third"]) {
    list = enqueue(list, entry(text)).list;
  }
  assert.equal(list.length, 1);
  assert.equal(list[0].text, "first\n\nsecond\n\nthird");
});

test("steering jumps ahead of everything queued", () => {
  let list: QueueEntry<string>[] = [];
  list = enqueue(list, entry("queued work")).list;
  list = enqueue(list, entry("urgent", { mode: "steer" })).list;
  assert.deepEqual(
    list.map((item) => item.text),
    ["urgent", "queued work"],
  );
});

test("two steers keep their order in front of the queue", () => {
  let list: QueueEntry<string>[] = [];
  list = enqueue(list, entry("queued")).list;
  list = enqueue(list, entry("urgent one", { mode: "steer" })).list;
  list = enqueue(list, entry("urgent two", { mode: "steer" })).list;
  assert.deepEqual(
    list.map((item) => item.text),
    ["urgent one", "urgent two", "queued"],
  );
});

test("a queued wake never merges into a steer that is waiting to go first", () => {
  let list: QueueEntry<string>[] = [];
  list = enqueue(list, entry("urgent", { mode: "steer" })).list;
  const result = enqueue(list, entry("later"));
  assert.equal(result.action, "queued");
  assert.deepEqual(
    result.list.map((item) => item.text),
    ["urgent", "later"],
  );
});

test("wakes from different senders stay separate runs", () => {
  let list: QueueEntry<string>[] = [];
  list = enqueue(list, entry("from chief", { key: { source: "handoff", fromBotId: "chief" } })).list;
  list = enqueue(list, entry("from nova", { key: { source: "handoff", fromBotId: "nova" } })).list;
  assert.equal(list.length, 2);
});

test("a handoff does not merge into a human message", () => {
  let list: QueueEntry<string>[] = [];
  list = enqueue(list, entry("human ask")).list;
  list = enqueue(list, entry("bot ask", { key: { source: "handoff", fromBotId: "chief" } })).list;
  assert.equal(list.length, 2);
});

test("the same message twice is delivered once", () => {
  let list: QueueEntry<string>[] = [];
  list = enqueue(list, entry("run the tests")).list;
  const again = enqueue(list, entry("run the tests"));
  assert.equal(again.action, "duplicate");
  assert.equal(again.list.length, 1);
});

test("long assignments that share an opening are both delivered", () => {
  const shared = "Check the P1 parser end to end. ".repeat(12);
  let list: QueueEntry<string>[] = [];
  list = enqueue(list, entry(`${shared}Then benchmark it.`, { key: { source: "handoff", fromBotId: "chief" } })).list;
  list = enqueue(list, entry(`${shared}Then document it.`, { key: { source: "handoff", fromBotId: "nova" } })).list;
  assert.equal(list.length, 2);
});

test("mergeText keeps the earlier text when the later one repeats it", () => {
  assert.equal(mergeText("do x", "do x"), "do x");
  assert.equal(mergeText("do x and y", "do x"), "do x and y");
  assert.equal(mergeText("", "do x"), "do x");
  assert.equal(mergeText("do x", ""), "do x");
});

test("a correction to the task in progress is recognised", () => {
  const active = { botId: "ada", threadKey: "team", source: "handoff", taskId: "t1" };
  assert.equal(correctsActive(active, { ...active, taskId: "t1" }), true);
  assert.equal(correctsActive(active, { ...active, taskId: "t2" }), false);
  assert.equal(correctsActive(undefined, { ...active }), false);
  assert.equal(correctsActive(active, { ...active, botId: "bo" }), false);
});

test("threadKeyOf separates a DM, a group, and Team", () => {
  assert.equal(threadKeyOf({ botId: "ada", dm: true }), "dm:ada");
  assert.equal(threadKeyOf({ botId: "ada", groupId: "g1" }), "group:g1");
  assert.equal(threadKeyOf({ botId: "ada" }), "team");
});

test("sameLane ignores the task id so follow-ups can merge", () => {
  const a = { botId: "ada", threadKey: "team", source: "user", taskId: "t1" };
  const b = { botId: "ada", threadKey: "team", source: "user", taskId: "t2" };
  assert.equal(sameLane(a, b), true);
});

test("takeNext pops the front and leaves the rest", () => {
  const list = [entry("a"), entry("b")];
  const { entry: next, list: rest } = takeNext(list);
  assert.equal(next?.text, "a");
  assert.equal(rest.length, 1);
  assert.deepEqual(takeNext([]).list, []);
});

test("a merge reports the entry it folded in, so its task can be released", () => {
  const first = entry("first", { key: { taskId: "t1" } });
  const result = enqueue([first], entry("second", { key: { taskId: "t2" } }));
  assert.equal(result.action, "merged");
  assert.equal(result.replaced?.key.taskId, "t1");
  assert.equal(result.list[0].text, "first\n\nsecond");
  assert.equal(result.list[0].key.taskId, "t1");
});
