import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LATEST_RELEASE_PAGE,
  httpsUrl,
  isAllowedInstallerUrl,
  isNewerVersion,
  normalizeVersion,
  parseLatestRelease,
  parseReleaseAssets,
  pickInstallerUrl,
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

const v011Assets = [
  {
    name: "Cursor-Bots-0.1.1-mac-arm64.dmg",
    browser_download_url:
      "https://github.com/wachtelhund/CursorBot/releases/download/v0.1.1/Cursor-Bots-0.1.1-mac-arm64.dmg",
  },
  {
    name: "Cursor-Bots-0.1.1-mac-x64.dmg",
    browser_download_url:
      "https://github.com/wachtelhund/CursorBot/releases/download/v0.1.1/Cursor-Bots-0.1.1-mac-x64.dmg",
  },
  {
    name: "Cursor-Bots-0.1.1-win-x64.exe",
    browser_download_url:
      "https://github.com/wachtelhund/CursorBot/releases/download/v0.1.1/Cursor-Bots-0.1.1-win-x64.exe",
  },
  {
    name: "Cursor-Bots-0.1.1-linux-x86_64.AppImage",
    browser_download_url:
      "https://github.com/wachtelhund/CursorBot/releases/download/v0.1.1/Cursor-Bots-0.1.1-linux-x86_64.AppImage",
  },
  {
    name: "Cursor-Bots-0.1.1-mac-arm64.dmg.blockmap",
    browser_download_url:
      "https://github.com/wachtelhund/CursorBot/releases/download/v0.1.1/Cursor-Bots-0.1.1-mac-arm64.dmg.blockmap",
  },
  {
    name: "source.zip",
    browser_download_url: "https://github.com/wachtelhund/CursorBot/archive/refs/tags/v0.1.1.zip",
  },
];

test("isAllowedInstallerUrl accepts only this repo's installer downloads", () => {
  assert.equal(
    isAllowedInstallerUrl(
      "https://github.com/wachtelhund/CursorBot/releases/download/v0.1.1/Cursor-Bots-0.1.1-mac-arm64.dmg",
    ),
    true,
  );
  assert.equal(
    isAllowedInstallerUrl(
      "https://github.com/wachtelhund/CursorBot/releases/download/v0.1.1/Cursor-Bots-0.1.1-win-x64.exe",
    ),
    true,
  );
  assert.equal(
    isAllowedInstallerUrl("https://github.com/wachtelhund/CursorBot/archive/refs/tags/v0.1.1.zip"),
    false,
  );
  assert.equal(
    isAllowedInstallerUrl(
      "https://github.com/octocat/Hello-World/releases/download/v1.0.0/app.dmg",
    ),
    false,
  );
  assert.equal(isAllowedInstallerUrl("http://github.com/wachtelhund/CursorBot/releases/download/v1/x.dmg"), false);
});

test("pickInstallerUrl selects the artifact for this machine", () => {
  const assets = parseReleaseAssets({ assets: v011Assets });
  assert.equal(assets.length, 4);
  assert.match(
    pickInstallerUrl(assets, "darwin", "arm64") ?? "",
    /mac-arm64\.dmg$/,
  );
  assert.match(pickInstallerUrl(assets, "darwin", "x64") ?? "", /mac-x64\.dmg$/);
  assert.match(pickInstallerUrl(assets, "win32", "x64") ?? "", /win-x64\.exe$/);
  assert.match(pickInstallerUrl(assets, "win32", "arm64") ?? "", /win-x64\.exe$/);
  assert.match(pickInstallerUrl(assets, "linux", "x64") ?? "", /linux-x86_64\.AppImage$/);
  assert.equal(pickInstallerUrl(assets, "sunos", "x64"), undefined);
});

test("parseLatestRelease attaches the installer download for this platform", () => {
  const result = parseLatestRelease(
    {
      tag_name: "v0.1.1",
      html_url: "https://github.com/wachtelhund/CursorBot/releases/tag/v0.1.1",
      assets: v011Assets,
    },
    "0.1.0",
    { platform: "darwin", arch: "arm64" },
  );
  assert.equal(result.available, true);
  assert.equal(
    result.downloadUrl,
    "https://github.com/wachtelhund/CursorBot/releases/download/v0.1.1/Cursor-Bots-0.1.1-mac-arm64.dmg",
  );
});
