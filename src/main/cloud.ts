import {
  CURSOR_API,
  agentToBot,
  bootstrapPrompt,
  cloudHeaders,
  nextCursor,
  parseAgent,
  parseAgentList,
  parseRun,
  parseRunList,
  runsToMessages,
  type CloudAgent,
  type CloudRun,
} from "../shared/cursor-cloud";
import type { Bot, CreateBotInput } from "../shared/types";
import { requireApiKey } from "./settings";

async function cursorJson(path: string, init?: RequestInit): Promise<unknown> {
  const apiKey = await requireApiKey();
  const response = await fetch(`${CURSOR_API}${path}`, {
    ...init,
    headers: cloudHeaders(apiKey, init?.headers as Record<string, string> | undefined),
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : {};
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : text || `Cursor ${response.status}`;
    throw new Error(message);
  }
  return body;
}

export async function listCloudAgents(): Promise<CloudAgent[]> {
  const agents: CloudAgent[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ limit: "100", includeArchived: "false" });
    if (cursor) query.set("cursor", cursor);
    const payload = await cursorJson(`/v1/agents?${query}`);
    agents.push(...parseAgentList(payload));
    cursor = nextCursor(payload);
    if (!cursor) break;
  }
  return agents;
}

export async function createCloudAgent(input: CreateBotInput): Promise<CloudAgent> {
  const name = input.name.trim();
  const payload = await cursorJson("/v1/agents", {
    method: "POST",
    body: JSON.stringify({
      name,
      prompt: { text: bootstrapPrompt(name, input.role ?? "") },
      model: { id: input.model?.trim() || "composer-2.5" },
      ...(input.repoUrl?.trim()
        ? {
            repos: [
              {
                url: input.repoUrl.trim(),
                ...(input.startingRef?.trim()
                  ? { startingRef: input.startingRef.trim() }
                  : {}),
              },
            ],
          }
        : {}),
    }),
  });
  const created = parseAgent(
    payload && typeof payload === "object" && "agent" in payload
      ? (payload as { agent: unknown }).agent
      : payload,
  );
  if (!created) throw new Error("Cursor did not return an agent");
  return created;
}

export async function getCloudAgent(agentId: string): Promise<CloudAgent | undefined> {
  try {
    return parseAgent(await cursorJson(`/v1/agents/${encodeURIComponent(agentId)}`));
  } catch {
    return undefined;
  }
}

export async function archiveCloudAgent(agentId: string): Promise<void> {
  await cursorJson(`/v1/agents/${encodeURIComponent(agentId)}/archive`, { method: "POST" });
}

export async function listCloudRuns(agentId: string): Promise<CloudRun[]> {
  const payload = await cursorJson(
    `/v1/agents/${encodeURIComponent(agentId)}/runs?limit=30`,
  );
  return parseRunList(payload);
}

export async function getCloudRun(agentId: string, runId: string): Promise<CloudRun | undefined> {
  return parseRun(
    await cursorJson(`/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`),
  );
}

export { agentToBot, runsToMessages };

export async function botFromAgent(agent: CloudAgent): Promise<Bot> {
  const listed = await listCloudRuns(agent.id);
  const detailed: CloudRun[] = [];
  for (const run of listed.slice(0, 15)) {
    detailed.push((await getCloudRun(agent.id, run.id)) ?? run);
  }
  return agentToBot(agent, runsToMessages(detailed));
}
