import { parseHandoffs, unmatchedMentions } from "../shared/mentions";
import {
  isHarnessOnlyUserText,
  shouldPostUserMessage,
  shouldWakeTargets,
  unknownNameNotice,
} from "../shared/route";
import { parseSendPayload, resolveSendTargets } from "../shared/send";
import type { SendMessageInput } from "../shared/types";
import {
  applyGroupCommands,
  applySpawns,
  latestActiveId,
  openUserTask,
  postLog,
  postNotice,
  wakeMany,
} from "./harness";
import { id } from "./ids";
import { getGroup, listBots } from "./store";

export async function sendUserMessage(
  payload: SendMessageInput | string,
  maybeText?: string,
): Promise<{ targetIds: string[] }> {
  const parsed = parseSendPayload(payload, maybeText);
  if (!parsed.text) throw new Error("Message is required");

  const bots = await listBots();
  if (bots.length === 0) throw new Error("Create a bot first");
  if (parsed.botId && !bots.some((bot) => bot.id === parsed.botId)) {
    throw new Error("Bot does not exist");
  }

  const donor =
    bots.find((bot) => bot.id === parsed.botId) ??
    bots.find((bot) => bot.id === latestActiveId(bots)) ??
    bots[0];
  await applySpawns(undefined, donor, parsed.text, null);
  const destId = await applyGroupCommands(undefined, null, parsed.text);
  const fresh = await listBots();

  const group = parsed.groupId
    ? await getGroup(parsed.groupId)
    : parsed.botId
      ? undefined
      : destId
        ? await getGroup(destId)
        : undefined;
  if (parsed.groupId && !group) throw new Error("Group does not exist");

  const pool = group ? fresh.filter((bot) => group.botIds.includes(bot.id)) : fresh;
  if (pool.length === 0) {
    throw new Error(group ? "This group is empty" : "Create a bot first");
  }

  const roster = pool.map((bot) => ({ id: bot.id, name: bot.name }));
  const mentioned = parseHandoffs(parsed.text, roster).map((item) => item.botId);
  const fallback = latestActiveId(pool) ?? pool[0].id;
  const targetIds = resolveSendTargets({
    botId: parsed.botId,
    mentionedIds: mentioned,
    fallbackId: fallback,
  });

  const harnessOnly = isHarnessOnlyUserText(parsed.text);
  if (
    shouldPostUserMessage({
      harnessOnly,
      botId: parsed.botId,
      groupId: group?.id,
    })
  ) {
    await postLog(undefined, group?.id, {
      from: "user",
      name: "You",
      content: parsed.text,
      toBotIds: targetIds,
    });
  }
  const missing = unmatchedMentions(parsed.text, roster);
  if (missing.length > 0) {
    await postNotice(
      undefined,
      {
        dm: Boolean(parsed.botId),
        groupId: group?.id,
        botId: parsed.botId ?? targetIds[0],
      },
      unknownNameNotice(missing),
    );
  }

  if (shouldWakeTargets({ harnessOnly, botId: parsed.botId })) {
    const taskId = id("task");
    openUserTask({ taskId, request: parsed.text, branches: targetIds.length });
    wakeMany(
      undefined,
      targetIds,
      parsed.text,
      "user",
      parsed.botId ? undefined : group?.id,
      Boolean(parsed.botId),
      parsed.sendMode,
      taskId,
    );
    return { targetIds };
  }
  return { targetIds: [] };
}
