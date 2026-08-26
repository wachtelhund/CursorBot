import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveLang, toggleLang } from "./lang.ts";

test("resolveLang defaults to English when missing or invalid", () => {
  assert.equal(resolveLang(undefined), "en");
  assert.equal(resolveLang(null), "en");
  assert.equal(resolveLang(""), "en");
  assert.equal(resolveLang("de"), "en");
  assert.equal(resolveLang("EN"), "en");
  assert.equal(resolveLang("en"), "en");
});

test("resolveLang accepts sv and toggleLang flips en/sv", () => {
  assert.equal(resolveLang("sv"), "sv");
  assert.equal(toggleLang("en"), "sv");
  assert.equal(toggleLang("sv"), "en");
  assert.equal(toggleLang(resolveLang(null)), "sv");
});
