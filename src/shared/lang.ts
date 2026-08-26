export const LANG_STORAGE_KEY = "cursor-bots.lang";

export type Lang = "en";

export function resolveLang(_stored?: string | null): Lang {
  return "en";
}
