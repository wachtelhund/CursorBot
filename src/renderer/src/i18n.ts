import { useEffect, useState } from "react";
import { LANG_STORAGE_KEY, resolveLang, type Lang } from "@shared/lang";
import type { TimeCopy } from "./time";

export type { Lang };
export { LANG_STORAGE_KEY, resolveLang };

const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(lang: Lang): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore quota / private mode.
  }
}

function applyDocumentLang(lang: Lang): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

let current: Lang = resolveLang(typeof localStorage !== "undefined" ? readStored() : null);
applyDocumentLang(current);

export const en = {
  language: "Language",
  languageEn: "English",
  languageSv: "Svenska",
  settings: "Settings",
  team: "Team",
  chats: "Chats",
  newBot: "New bot",
  createBot: "Create bot",
  newGroup: "New group",
  createGroup: "Create group",
  groups: "Groups",
  groupName: "Group name",
  members: "Members",
  pickMembers: "Pick who is in the group.",
  groupMembers: "{n} members",
  deleteGroupConfirm: "Delete {name}?",
  couldNotCreateGroup: "Could not create the group",
  restartAppWindow:
    "The app window must be fully quit and reopened. Reloading the page is not enough.",
  noMembersSelected: "Pick at least one bot",
  groupThreadEmpty: "This group is empty",
  groupEmptyHint: "Message the group. @name assigns the job.",
  groupPlaceholder: "Message {name}",
  create: "Create",
  cancel: "Cancel",
  delete: "Delete",
  pin: "Pin",
  unpin: "Unpin",
  moreActions: "More actions",
  rename: "Rename",
  renameBotPrompt: "Rename bot",
  renameGroupPrompt: "Rename group",
  edit: "Edit",
  editBot: "Edit bot",
  editGroup: "Edit group",
  save: "Save",
  description: "Description",
  profilePhoto: "Profile picture",
  uploadPhoto: "Upload photo",
  removePhoto: "Remove photo",
  photoTooLarge: "Photo is too large (max 300 KB).",
  character: "Character",
  startingRefOptional: "Starting ref (optional)",
  cloudAgent: "Cloud Agent",
  copyAgentLink: "Copy Cloud Agent link",
  usage: "Usage",
  usageTokens: "{n} tokens",
  noUsageYet: "No usage yet",
  nameRequired: "Name is required",
  openInCursor: "Open in Cursor",
  couldNotRename: "Could not rename",
  couldNotOpenAgent: "Could not open in Cursor",
  noCloudAgent: "This bot has no Cloud Agent",
  send: "Send",
  open: "Open",
  name: "Name",
  role: "Role",
  model: "Model",
  you: "You",
  today: "Today",
  yesterday: "Yesterday",
  thinking: "Thinking…",
  thinkingCount: "{n} thinking",
  noActivity: "No activity yet",
  showSidebar: "Show sidebar",
  hideSidebar: "Hide sidebar",
  searchBots: "Search bots",
  teamAllThread: "All bots in one thread",
  noBotsYet: "No bots yet.",
  noMatches: "No matches.",
  pinned: "Pinned",
  recent: "Recent",
  resizeSidebarAria: "Resize sidebar",
  resizeSidebarTitle: "Drag to resize",
  composerHint:
    "@name assigns · @alla everyone · @team Name: members creates a group · Enter sends",
  nameForMentions: "The name is used for @mentions.",
  rolePlaceholder: "Gathers sources and leaves a short briefing.",
  repoUrlOptional: "Repo URL (optional)",
  cursorApiKey: "Cursor API key",
  apiKeyHelp: "Stored locally. Usage is billed to your Cursor account.",
  pasteToReplace: "Paste to replace",
  saveKey: "Save key",
  sharedSecrets: "Shared secrets",
  secretsHelp:
    "Tokens every bot gets as environment variables. Sign in to GitHub, AWS, and Cloudflare in Cursor.",
  openCursorDashboard: "Open Cursor dashboard",
  leaveEmptyToKeep: "Leave empty to keep",
  value: "Value",
  saveSecret: "Save secret",
  couldNotSave: "Could not save",
  couldNotDelete: "Could not delete",
  couldNotCreateBot: "Could not create the bot",
  deleteBotConfirm: "Delete {name}? The cloud agent will be archived.",
  couldNotSend: "Could not send",
  keySavedModelsFailed: "The key was saved, but the model list could not be loaded.",
  startSomeone: "Type @name to start someone",
  pasteApiKey: "Paste a Cursor API key.",
  buildATeam: "Build a team",
  emptyTeamLead: "Each bot is a Cursor Cloud Agent. They can @-mention each other in Team.",
  teamThreadEmpty: "The team thread is empty",
  giveJob: "Give {name} a job",
  teamEmptyHint: "Type @Chief or @alla. Bots reply here and can hand off to each other.",
  botEmptyHint: "A Cursor Cloud Agent. @-mention a teammate if it needs help.",
  teamPlaceholder: "Message the team",
  botPlaceholder: "Message {name}",
  theBot: "the bot",
  fromTeammate: "{name} · from teammate",
  messageFrom: "Message from {name}",
  collapseMessages: "{n} messages with",
  collapseBots: "{n} Bots",
  collapseShow: "Show hidden messages",
  collapseHide: "Hide messages",
  messaged: "Messaged",
  messagedBots: "{n} Bots",
};

