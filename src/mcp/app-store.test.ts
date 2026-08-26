import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  appSupportRoot,
  assertNoSecrets,
  candidateStorePaths,
  getThreadView,
  isSecretKey,
  lastTeamPreview,
  listThreadsView,
  loadAppStore,
  parseStoreJson,
  pickBestStore,
  redactSecrets,
  storeHasContent,
  storeSummaryView,
} from "./app-store.ts";

test("candidateStorePaths covers packaged and Electron userData on each OS", () => {
  assert.deepEqual(
    candidateStorePaths({
      platform: "darwin",
      home: "/Users/ada",
    }),
    [
      "/Users/ada/Library/Application Support/Cursor Bots/store.json",
      "/Users/ada/Library/Application Support/cursor-bots/store.json",
      "/Users/ada/Library/Application Support/Electron/store.json",
      "/Users/ada/Library/Application Support/electron/store.json",
    ],
  );
  assert.deepEqual(
    candidateStorePaths({
      platform: "linux",
      home: "/home/ada",
      env: { XDG_CONFIG_HOME: "/home/ada/.config" },
    }),
    [
      "/home/ada/.config/Cursor Bots/store.json",
      "/home/ada/.config/cursor-bots/store.json",
      "/home/ada/.config/Electron/store.json",
      "/home/ada/.config/electron/store.json",
    ],
  );
  assert.deepEqual(
    candidateStorePaths({
      platform: "win32",
      home: "C:\\Users\\ada",
      env: { APPDATA: "C:\\Users\\ada\\AppData\\Roaming" },
    }),
    [
      "C:\\Users\\ada\\AppData\\Roaming\\Cursor Bots\\store.json",
      "C:\\Users\\ada\\AppData\\Roaming\\cursor-bots\\store.json",
      "C:\\Users\\ada\\AppData\\Roaming\\Electron\\store.json",
      "C:\\Users\\ada\\AppData\\Roaming\\electron\\store.json",
    ],
  );
  assert.equal(
    candidateStorePaths({ platform: "darwin", home: "/Users/ada" }).some((file) =>
      file.endsWith("settings.json"),
    ),
    false,
  );
});

test("appSupportRoot uses XDG or APPDATA fallbacks", () => {
  assert.equal(appSupportRoot("linux", "/home/ada", {}), "/home/ada/.config");
  assert.equal(
    appSupportRoot("win32", "C:\\Users\\ada", {}),
    "C:\\Users\\ada\\AppData\\Roaming",
  );
});

test("pickBestStore prefers content over a newer empty file, then latest activity", () => {
  const emptyNew = {
    path: "/tmp/new-empty.json",
    mtimeMs: 200,
    hasContent: false,
    lastActivityMs: 0,
  };
  const olderWithBots = {
    path: "/tmp/old-full.json",
    mtimeMs: 100,
    hasContent: true,
    lastActivityMs: 50,
  };
  const newerWithBots = {
    path: "/tmp/new-full.json",
    mtimeMs: 90,
    hasContent: true,
    lastActivityMs: 80,
  };
  assert.equal(pickBestStore([emptyNew, olderWithBots])?.path, olderWithBots.path);
  assert.equal(
    pickBestStore([olderWithBots, newerWithBots, emptyNew])?.path,
    newerWithBots.path,
  );
});

test("parseStoreJson drops secrets and keeps chats plus agentId", () => {
  const store = parseStoreJson(
    JSON.stringify({
      apiKey: "sk-live-should-never-leak",
      secrets: { GITHUB_TOKEN: "ghp_secret" },
      secretsEnc: "ZW5jcnlwdGVk",
      bots: [
        {
          id: "bot_1",
          name: "Boss",
          role: "Leads",
          model: "composer-2.5",
          agentId: "bc-abc",
          apiKey: "nested-key",
          token: "abc",
          messages: [
            {
              id: "m1",
              role: "user",
              content: "hello, mention apiKey only as words",
              createdAt: "2026-08-26T10:00:00.000Z",
            },
          ],
          createdAt: "2026-08-26T09:00:00.000Z",
          updatedAt: "2026-08-26T10:00:00.000Z",
        },
      ],
      team: [
        {
          id: "t1",
          from: "user",
          name: "You",
          content: "@Boss: status",
          createdAt: "2026-08-26T10:01:00.000Z",
        },
      ],
      groups: [],
      removedNames: ["Old"],
    }),
  );

  assert.equal(storeHasContent(store), true);
  assert.equal(store.bots[0]?.agentId, "bc-abc");
  assert.equal(store.bots[0]?.name, "Boss");
  assert.equal(store.team[0]?.content, "@Boss: status");
  assert.equal(
    store.bots[0]?.messages[0]?.content,
    "hello, mention apiKey only as words",
  );
  assertNoSecrets(store);
  assert.equal("apiKey" in store, false);
});

test("redactSecrets omits secret keys and leaves agentId", () => {
  const redacted = redactSecrets({
    agentId: "bc-keep",
    apiKey: "nope",
    password: "nope",
    nested: { secretsEnc: "nope", ok: 1 },
  }) as Record<string, unknown>;
  assert.deepEqual(redacted, { agentId: "bc-keep", nested: { ok: 1 } });
  assert.equal(isSecretKey("apiKey"), true);
  assert.equal(isSecretKey("agentId"), false);
});

