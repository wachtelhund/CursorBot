import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LATEST_RELEASE_PAGE,
  httpsUrl,
  isNewerVersion,
  normalizeVersion,
  parseLatestRelease,
  versionParts,
} from "./updates.ts";

test("normalizeVersion strips v prefix and whitespace", () => {
  assert.equal(normalizeVersion("  v1.2.3  "), "1.2.3");
  assert.equal(normalizeVersion("V0.1.0"), "0.1.0");
  assert.equal(normalizeVersion("0.1.0"), "0.1.0");
});

test("versionParts reads major.minor.patch numerically", () => {
  assert.deepEqual(versionParts("v1.0.10"), [1, 0, 10]);
  assert.deepEqual(versionParts("2"), [2, 0, 0]);
  assert.deepEqual(versionParts("1.2.3-beta.1"), [1, 2, 3]);
});

test("isNewerVersion compares semver cores", () => {
  assert.equal(isNewerVersion("0.2.0", "0.1.0"), true);
  assert.equal(isNewerVersion("v0.1.1", "0.1.0"), true);
  assert.equal(isNewerVersion("1.0.10", "1.0.9"), true);
  assert.equal(isNewerVersion("0.1.0", "0.1.0"), false);
  assert.equal(isNewerVersion("0.1.0", "0.2.0"), false);
  assert.equal(isNewerVersion("v0.1.0", "0.1.0"), false);
});

test("httpsUrl accepts only https", () => {
  assert.equal(
    httpsUrl("https://github.com/wachtelhund/CursorBot/releases/tag/v1.0.0"),
    "https://github.com/wachtelhund/CursorBot/releases/tag/v1.0.0",
  );
  assert.equal(httpsUrl("http://example.com/x"), undefined);
  assert.equal(httpsUrl("javascript:alert(1)"), undefined);
  assert.equal(httpsUrl(1), undefined);
});

test("parseLatestRelease marks a newer tag as available", () => {
  const result = parseLatestRelease(
    {
      tag_name: "v0.2.0",
      html_url: "https://github.com/wachtelhund/CursorBot/releases/tag/v0.2.0",
      body: "Fixes and polish.",
    },
    "0.1.0",
  );
  assert.deepEqual(result, {
    available: true,
    currentVersion: "0.1.0",
    version: "0.2.0",
    url: "https://github.com/wachtelhund/CursorBot/releases/tag/v0.2.0",
    notes: "Fixes and polish.",
  });
});

test("parseLatestRelease is current when tag matches or is older", () => {
  const same = parseLatestRelease({ tag_name: "v0.1.0", html_url: LATEST_RELEASE_PAGE }, "0.1.0");
  assert.equal(same.available, false);
  assert.equal(same.version, "0.1.0");

  const older = parseLatestRelease({ tag_name: "v0.0.9" }, "0.1.0");
  assert.equal(older.available, false);
  assert.equal(older.url, LATEST_RELEASE_PAGE);
});

test("parseLatestRelease falls back to the releases page and rejects bad payloads", () => {
  const fallback = parseLatestRelease({ tag_name: "v1.0.0", html_url: "http://evil.example" }, "0.1.0");
  assert.equal(fallback.available, true);
  assert.equal(fallback.url, LATEST_RELEASE_PAGE);

  assert.throws(() => parseLatestRelease(null, "0.1.0"), /Invalid release payload/);
  assert.throws(() => parseLatestRelease({ tag_name: "" }, "0.1.0"), /Invalid release payload/);
});
