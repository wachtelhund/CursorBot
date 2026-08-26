import assert from "node:assert/strict";
import test from "node:test";
import {
  addBranches,
  closeTask,
  completeBranch,
  dropBranch,
  openTask,
  relayText,
  shouldRelay,
  type TaskTable,
} from "./tasks.ts";

function table(): TaskTable {
  return new Map();
}

test("openTask is idempotent for the same delegating turn", () => {
  const tasks = table();
  const first = openTask(tasks, { taskId: "t1", request: "fix the parser" });
  const second = openTask(tasks, { taskId: "t1", request: "something else" });
  assert.equal(first, second);
  assert.equal(tasks.size, 1);
});

test("a single delegated result does not wake the sender again", () => {
  const tasks = table();
  openTask(tasks, { taskId: "t1", request: "fix it", originBotId: "chief" });
  addBranches(tasks, "t1", 1);
  const { task, done } = completeBranch(tasks, "t1", { name: "Ada", text: "fixed" });
  assert.equal(done, true);
  assert.equal(shouldRelay(task!), false);
});

test("a fan-out waits for every branch, then relays once", () => {
  const tasks = table();
  openTask(tasks, { taskId: "t1", request: "audit the stack", originBotId: "chief" });
  addBranches(tasks, "t1", 2);

  const first = completeBranch(tasks, "t1", { name: "Ada", text: "meter side is fine" });
  assert.equal(first.done, false);

  const second = completeBranch(tasks, "t1", { name: "Bo", text: "cloud path is slow" });
  assert.equal(second.done, true);
  assert.equal(shouldRelay(second.task!), true);
  assert.equal(
    relayText(second.task!),
    ["Results for: audit the stack", "", "Ada:\nmeter side is fine", "", "Bo:\ncloud path is slow"].join(
      "\n",
    ),
  );
});

test("a question always goes back to whoever asked it", () => {
  const tasks = table();
  openTask(tasks, {
    taskId: "t1",
    kind: "question",
    request: "which register?",
    originBotId: "chief",
  });
  addBranches(tasks, "t1", 1);
  const { task } = completeBranch(tasks, "t1", { name: "Ada", text: "1-8-2" });
  assert.equal(shouldRelay(task!), true);
  assert.equal(relayText(task!), "1-8-2");
});

test("a failed branch releases the join instead of hanging it", () => {
  const tasks = table();
  openTask(tasks, { taskId: "t1", request: "audit", originBotId: "chief" });
  addBranches(tasks, "t1", 2);
  completeBranch(tasks, "t1", { name: "Ada", text: "done" });
  const { done, task } = dropBranch(tasks, "t1");
  assert.equal(done, true);
  assert.equal(relayText(task!), "done");
});

test("a task the human owns never relays to a bot", () => {
  const tasks = table();
  const task = openTask(tasks, { taskId: "t1", request: "hi" });
  addBranches(tasks, "t1", 2);
  completeBranch(tasks, "t1", { name: "Ada", text: "a" });
  completeBranch(tasks, "t1", { name: "Bo", text: "b" });
  assert.equal(shouldRelay(task), false);
});

test("an empty result settles the branch but is nothing to relay", () => {
  const tasks = table();
  openTask(tasks, { taskId: "t1", request: "x", originBotId: "chief", kind: "question" });
  addBranches(tasks, "t1", 1);
  const { task, done } = completeBranch(tasks, "t1", { name: "Ada", text: "   " });
  assert.equal(done, true);
  assert.equal(shouldRelay(task!), false);
});

test("a silent branch does not hold the join open", () => {
  const tasks = table();
  openTask(tasks, { taskId: "t1", request: "audit", originBotId: "chief" });
  addBranches(tasks, "t1", 2);
  assert.equal(completeBranch(tasks, "t1", { name: "Ada", text: "" }).done, false);
  const last = completeBranch(tasks, "t1", { name: "Bo", text: "cloud path is slow" });
  assert.equal(last.done, true);
  assert.equal(relayText(last.task!), "cloud path is slow");
});

test("closeTask forgets the task", () => {
  const tasks = table();
  openTask(tasks, { taskId: "t1", request: "x" });
  closeTask(tasks, "t1");
  assert.equal(tasks.size, 0);
});
