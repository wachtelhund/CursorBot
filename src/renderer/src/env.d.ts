/// <reference types="vite/client" />

import type { CursorBotsApi } from "@shared/api";

declare global {
  interface ImportMetaEnv {
    readonly VITE_CURSOR_PROXY?: string;
  }

  interface Window {
    cursorBots: CursorBotsApi;
    cursorBotsIsRemote?: boolean;
  }
}

export {};
