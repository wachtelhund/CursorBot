import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { shell } from "electron";

export function agentWebUrl(agentId: string): string {
  return `https://cursor.com/agents/${agentId}`;
}

export function agentDesktopUrl(agentId: string): string {
  return `cursor://anysphere.cursor-deeplink/background-agent?bcId=${agentId}`;
}

export function cursorDesktopInstalled(): boolean {
  if (process.platform === "darwin") {
    return (
      existsSync("/Applications/Cursor.app") ||
      existsSync(join(homedir(), "Applications/Cursor.app"))
    );
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    return Boolean(
      local && existsSync(join(local, "Programs", "cursor", "Cursor.exe")),
    );
  }
  return (
    existsSync("/usr/bin/cursor") ||
    existsSync("/opt/Cursor/cursor") ||
    existsSync(join(homedir(), ".local/bin/cursor"))
  );
}

export async function openCloudAgent(agentId: string): Promise<"desktop" | "web"> {
  const id = agentId.trim();
  if (!id) throw new Error("Botten har ingen cloud agent");
  const desktop = agentDesktopUrl(id);
  const web = agentWebUrl(id);

  if (cursorDesktopInstalled()) {
    try {
      await shell.openExternal(desktop);
      return "desktop";
    } catch {
      await shell.openExternal(web);
      return "web";
    }
  }

  // Other platforms: try the deeplink, then https.
  if (process.platform !== "darwin") {
    try {
      await shell.openExternal(desktop);
      return "desktop";
    } catch {
      await shell.openExternal(web);
      return "web";
    }
  }

  await shell.openExternal(web);
  return "web";
}
