import assert from "node:assert/strict";
import { test } from "node:test";
import { needsThreadStamp, threadClock, type TimeCopy } from "../renderer/src/time.ts";

const now = new Date(2026, 7, 26, 10, 0, 0);
const en: TimeCopy = { locale: "en-US", today: "Today", yesterday: "Yesterday" };

test("threadClock follows English copy", () => {
  assert.equal(threadClock("2026-08-26T08:51:00", now, en), "Today 8:51");
  assert.equal(threadClock("2026-08-25T20:03:00", now, en), "Yesterday 20:03");
});

test("threadClock returns empty for missing or bad dates", () => {
  assert.equal(threadClock(undefined, now), "");
  assert.equal(threadClock("nope", now), "");
});

test("needsThreadStamp is true for first message and new day", () => {
  assert.equal(needsThreadStamp(undefined, "2026-08-26T08:51:00"), true);
  assert.equal(
    needsThreadStamp("2026-08-25T23:50:00", "2026-08-26T00:10:00"),
    true,
  );
});

test("needsThreadStamp hides close same-day messages", () => {
  assert.equal(
    needsThreadStamp("2026-08-26T08:51:00", "2026-08-26T08:54:00"),
    false,
  );
  assert.equal(
    needsThreadStamp("2026-08-26T08:51:00", "2026-08-26T08:56:00"),
    true,
  );
});
