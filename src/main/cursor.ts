import { Agent, AgentNotFoundError } from "@cursor/sdk";
import { getSecretEnv, requireApiKey } from "./settings";
import type { Bot } from "../shared/types";

type LiveAgent = Awaited<ReturnType<typeof Agent.create>>;

const live = new Map<string, LiveAgent>();

export function isUnusableAgent(error: unknown): boolean {
  if (error instanceof AgentNotFoundError) return true;
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    code === "agent_not_found" ||
    code === "not_found" ||
    code === "validation_error" ||
    /legacy workflow/i.test(message)
  );
}

async function dropLive(botId: string): Promise<void> {
  const agent = live.get(botId);
  if (!agent) return;
  live.delete(botId);
  try {
    await agent[Symbol.asyncDispose]();
  } catch {
    // Best-effort close of a stale handle.
  }
}

export async function releaseBotAgent(botId: string): Promise<void> {
  await dropLive(botId);
}

export async function releaseAllAgents(): Promise<void> {
  await Promise.all([...live.keys()].map((botId) => dropLive(botId)));
}

export async function openBotAgent(bot: Bot): Promise<LiveAgent> {
  const cached = live.get(bot.id);
  if (cached && (!bot.agentId || cached.agentId === bot.agentId)) {
    return cached;
  }
  if (cached) await dropLive(bot.id);

  const apiKey = await requireApiKey();
  const model = { id: bot.model || "composer-2.5" };

  if (bot.agentId) {
    try {
      const resumed = await Agent.resume(bot.agentId, { apiKey, model });
      live.set(bot.id, resumed);
      return resumed;
    } catch (error) {
      if (!isUnusableAgent(error)) throw error;
    }
  }

  const envVars = await getSecretEnv();
  const created = await Agent.create({
    apiKey,
    name: bot.name,
    model,
    cloud: {
      repos: bot.repoUrl
        ? [{ url: bot.repoUrl, startingRef: bot.startingRef }]
        : [],
      metadata: {
        source: "cursor-bots",
        bot_id: bot.id,
      },
      ...(Object.keys(envVars).length > 0 ? { envVars } : {}),
    },
  });
  live.set(bot.id, created);
  return created;
}
