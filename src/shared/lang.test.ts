import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveLang } from "./lang.ts";

test("resolveLang is always English", () => {
  assert.equal(resolveLang(undefined), "en");
  assert.equal(resolveLang(null), "en");
  assert.equal(resolveLang(""), "en");
  assert.equal(resolveLang("de"), "en");
  assert.equal(resolveLang("sv"), "en");
  assert.equal(resolveLang("EN"), "en");
  assert.equal(resolveLang("en"), "en");
});
