/// <reference types="vite/client" />

import type { CursorBotsApi } from "@shared/api";

declare global {
  interface Window {
    cursorBots: CursorBotsApi;
    cursorBotsIsRemote?: boolean;
  }
}

export {};