export const sv: { [K in keyof typeof en]: string } = {
  language: "Språk",
  languageEn: "English",
  languageSv: "Svenska",
  settings: "Inställningar",
  team: "Team",
  chats: "Chattar",
  newBot: "Ny bot",
  createBot: "Skapa bot",
  newGroup: "Ny grupp",
  createGroup: "Skapa grupp",
  groups: "Grupper",
  groupName: "Gruppnamn",
  members: "Medlemmar",
  pickMembers: "Välj vilka som är med i gruppen.",
  groupMembers: "{n} medlemmar",
  deleteGroupConfirm: "Ta bort {name}?",
  couldNotCreateGroup: "Kunde inte skapa gruppen",
  restartAppWindow:
    "Appfönstret måste stängas helt och öppnas igen. Det räcker inte att ladda om sidan.",
  noMembersSelected: "Välj minst en bot",
  groupThreadEmpty: "Gruppen är tom",
  groupEmptyHint: "Skriv till gruppen. @namn ger jobbet.",
  groupPlaceholder: "Meddelande till {name}",
  create: "Skapa",
  cancel: "Avbryt",
  delete: "Ta bort",
  pin: "Fäst",
  unpin: "Ta loss",
  moreActions: "Fler åtgärder",
  rename: "Byt namn",
  renameBotPrompt: "Byt namn på bot",
  renameGroupPrompt: "Byt namn på grupp",
  edit: "Redigera",
  editBot: "Redigera bot",
  editGroup: "Redigera grupp",
  save: "Spara",
  description: "Beskrivning",
  profilePhoto: "Profilbild",
  uploadPhoto: "Ladda upp bild",
  removePhoto: "Ta bort bild",
  photoTooLarge: "Bilden är för stor (max 300 kB).",
  character: "Karaktär",
  startingRefOptional: "Starting ref (valfritt)",
  cloudAgent: "Cloud Agent",
  copyAgentLink: "Kopiera Cloud Agent-länk",
  usage: "Användning",
  usageTokens: "{n} tokens",
  noUsageYet: "Ingen användning än",
  nameRequired: "Namn krävs",
  openInCursor: "Öppna i Cursor",
  couldNotRename: "Kunde inte byta namn",
  couldNotOpenAgent: "Kunde inte öppna i Cursor",
  noCloudAgent: "Boten har ingen Cloud Agent",
  send: "Skicka",
  open: "Öppna",
  name: "Namn",
  role: "Roll",
  model: "Modell",
  you: "Du",
  today: "Idag",
  yesterday: "Igår",
  thinking: "Tänker…",
  thinkingCount: "{n} tänker",
  noActivity: "Ingen aktivitet än",
  showSidebar: "Visa sidofält",
  hideSidebar: "Dölj sidofält",
  searchBots: "Sök bots",
  teamAllThread: "Alla bottar i samma tråd",
  noBotsYet: "Inga bots än.",
  noMatches: "Inga träffar.",
  pinned: "Fästa",
  recent: "Senaste",
  resizeSidebarAria: "Ändra sidofältets bredd",
  resizeSidebarTitle: "Dra för att ändra bredd",
  composerHint:
    "@namn ger jobbet · @alla tar alla · @team Namn: medlemmar skapar grupp · Enter skickar",
  nameForMentions: "Namnet används för @mentions.",
  rolePlaceholder: "Samlar källor och lämnar en kort briefing.",
  repoUrlOptional: "Repo-URL (valfritt)",
  cursorApiKey: "Cursor API-nyckel",
  apiKeyHelp: "Sparad lokalt. Usage går mot ditt Cursor-konto.",
  pasteToReplace: "Klistra in för att byta",
  saveKey: "Spara nyckel",
  sharedSecrets: "Delade secrets",
  secretsHelp:
    "Tokens som alla bots får som miljövariabler. GitHub, AWS och Cloudflare loggar du in i Cursor.",
  openCursorDashboard: "Öppna Cursor-dashboard",
  leaveEmptyToKeep: "Lämna tomt för att behålla",
  value: "Värde",
  saveSecret: "Spara secret",
  couldNotSave: "Kunde inte spara",
  couldNotDelete: "Kunde inte ta bort",
  couldNotCreateBot: "Kunde inte skapa botten",
  deleteBotConfirm: "Ta bort {name}? Cloud-agenten arkiveras.",
  couldNotSend: "Kunde inte skicka",
  keySavedModelsFailed: "Nyckeln sparades, men modellistan gick inte att hämta.",
  startSomeone: "Skriv @namn för att sätta igång någon",
  pasteApiKey: "Klistra in en Cursor API-nyckel.",
  buildATeam: "Bygg ett team",
  emptyTeamLead: "Varje bot är en Cursor Cloud Agent. De kan @-pinga varandra i Team.",
  teamThreadEmpty: "Teamtråden är tom",
  giveJob: "Ge {name} ett jobb",
  teamEmptyHint:
    "Skriv @Chief eller @alla. Bottarna svarar här och kan skicka vidare till varandra.",
  botEmptyHint: "En Cursor Cloud Agent. @-pinga en teammate om den behöver hjälp.",
  teamPlaceholder: "Meddelande till teamet",
  botPlaceholder: "Meddelande till {name}",
  theBot: "boten",
  fromTeammate: "{name} · från teammate",
  messageFrom: "Meddelande från {name}",
  collapseMessages: "{n} meddelanden med",
  collapseBots: "{n} bottar",
  collapseShow: "Visa dolda meddelanden",
  collapseHide: "Dölj meddelanden",
  messaged: "Skickade till",
  messagedBots: "{n} bottar",
};

export type MsgKey = keyof typeof en;

function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name]),
  );
}

export function getLang(): Lang {
  return current;
}

export function localeTag(lang: Lang = current): string {
  return lang === "sv" ? "sv-SE" : "en-US";
}

export function timeCopy(lang: Lang = current): TimeCopy {
  const dict = lang === "sv" ? sv : en;
  return {
    locale: localeTag(lang),
    today: dict.today,
    yesterday: dict.yesterday,
  };
}

export function t(key: MsgKey, vars?: Record<string, string | number>): string {
  const dict = current === "sv" ? sv : en;
  return fill(dict[key] ?? en[key], vars);
}

export function setLang(next: Lang): void {
  if (next === current) return;
  current = next;
  writeStored(next);
  applyDocumentLang(next);
  for (const listener of listeners) listener();
}

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLang(): { lang: Lang; setLang: typeof setLang } {
  const [lang, setLangState] = useState(current);
  useEffect(() => subscribeLang(() => setLangState(getLang())), []);
  return { lang, setLang };
}
