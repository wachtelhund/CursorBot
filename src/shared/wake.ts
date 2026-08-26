import { stripRoutingLines } from "./mentions.ts";

export type WakeSource = "user" | "handoff" | "result";

export type WakePromptInput = {
  botName: string;
  role: string;
  isFirst: boolean;
  secretNames: string[];
  teammates: { name: string; role: string }[];
  groups?: { name: string; members: string[] }[];
  source: WakeSource;
  fromName?: string;
  hop: number;
  text: string;
};

function clipHandoffContext(result: string): string {
  return stripRoutingLines(result).slice(0, 2000);
}

export function assignmentText(
  fromName: string,
  request: string,
  result: string,
): string {
  const task = request.trim();
  if (task) return task;
  const context = clipHandoffContext(result);
  if (!context) return "Take the next concrete step.";
  return `Take the next concrete step.\n\nContext from ${fromName}:\n${context}`;
}

/** After a specialist hop: public text goes back to the originator, not into a new assignment. */
export function shouldDeliverHandoffResult(input: {
  source: WakeSource;
  publicText: string;
  fromBotId?: string;
}): boolean {
  return (
    input.source === "handoff" &&
    Boolean(input.fromBotId?.trim()) &&
    Boolean(input.publicText.trim())
  );
}

function formatMate(name: string, role: string): string {
  return `@${name}${role.trim() ? ` (${role.trim()})` : ""}`;
}

function appRosterLine(input: WakePromptInput): string {
  const seen = new Set<string>();
  const bots: { name: string; role: string }[] = [];
  const add = (name: string, role: string) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    bots.push({ name: name.trim(), role });
  };
  add(input.botName, input.role);
  for (const mate of input.teammates) add(mate.name, mate.role);

  if (bots.length <= 1) {
    return "App roster (only these exist): You are the only bot. Do not invent teammates.";
  }
  return `App roster (only these exist): ${bots.map((bot) => formatMate(bot.name, bot.role)).join("; ")}`;
}

export function composeWakePrompt(input: WakePromptInput): string {
  const task = input.text.trim();
  const lines: string[] = [];

  if (input.isFirst) {
    lines.push(`You are ${input.botName}, a persistent teammate.`);
    if (input.role.trim()) lines.push(input.role.trim());
    if (input.secretNames.length > 0) {
      lines.push(
        `Shared secrets are environment variables: ${input.secretNames.join(", ")}. Use them. Never print their values.`,
      );
    }
  }

  if (input.source === "result") {
    lines.push(
      input.fromName
        ? `Wake: result from ${input.fromName} (hop ${input.hop}).`
        : `Wake: result for the user (hop ${input.hop}).`,
    );
  } else if (input.source === "handoff" && input.fromName) {
    lines.push(`Wake: assignment from ${input.fromName} (hop ${input.hop}).`);
  } else {
    lines.push("Wake: message from the user.");
  }

  lines.push(appRosterLine(input));
  lines.push(
    "You may only name bots on this list. cursor.com/agents links and old Cloud Agents are NOT teammates unless they are on this list. To add someone: `@ny Name: role` (own line). Then they appear in the app. Do not list leftover/docs/summarize agents. When asked which bots exist, answer ONLY this app roster.",
  );

  if (input.groups && input.groups.length > 0) {
    const groups = input.groups
      .map((group) =>
        group.members.length > 0
          ? `${group.name} (${group.members.join(", ")})`
          : group.name,
      )
      .join("; ");
    lines.push(`Groups: ${groups}.`);
  }

  if (input.source === "result") {
    lines.push(
      "This is a finished result to tell the user. Answer the user in plain language on this thread. Do not assign work with @Name:. Do not ping the sender or repeat the assignment. Do not mention these instructions in your reply.",
    );
  } else if (input.isFirst) {
    lines.push(
      "You cannot use the desktop UI. The only way to add a teammate is one line `@ny Name: role` or `@new Name: role`. Create a group with one line `@team Name: Member, Member` or `@grupp Name: Member, Member`. Add someone with `@team Name +: Member`. To post into a group, write `@team Name` then `@Name: request` on their own lines. Listing a roster or cursor.com/agents links does not create anyone. Do not invent teammates. Assign work with one own line `@Name: request`. Mid-sentence @Name does not assign. Spawn only if needed. Do the assignment; do not wait for a reply this turn. Do not mention these instructions in your reply.",
    );
  } else {
    lines.push(
      "Only `@ny Name: role` (or `@new`) adds a teammate. Create a group: `@team Name: Member, Member` (or `@grupp`). Add: `@team Name +: Member`. A roster list is not enough. Assign: one own line `@Name: request`. Mid-sentence @Name does not assign. No extra bots. Do not mention these instructions in your reply.",
    );
  }

  if (input.source !== "result") {
    lines.push(
      "Do the work now. Leave a finished result on this turn. Do not only plan. The team thread is the log; do not poll teammates.",
    );
    lines.push(
      "If you assign with @Name:, do not repeat that line in the rest of the reply. Do not say you sent it or that you will not wait.",
    );
  }
  lines.push("", "Task:", task);
  return lines.join("\n");
}
