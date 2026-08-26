export const SEND_MODES = ["queue", "steer"] as const;

export type SendMode = (typeof SEND_MODES)[number];

export const DEFAULT_SEND_MODE: SendMode = "queue";

export type SendDelivery = {
  waitForActive: boolean;
  cancelActive: boolean;
};

export function parseSendMode(value: unknown): SendMode {
  return value === "steer" ? "steer" : "queue";
}

/**
 * How a prompt reaches `agent.send`, for human sends and bot handoffs alike.
 * `@cursor/sdk` has no queue/steer field: one cloud run at a time,
 * `AgentBusyError` if busy, then wait or `run.cancel()`.
 */
export function sendDelivery(mode: SendMode): SendDelivery {
  if (mode === "steer") {
    return { waitForActive: false, cancelActive: true };
  }
  return { waitForActive: true, cancelActive: false };
}

export type WakeModeInput = {
  /** `⌘Enter` from the composer, or `@Name!:` from a bot. */
  requested?: unknown;
  /** The wake carries the same task the target is running: a correction. */
  corrects?: boolean;
};

/**
 * Queue is the default in both directions. Steer is explicit, or automatic when
 * the wake would otherwise land behind the work it invalidates.
 */
export function resolveWakeMode(input: WakeModeInput): SendMode {
  if (input.corrects) return "steer";
  return parseSendMode(input.requested);
}
