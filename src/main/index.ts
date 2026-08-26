import { app, BrowserWindow, Menu, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { releaseAllAgents } from "./cursor";
import { registerIpc } from "./ipc";
import { backfillMissingBots } from "./store";

const APP_NAME = "Cursor Bots";
const userDataOverride = process.env.CURSOR_BOTS_USER_DATA;
const keepUserData = !userDataOverride && !app.isPackaged ? app.getPath("userData") : undefined;

app.setName(APP_NAME);
if (process.platform === "win32") app.setAppUserModelId("dev.cursorbots.app");
if (userDataOverride) app.setPath("userData", userDataOverride);
else if (keepUserData) app.setPath("userData", keepUserData);

function resolveAppIcon(): string | undefined {
  return [
    join(__dirname, "../../build/icon.png"),
    join(app.getAppPath(), "build/icon.png"),
    join(process.cwd(), "build/icon.png"),
  ].find((file) => existsSync(file));
}

function createWindow(): void {
  const icon = resolveAppIcon();
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: APP_NAME,
    ...(icon ? { icon } : {}),
    backgroundColor: "#0d0d0d",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function buildMenu(): void {
  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac
        ? [
            {
              label: app.name,
              submenu: [
                { role: "about" as const },
                { type: "separator" as const },
                { role: "hide" as const },
                { role: "hideOthers" as const },
                { role: "unhide" as const },
                { type: "separator" as const },
                { role: "quit" as const },
              ],
            },
          ]
        : []),
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );
}

app.whenReady().then(() => {
  const icon = resolveAppIcon();
  if (icon) app.dock?.setIcon(icon);
  app.setAboutPanelOptions({ applicationName: APP_NAME });
  registerIpc();
  void backfillMissingBots();
  ipcMain.handle("shell:open", (_event, url: string) => {
    if (!url.startsWith("https://")) return;
    return shell.openExternal(url);
  });
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void releaseAllAgents();
});
