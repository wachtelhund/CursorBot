import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SEND_MODE, parseSendMode, sendDelivery } from "./send-mode.ts";

test("parseSendMode defaults unknown values to queue", () => {
  assert.equal(parseSendMode(undefined), "queue");
  assert.equal(parseSendMode(null), "queue");
  assert.equal(parseSendMode(""), "queue");
  assert.equal(parseSendMode("queue"), "queue");
  assert.equal(parseSendMode("QUEUE"), "queue");
  assert.equal(parseSendMode("plan"), "queue");
  assert.equal(parseSendMode("agent"), "queue");
});

test("parseSendMode accepts only steer as the other mode", () => {
  assert.equal(parseSendMode("steer"), "steer");
});

test("default send mode is queue", () => {
  assert.equal(DEFAULT_SEND_MODE, "queue");
  assert.deepEqual(sendDelivery(DEFAULT_SEND_MODE), {
    waitForActive: true,
    cancelActive: false,
  });
});

test("sendDelivery maps queue to wait and steer to cancel", () => {
  assert.deepEqual(sendDelivery("queue"), {
    waitForActive: true,
    cancelActive: false,
  });
  assert.deepEqual(sendDelivery("steer"), {
    waitForActive: false,
    cancelActive: true,
  });
});
