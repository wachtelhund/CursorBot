import { createReadStream, existsSync, statSync } from "node:fs";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize } from "node:path";
import { requestToken, tokensEqual, lanIpv4, REMOTE_PORT } from "../shared/remote";
import type {
  CreateBotInput,
  CreateGroupInput,
  SendMessageInput,
  StreamEvent,
  UpdateBotInput,
} from "../shared/types";
import { onBus, publish } from "./bus";
import { Agent, Cursor } from "@cursor/sdk";
import { releaseBotAgent } from "./cursor";
import { sendUserMessage } from "./send-user";
import {
  getPublicSettings,
  hasApiKey,
  requireApiKey,
  saveApiKey,
} from "./settings";
import {
  createBot,
  createGroup,
  deleteBot,
  deleteGroup,
  getBot,
  listBots,
  listGroups,
  listTeam,
  renameBot,
  renameGroup,
  setPinned,
  updateBot,
  updateGroup,
} from "./store";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export type RemoteServer = {
  port: number;
  close: () => Promise<void>;
};

export function lanOrigins(port: number): string[] {
  return lanIpv4(networkInterfaces()).map((ip) => `http://${ip}:${port}`);
}

export async function startRemoteServer(input: {
  token: string;
  staticRoot?: string;
  viteUrl?: string;
  port?: number;
}): Promise<RemoteServer> {
  const port = input.port ?? REMOTE_PORT;
  const server = createServer((req, res) => {
    void handle(req, res, input).catch((error) => {
      if (!res.headersSent) {
        json(res, 500, { error: error instanceof Error ? error.message : "Server error" });
      }
    });
  });
  await listen(server, port);
  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (error: Error) => {
      server.close(() => reject(error));
    };
    server.once("error", fail);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", fail);
      resolve();
    });
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  input: { token: string; staticRoot?: string; viteUrl?: string },
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    if (!authorized(req, input.token)) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }
    await handleApi(req, res, url.pathname);
    return;
  }
  if (input.viteUrl) {
    proxyVite(req, res, input.viteUrl);
    return;
  }
  if (input.staticRoot) {
    serveStatic(res, input.staticRoot, url.pathname);
    return;
  }
  json(res, 404, { error: "Not found" });
}

function authorized(req: IncomingMessage, token: string): boolean {
  const got = requestToken({ authorization: req.headers.authorization, url: req.url ?? "" });
  return Boolean(got && tokensEqual(got, token));
}

