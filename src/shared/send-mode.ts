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
 * How a *user* prompt reaches `agent.send`.
 * `@cursor/sdk` has no queue/steer field: one cloud run at a time,
 * `AgentBusyError` if busy, then wait or `run.cancel()`.
 */
export function sendDelivery(mode: SendMode): SendDelivery {
  if (mode === "steer") {
    return { waitForActive: false, cancelActive: true };
  }
  return { waitForActive: true, cancelActive: false };
}