test("loadAppStore honors CURSOR_BOTS_STORE and does not read settings.json", async () => {
  const root = path.join(os.tmpdir(), `cursor-bots-mcp-${process.pid}-${Date.now()}`);
  const userData = path.join(root, "Cursor Bots");
  await mkdir(userData, { recursive: true });
  await writeFile(
    path.join(userData, "settings.json"),
    JSON.stringify({ apiKey: "sk-from-settings" }),
  );
  const storeFile = path.join(userData, "store.json");
  await writeFile(
    storeFile,
    JSON.stringify({
      bots: [
        {
          id: "bot_q",
          name: "QA",
          role: "Tests",
          model: "composer-2.5",
          messages: [
            {
              id: "u1",
              role: "user",
              content: "ping",
              createdAt: "2026-08-26T11:00:00.000Z",
            },
          ],
          createdAt: "2026-08-26T11:00:00.000Z",
          updatedAt: "2026-08-26T11:00:00.000Z",
        },
      ],
      team: [],
      groups: [],
      removedNames: [],
    }),
  );

  const loaded = await loadAppStore({
    env: { CURSOR_BOTS_STORE: storeFile },
    home: root,
    platform: "darwin",
  });
  assert.equal(loaded.path, storeFile);
  assert.equal(loaded.store.bots[0]?.name, "QA");
  const summary = storeSummaryView(loaded);
  assert.equal(summary.readsSettings, false);
  assert.equal(summary.botCount, 1);
  const dumped = JSON.stringify(summary);
  assert.equal(dumped.includes("sk-from-settings"), false);
  assert.equal(dumped.includes("settings.json"), false);
  assertNoSecrets(summary);
});

test("loadAppStore prefers the newest store that has bots or messages", async () => {
  const home = path.join(os.tmpdir(), `cursor-bots-mcp-home-${process.pid}-${Date.now()}`);
  const packaged = path.join(home, "Library", "Application Support", "Cursor Bots");
  const electron = path.join(home, "Library", "Application Support", "Electron");
  await mkdir(packaged, { recursive: true });
  await mkdir(electron, { recursive: true });
  await writeFile(
    path.join(electron, "store.json"),
    JSON.stringify({
      bots: [],
      team: [],
      groups: [],
    }),
  );
  await writeFile(
    path.join(packaged, "store.json"),
    JSON.stringify({
      bots: [
        {
          id: "bot_1",
          name: "Boss",
          role: "",
          model: "composer-2.5",
          messages: [],
          createdAt: "2026-08-26T12:00:00.000Z",
          updatedAt: "2026-08-26T12:00:00.000Z",
        },
      ],
      team: [],
      groups: [],
    }),
  );

  const loaded = await loadAppStore({ env: {}, home, platform: "darwin" });
  assert.equal(loaded.path, path.join(packaged, "store.json"));
  assert.equal(loaded.store.bots[0]?.name, "Boss");
});

test("thread views keep stored handoff fields and mark inspect vs klartext", () => {
  const store = parseStoreJson(
    JSON.stringify({
      bots: [
        {
          id: "bot_dev",
          name: "Dev",
          role: "Codes",
          model: "composer-2.5",
          messages: [
            {
              id: "d1",
              role: "user",
              content: "say hi",
              createdAt: "2026-08-26T12:00:00.000Z",
            },
            {
              id: "d2",
              role: "assistant",
              content: "Hello.\n@QA: ping",
              source: "bot",
              createdAt: "2026-08-26T12:00:01.000Z",
            },
          ],
          createdAt: "2026-08-26T12:00:00.000Z",
          updatedAt: "2026-08-26T12:00:01.000Z",
        },
        {
          id: "bot_qa",
          name: "QA",
          role: "Tests",
          model: "composer-2.5",
          messages: [],
          createdAt: "2026-08-26T12:00:00.000Z",
          updatedAt: "2026-08-26T12:00:00.000Z",
        },
      ],
      team: [
        {
          id: "t1",
          from: "user",
          name: "You",
          content: "@Dev: say hi",
          createdAt: "2026-08-26T12:00:00.000Z",
        },
        {
          id: "t2",
          from: "bot",
          botId: "bot_dev",
          name: "Dev",
          content: "Hello.\n@QA: ping",
          createdAt: "2026-08-26T12:00:01.000Z",
        },
        {
          id: "t3",
          from: "bot",
          botId: "bot_qa",
          name: "QA",
          content: "pong",
          source: "handoff",
          fromBotId: "bot_dev",
          createdAt: "2026-08-26T12:00:02.000Z",
        },
      ],
      groups: [
        {
          id: "grp_1",
          name: "Core",
          botIds: ["bot_dev", "bot_qa"],
          messages: [
            {
              id: "g1",
              from: "user",
              name: "You",
              content: "go",
              createdAt: "2026-08-26T12:00:03.000Z",
            },
          ],
          createdAt: "2026-08-26T12:00:00.000Z",
          updatedAt: "2026-08-26T12:00:03.000Z",
        },
      ],
    }),
  );

  const threads = listThreadsView(store);
  assert.equal(threads.some((thread) => thread.id === "team"), true);
  assert.equal(lastTeamPreview(store.team), "Hello.");

  const team = getThreadView(store, "team");
  assert.equal(team.kind, "team");
  const hop = team.messages.find((message) => message.id === "t3");
  assert.equal(hop?.source, "handoff");
  assert.equal(hop?.inspect, true);
  assert.equal(hop?.klartext, "");

  const dm = getThreadView(store, "Dev");
  assert.equal(dm.kind, "dm");
  assert.equal(dm.messages[0]?.klartext, "say hi");
  assert.equal(dm.messages[1]?.klartext, "Hello.");

  const target = getThreadView(store, "QA");
  assert.equal(target.kind, "dm");
  assert.equal(
    "inspectHops" in target &&
      Array.isArray(target.inspectHops) &&
      target.inspectHops[0]?.source === "handoff",
    true,
  );

  const group = getThreadView(store, "Core");
  assert.equal(group.kind, "group");
  assert.equal(group.messages[0]?.content, "go");
});