async function handleApi(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  if (req.method === "GET" && path === "/api/snapshot") {
    json(res, 200, {
      bots: await listBots(),
      team: await listTeam(),
      groups: await listGroups(),
      settings: await publicRemoteSettings(),
    });
    return;
  }
  if (req.method === "GET" && path === "/api/settings") {
    json(res, 200, await publicRemoteSettings());
    return;
  }
  if (req.method === "GET" && path === "/api/bots") {
    json(res, 200, await listBots());
    return;
  }
  if (req.method === "GET" && path === "/api/team") {
    json(res, 200, await listTeam());
    return;
  }
  if (req.method === "GET" && path === "/api/groups") {
    json(res, 200, await listGroups());
    return;
  }
  if (req.method === "GET" && path === "/api/models") {
    const models = await Cursor.models.list({ apiKey: await requireApiKey() });
    json(
      res,
      200,
      models.map((model) => ({ id: model.id, displayName: model.displayName })),
    );
    return;
  }
  if (req.method === "GET" && path === "/api/events") {
    sse(req, res);
    return;
  }
  if (req.method === "POST" && path === "/api/send") {
    const body = (await readJson(req)) as SendMessageInput;
    json(res, 200, await sendUserMessage(body));
    return;
  }
  if (req.method === "POST" && path === "/api/bots") {
    const body = (await readJson(req)) as CreateBotInput;
    if (!body?.name?.trim()) throw new Error("Name is required");
    const bot = await createBot(body);
    publish({ type: "bot", bot });
    json(res, 200, bot);
    return;
  }
  if (req.method === "POST" && path === "/api/groups") {
    const body = (await readJson(req)) as CreateGroupInput;
    if (!body?.name?.trim()) throw new Error("Name is required");
    const group = await createGroup({
      name: body.name,
      botIds: Array.isArray(body.botIds) ? body.botIds.map(String) : [],
    });
    publish({ type: "group", group });
    json(res, 200, group);
    return;
  }
  if (req.method === "POST" && path === "/api/settings/api-key") {
    const body = (await readJson(req)) as { apiKey?: string };
    await saveApiKey(String(body.apiKey ?? ""));
    json(res, 200, await publicRemoteSettings());
    return;
  }

  const botPin = /^\/api\/bots\/([^/]+)\/pin$/.exec(path);
  if (req.method === "POST" && botPin) {
    const body = (await readJson(req)) as { pinned?: boolean };
    const bot = await setPinned(decodeURIComponent(botPin[1] ?? ""), Boolean(body.pinned));
    if (!bot) throw new Error("Bot does not exist");
    json(res, 200, bot);
    return;
  }
  const botRename = /^\/api\/bots\/([^/]+)\/rename$/.exec(path);
  if (req.method === "POST" && botRename) {
    const body = (await readJson(req)) as { name?: string };
    const bot = await renameBot(decodeURIComponent(botRename[1] ?? ""), String(body.name ?? ""));
    if (!bot) throw new Error("Bot does not exist");
    publish({ type: "bot", bot });
    json(res, 200, bot);
    return;
  }
  const botId = /^\/api\/bots\/([^/]+)$/.exec(path);
  if (botId) {
    const id = decodeURIComponent(botId[1] ?? "");
    if (req.method === "PATCH") {
      const raw = (await readJson(req)) as UpdateBotInput;
      const bot = await updateBot(id, raw);
      if (!bot) throw new Error("Bot does not exist");
      publish({ type: "bot", bot });
      json(res, 200, bot);
      return;
    }
    if (req.method === "DELETE") {
      await releaseBotAgent(id);
      const bot = await deleteBot(id);
      if (!bot) throw new Error("Bot does not exist");
      if (bot.agentId && (await hasApiKey())) {
        try {
          await Agent.archive(bot.agentId, { apiKey: await requireApiKey() });
        } catch {
          // Local delete already succeeded.
        }
      }
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && path.endsWith("/usage")) {
      // handled below
    }
  }
  const usage = /^\/api\/bots\/([^/]+)\/usage$/.exec(path);
  if (req.method === "GET" && usage) {
    const bot = await getBot(decodeURIComponent(usage[1] ?? ""));
    if (!bot) throw new Error("Bot does not exist");
    if (!bot.agentId) {
      json(res, 200, null);
      return;
    }
    try {
      json(res, 200, await Agent.getUsage(bot.agentId, { apiKey: await requireApiKey() }));
    } catch {
      json(res, 200, null);
    }
    return;
  }
  const groupId = /^\/api\/groups\/([^/]+)$/.exec(path);
  if (groupId) {
    const id = decodeURIComponent(groupId[1] ?? "");
    if (req.method === "PATCH") {
      const body = (await readJson(req)) as { name?: string; botIds?: string[] };
      const group = await updateGroup(id, {
        name: typeof body.name === "string" ? body.name : undefined,
        botIds: Array.isArray(body.botIds) ? body.botIds.map(String) : undefined,
      });
      if (!group) throw new Error("Group does not exist");
      publish({ type: "group", group });
      json(res, 200, group);
      return;
    }
    if (req.method === "DELETE") {
      const group = await deleteGroup(id);
      if (!group) throw new Error("Group does not exist");
      publish({ type: "group-deleted", groupId: group.id });
      json(res, 200, { ok: true });
      return;
    }
  }
  const groupRename = /^\/api\/groups\/([^/]+)\/rename$/.exec(path);
  if (req.method === "POST" && groupRename) {
    const body = (await readJson(req)) as { name?: string };
    const group = await renameGroup(
      decodeURIComponent(groupRename[1] ?? ""),
      String(body.name ?? ""),
    );
    if (!group) throw new Error("Group does not exist");
    publish({ type: "group", group });
    json(res, 200, group);
    return;
  }

  json(res, 404, { error: "Not found" });
}

async function publicRemoteSettings() {
  const settings = await getPublicSettings();
  return { hasApiKey: settings.hasApiKey, secrets: settings.secrets, appVersion: settings.appVersion };
}

function sse(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(":\n\n");
  const send = (event: StreamEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const off = onBus(send);
  const beat = setInterval(() => res.write(":\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(beat);
    off();
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function serveStatic(res: ServerResponse, root: string, pathname: string): void {
  const relative = pathname === "/" ? "/index.html" : pathname;
  const file = normalize(join(root, relative));
  if (!file.startsWith(normalize(root))) {
    json(res, 403, { error: "Forbidden" });
    return;
  }
  const target = existsSync(file) && statSync(file).isFile() ? file : join(root, "index.html");
  if (!existsSync(target)) {
    json(res, 404, { error: "Not found" });
    return;
  }
  const type = TYPES[extname(target).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(target).pipe(res);
}

function proxyVite(req: IncomingMessage, res: ServerResponse, viteUrl: string): void {
  const target = new URL(req.url ?? "/", viteUrl);
  const upstream = httpRequest(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (incoming) => {
      res.writeHead(incoming.statusCode ?? 502, incoming.headers);
      incoming.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) json(res, 502, { error: "Dev server is not running" });
  });
  req.pipe(upstream);
}
