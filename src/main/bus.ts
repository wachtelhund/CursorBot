import { BrowserWindow } from "electron";
import type { StreamEvent } from "../shared/types";

const listeners = new Set<(event: StreamEvent) => void>();

export function onBus(listener: (event: StreamEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publish(event: StreamEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send("bots:event", event);
    }
  }
  for (const listener of listeners) listener(event);
}
