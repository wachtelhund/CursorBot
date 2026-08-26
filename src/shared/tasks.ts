/**
 * One delegating turn is one task. The task id travels with every branch,
 * so a fan-out can be joined instead of trickling back one restatement at a time.
 */

export type TaskKind = "assign" | "question";

export type TaskResult = {
  name: string;
  text: string;
};

export type Task = {
  taskId: string;
  kind: TaskKind;
  request: string;
  originBotId?: string;
  originName?: string;
  branches: number;
  /** Branches that have finished, answered or not. */
  settled: number;
  results: TaskResult[];
};

export type TaskTable = Map<string, Task>;

export type OpenTaskInput = {
  taskId: string;
  kind?: TaskKind;
  request: string;
  originBotId?: string;
  originName?: string;
};

export const MAX_TASKS = 200;
export const REQUEST_CLIP = 240;

export function openTask(table: TaskTable, input: OpenTaskInput): Task {
  const existing = table.get(input.taskId);
  if (existing) return existing;
  const task: Task = {
    taskId: input.taskId,
    kind: input.kind ?? "assign",
    request: input.request,
    originBotId: input.originBotId,
    originName: input.originName,
    branches: 0,
    settled: 0,
    results: [],
  };
  table.set(task.taskId, task);
  while (table.size > MAX_TASKS) {
    const oldest = table.keys().next();
    if (oldest.done) break;
    table.delete(oldest.value);
  }
  return task;
}

export function addBranches(table: TaskTable, taskId: string, count = 1): number {
  const task = table.get(taskId);
  if (!task) return 0;
  task.branches += count;
  return task.branches;
}

/** A branch that returned nothing still settles: the join must not hang on it. */
export function completeBranch(
  table: TaskTable,
  taskId: string,
  result: TaskResult,
): { task?: Task; done: boolean } {
  const task = table.get(taskId);
  if (!task) return { done: false };
  if (result.text.trim()) task.results.push(result);
  task.settled += 1;
  return { task, done: task.settled >= task.branches };
}

/** A branch that failed or was cancelled — same release, no result. */
export function dropBranch(table: TaskTable, taskId: string): { task?: Task; done: boolean } {
  const task = table.get(taskId);
  if (!task) return { done: false };
  task.settled += 1;
  return { task, done: task.settled >= task.branches };
}

export function closeTask(table: TaskTable, taskId: string): void {
  table.delete(taskId);
}

/**
 * A single delegated result already stands on the thread — waking the sender to
 * restate it costs a run and shows the human the same text twice.
 * Wake the sender when it asked a question, or when it fanned out and has
 * results to reconcile.
 */
export function shouldRelay(task: Task): boolean {
  if (!task.originBotId) return false;
  if (task.results.length === 0) return false;
  return task.kind === "question" || task.branches > 1;
}

function clipRequest(text: string): string {
  const flat = text.replace(/\s*\n\s*/g, " ").trim();
  return flat.length <= REQUEST_CLIP ? flat : `${flat.slice(0, REQUEST_CLIP - 1)}…`;
}

export function relayText(task: Task): string {
  if (task.results.length === 0) return "";
  if (task.results.length === 1) return task.results[0].text;
  const parts = task.results.map((result) => `${result.name}:\n${result.text}`);
  return [`Results for: ${clipRequest(task.request)}`, "", parts.join("\n\n")].join("\n");
}
