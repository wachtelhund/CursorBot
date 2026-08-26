import { LANG_STORAGE_KEY, resolveLang, type Lang } from "@shared/lang";
import type { TimeCopy } from "./time";

export type { Lang };
export { LANG_STORAGE_KEY, resolveLang };

if (typeof document !== "undefined") {
  document.documentElement.lang = "en";
}

export const en = {
  settings: "Settings",
  updates: "Updates",
  currentVersion: "Version {version}",
  checkForUpdates: "Check for updates",
  checkingForUpdates: "Checking…",
  upToDate: "You're on the latest version ({version})",
  updateAvailable: "Version {version} is available",
  updateTo: "Update to {version}",
  openRelease: "Open release",
  updateCheckFailed: "Could not check for updates",
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
  queue: "Queue",
  steer: "Steer",
  queueTitle: "Queue · Enter",
  steerTitle: "Steer · {shortcut}",
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
    "@name assigns · @all everyone · @new Name: role · @team Name: members · Enter queues · {shortcut} steers",
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
  teamEmptyHint: "Type @Chief or @all. Bots reply here and can hand off to each other.",
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

export type MsgKey = keyof typeof en;

function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name]),
  );
}

export function getLang(): Lang {
  return resolveLang();
}

export function localeTag(_lang: Lang = "en"): string {
  return "en-US";
}

export function timeCopy(_lang: Lang = "en"): TimeCopy {
  return {
    locale: localeTag(),
    today: en.today,
    yesterday: en.yesterday,
  };
}

export function t(key: MsgKey, vars?: Record<string, string | number>): string {
  return fill(en[key], vars);
}

export function useLang(): { lang: Lang } {
  return { lang: "en" };
}
