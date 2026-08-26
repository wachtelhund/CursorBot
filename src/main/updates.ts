import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  LATEST_RELEASE_API,
  isAllowedInstallerUrl,
  parseLatestRelease,
  type UpdateCheckResult,
  type UpdateProgress,
} from "../shared/updates";

const UA = { "User-Agent": "Cursor-Bots", Accept: "application/vnd.github+json" };

export type ApplyUpdateContext = {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  arch: string;
  pid: number;
  execPath: string;
  appImage?: string;
  quit: () => void;
  onProgress: (progress: UpdateProgress) => void;
};

let applying = false;

export async function fetchLatestUpdate(
  currentVersion: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): Promise<UpdateCheckResult> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: {
      ...UA,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}`);
  }
  return parseLatestRelease(await response.json(), currentVersion, { platform, arch });
}

export async function applyLatestUpdate(
  currentVersion: string,
  ctx: ApplyUpdateContext,
): Promise<void> {
  if (applying) throw new Error("Update already in progress");
  if (!ctx.isPackaged) {
    throw new Error("Updates install in the packaged app, not in npm run dev");
  }
  applying = true;
  try {
    const latest = await fetchLatestUpdate(currentVersion, ctx.platform, ctx.arch);
    if (!latest.available) {
      throw new Error("You're already on the latest version");
    }
    if (!latest.downloadUrl || !isAllowedInstallerUrl(latest.downloadUrl)) {
      throw new Error("No installer for this machine");
    }
    ctx.onProgress({ phase: "downloading", percent: 0 });
    const dest = join(
      tmpdir(),
      `Cursor-Bots-${latest.version}${extname(new URL(latest.downloadUrl).pathname)}`,
    );
    await downloadInstaller(latest.downloadUrl, dest, (percent) => {
      ctx.onProgress({ phase: "downloading", percent });
    });
    ctx.onProgress({ phase: "installing" });
    await scheduleInstall(dest, ctx);
    ctx.onProgress({ phase: "restarting" });
    ctx.quit();
  } catch (error) {
    applying = false;
    const message = error instanceof Error ? error.message : "Could not install the update";
    ctx.onProgress({ phase: "error", message });
    throw error;
  }
}

async function downloadInstaller(
  url: string,
  dest: string,
  onPercent: (percent: number) => void,
): Promise<void> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Cursor-Bots", Accept: "application/octet-stream" },
    redirect: "follow",
    signal: AbortSignal.timeout(5 * 60_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status})`);
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  let received = 0;
  const body = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
  body.on("data", (chunk: Buffer) => {
    received += chunk.length;
    if (total > 0) onPercent(Math.min(99, Math.round((received / total) * 100)));
  });
  await pipeline(body, createWriteStream(dest));
  onPercent(100);
}

async function scheduleInstall(installer: string, ctx: ApplyUpdateContext): Promise<void> {
  const script =
    ctx.platform === "darwin"
      ? await writeMacHelper(installer, ctx)
      : ctx.platform === "win32"
        ? await writeWinHelper(installer, ctx)
        : await writeLinuxHelper(installer, ctx);
  const child =
    ctx.platform === "win32"
      ? spawn(script, { detached: true, stdio: "ignore", windowsHide: true, shell: true })
      : spawn("/bin/bash", [script], { detached: true, stdio: "ignore" });
  child.unref();
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function winQuote(value: string): string {
  if (value.includes('"')) throw new Error("Invalid path");
  return `"${value}"`;
}

export function macAppBundle(execPath: string): string {
  const index = execPath.indexOf(".app/");
  if (index === -1) return "/Applications/Cursor Bots.app";
  return execPath.slice(0, index + 4);
}

async function writeMacHelper(dmg: string, ctx: ApplyUpdateContext): Promise<string> {
  const dest = macAppBundle(ctx.execPath);
  const mount = join(tmpdir(), `cursor-bots-mnt-${ctx.pid}`);
  const script = join(tmpdir(), `cursor-bots-update-${ctx.pid}.sh`);
  await mkdir(mount, { recursive: true });
  await writeFile(
    script,
    `#!/bin/bash
set -euo pipefail
while kill -0 ${ctx.pid} 2>/dev/null; do sleep 0.2; done
hdiutil attach -nobrowse -readonly -mountpoint ${shQuote(mount)} ${shQuote(dmg)}
rm -rf ${shQuote(`${dest}.updating`)}
ditto ${shQuote(join(mount, "Cursor Bots.app"))} ${shQuote(`${dest}.updating`)}
xattr -cr ${shQuote(`${dest}.updating`)} || true
rm -rf ${shQuote(dest)}
mv ${shQuote(`${dest}.updating`)} ${shQuote(dest)}
hdiutil detach ${shQuote(mount)} || true
rmdir ${shQuote(mount)} || true
rm -f ${shQuote(dmg)}
open -a ${shQuote(dest)}
rm -f "$0"
`,
    { mode: 0o700 },
  );
  return script;
}

async function writeWinHelper(installer: string, ctx: ApplyUpdateContext): Promise<string> {
  const script = join(tmpdir(), `cursor-bots-update-${ctx.pid}.cmd`);
  await writeFile(
    script,
    `@echo off
powershell -NoProfile -Command "Wait-Process -Id ${ctx.pid} -ErrorAction SilentlyContinue"
start /wait "" ${winQuote(installer)} /S
start "" ${winQuote(ctx.execPath)}
del /f /q ${winQuote(installer)}
del /f /q "%~f0"
`,
    { encoding: "utf8" },
  );
  return script;
}

async function writeLinuxHelper(installer: string, ctx: ApplyUpdateContext): Promise<string> {
  const dest = ctx.appImage || ctx.execPath;
  if (!ctx.appImage) {
    throw new Error("No installer for this machine");
  }
  const script = join(tmpdir(), `cursor-bots-update-${ctx.pid}.sh`);
  await chmod(installer, 0o755);
  await writeFile(
    script,
    `#!/bin/bash
set -euo pipefail
while kill -0 ${ctx.pid} 2>/dev/null; do sleep 0.2; done
mv -f ${shQuote(installer)} ${shQuote(dest)}
chmod +x ${shQuote(dest)}
nohup ${shQuote(dest)} >/dev/null 2>&1 &
rm -f "$0"
`,
    { mode: 0o700 },
  );
  return script;
}
