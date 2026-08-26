import { type SendMode } from "./send-mode.ts";

/**
 * One pending-wake queue per bot, shared by human sends and bot handoffs.
 *
 * Queue is the default in both directions: consecutive queued wakes on the same
 * thread merge into the next run instead of paying for one run each.
 * Steer jumps the queue and cancels the run in progress — `⌘Enter` for a human,
 * `@Name!:` for a bot, and automatically when a wake corrects the task the
 * target is running right now.
 */

export type QueueKey = {
  botId: string;
  threadKey: string;
  source: string;
  fromBotId?: string;
  taskId?: string;
};

export type QueueEntry<T> = {
  key: QueueKey;
  mode: SendMode;
  text: string;
  payload: T;
};

export type EnqueueAction = "queued" | "merged" | "duplicate";

export type EnqueueResult<T> = {
  list: QueueEntry<T>[];
  action: EnqueueAction;
  /** The entry a merge folded in: its task will never settle on its own. */
  replaced?: QueueEntry<T>;
};

export function threadKeyOf(input: { groupId?: string; dm?: boolean; botId: string }): string {
  if (input.dm) return `dm:${input.botId}`;
  if (input.groupId) return `group:${input.groupId}`;
  return "team";
}

export function sameLane(a: QueueKey, b: QueueKey): boolean {
  return (
    a.botId === b.botId &&
    a.threadKey === b.threadKey &&
    a.source === b.source &&
    (a.fromBotId ?? "") === (b.fromBotId ?? "")
  );
}

export function mergeText(existing: string, next: string): string {
  const before = existing.trim();
  const after = next.trim();
  if (!after) return before;
  if (!before) return after;
  if (before === after || before.includes(after)) return before;
  return `${before}\n\n${after}`;
}

/**
 * A wake that carries the same task the bot is running is a correction, not a
 * new job — deliver it now rather than after the work it invalidates.
 */
export function correctsActive(active: QueueKey | undefined, entry: QueueKey): boolean {
  if (!active?.taskId || !entry.taskId) return false;
  if (active.botId !== entry.botId) return false;
  return active.taskId === entry.taskId;
}

export function enqueue<T>(
  list: QueueEntry<T>[],
  entry: QueueEntry<T>,
): EnqueueResult<T> {
  const text = entry.text.trim();
  const next = { ...entry, text };

  for (const pending of list) {
    if (!sameLane(pending.key, next.key)) continue;
    if (pending.text.trim() !== text) continue;
    if ((pending.key.taskId ?? "") !== (next.key.taskId ?? "")) continue;
    return { list, action: "duplicate" };
  }

  if (next.mode === "steer") {
    const index = list.findIndex((item) => item.mode !== "steer");
    const out = [...list];
    out.splice(index === -1 ? out.length : index, 0, next);
    return { list: out, action: "queued" };
  }

  const last = list.at(-1);
  if (last && last.mode !== "steer" && sameLane(last.key, next.key)) {
    const out = [...list];
    out[out.length - 1] = {
      ...last,
      text: mergeText(last.text, text),
      payload: next.payload,
    };
    return { list: out, action: "merged", replaced: last };
  }

  return { list: [...list, next], action: "queued" };
}

export function takeNext<T>(list: QueueEntry<T>[]): {
  entry?: QueueEntry<T>;
  list: QueueEntry<T>[];
} {
  if (list.length === 0) return { list };
  return { entry: list[0], list: list.slice(1) };
}
