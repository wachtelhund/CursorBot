import { existsSync } from "node:fs";
import { join } from "node:path";
import { phoneLink, REMOTE_PORT } from "../shared/remote";
import type { RemoteAccess } from "../shared/types";
import { getRemoteConfig, rotateRemoteToken, setRemoteEnabled } from "./settings";
import { lanOrigins, startRemoteServer, type RemoteServer } from "./remote-server";
import { startCloudflareTunnel } from "./tunnel";

let server: RemoteServer | undefined;
let tunnelStop: (() => void) | undefined;
let publicUrl: string | undefined;
let remoteError: string | undefined;

function staticRoot(): string | undefined {
  const packed = join(__dirname, "../renderer");
  if (existsSync(join(packed, "index.html"))) return packed;
  return undefined;
}

export async function startRemoteAccess(): Promise<RemoteAccess> {
  const config = await getRemoteConfig();
  if (!config.enabled) {
    await stopRemoteAccess();
    return describe(config.token, false);
  }
  if (server) return describe(config.token, true);
  let lastError: unknown;
  for (let port = REMOTE_PORT; port < REMOTE_PORT + 8; port++) {
    try {
      server = await startRemoteServer({
        token: config.token,
        staticRoot: staticRoot(),
        viteUrl: process.env.ELECTRON_RENDERER_URL,
        port,
      });
      return describe(config.token, true);
    } catch (error) {
      lastError = error;
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") break;
    }
  }
  console.error(lastError);
  return describe(config.token, false);
}

export async function stopRemoteAccess(): Promise<void> {
  tunnelStop?.();
  tunnelStop = undefined;
  publicUrl = undefined;
  const current = server;
  server = undefined;
  await current?.close().catch(() => undefined);
}

export async function enableRemote(enabled: boolean): Promise<RemoteAccess> {
  const config = await setRemoteEnabled(enabled);
  if (enabled) {
    await stopRemoteAccess();
    return startRemoteAccess();
  }
  await stopRemoteAccess();
  return describe(config.token, false);
}

export async function rotateRemote(): Promise<RemoteAccess> {
  const enabled = (await getRemoteConfig()).enabled;
  await stopRemoteAccess();
  const config = await rotateRemoteToken();
  if (enabled) return startRemoteAccess();
  return describe(config.token, false);
}

export async function getRemoteAccess(): Promise<RemoteAccess> {
  const config = await getRemoteConfig();
  return describe(config.token, Boolean(server) && config.enabled);
}

export function startInternetLink(onChange: (access: RemoteAccess) => void): void {
  if (!server) {
    void getRemoteAccess().then(onChange);
    return;
  }
  tunnelStop?.();
  publicUrl = undefined;
  const port = server.port;
  tunnelStop = startCloudflareTunnel(port, (url, error) => {
    publicUrl = url;
    remoteError = url ? undefined : error;
    void getRemoteAccess().then(onChange);
  }).stop;
}

export function stopInternetLink(): void {
  tunnelStop?.();
  tunnelStop = undefined;
  publicUrl = undefined;
  remoteError = undefined;
}

function describe(token: string, enabled: boolean): RemoteAccess {
  const port = server?.port ?? 0;
  const lans = enabled && port ? lanOrigins(port) : [];
  return {
    enabled,
    port,
    token,
    lanUrls: lans.map((origin) => phoneLink(origin, token)),
    publicUrl: publicUrl ? phoneLink(publicUrl, token) : undefined,
    error: remoteError,
  };
}

