export const LANG_STORAGE_KEY = "cursor-bots.lang";

export type Lang = "en" | "sv";

export function resolveLang(stored: string | null | undefined): Lang {
  return stored === "en" || stored === "sv" ? stored : "en";
}

export function toggleLang(lang: Lang): Lang {
  return lang === "en" ? "sv" : "en";
}
