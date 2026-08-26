import { useState, type ReactNode } from "react";
import { bundleHandoffs, hopCounterpartIds } from "@shared/collapse";
import type { Bot } from "@shared/types";
import { BotFace } from "./buddy";
import { t, timeCopy, useLang } from "./i18n";
import { ChatMarkdown } from "./markdown";
import { needsThreadStamp, threadClock } from "./time";

const BUBBLE_AVATAR = 34;
const COLLAPSE_AVATAR = 18;

export type ThreadItem = {
  id: string;
  author: "user" | "bot";
  name: string;
  bot?: Bot;
  content: string;
  thinking?: boolean;
  fromPeer?: boolean;
  handoff?: boolean;
  shared?: boolean;
  toBotIds?: string[];
  createdAt?: string;
  showName?: boolean;
};

function Avatar({ item, size = BUBBLE_AVATAR }: { item: ThreadItem; size?: number }) {
  if (item.bot) {
    return <BotFace bot={item.bot} mood={item.thinking ? "thinking" : "idle"} size={size} />;
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-surface-3 text-[9px] font-semibold"
      style={{ width: size, height: size }}
    >
      {item.name.slice(0, 2)}
    </span>
  );
}

function Bubble({
  item,
  inspect = false,
  names = [],
}: {
  item: ThreadItem;
  inspect?: boolean;
  names?: string[];
}) {
  const isUser = item.author === "user";
  const face = inspect ? COLLAPSE_AVATAR : BUBBLE_AVATAR;

  return (
    <div className={`chat-row ${isUser ? "is-user" : "is-bot"}`}>
      {!isUser && (
        <span className="chat-avatar">
          <Avatar item={item} size={face} />
        </span>
      )}
      <div className={`chat-bubble ${isUser ? "is-user" : "is-bot"}`}>
        {item.showName && <p className="chat-name">{item.name}</p>}
        {item.thinking && !item.content ? (
          <p className="text-wait">{t("thinking")}</p>
        ) : (
          <ChatMarkdown text={item.content} names={names} />
        )}
      </div>
    </div>
  );
}

function recipientFaces(items: ThreadItem[], bots: Bot[], viewerId?: string): ThreadItem[] {
  const roster = bots.map((bot) => ({ id: bot.id, name: bot.name }));
  return hopCounterpartIds(
    items.map((item) => ({
      toBotIds: item.toBotIds,
      content: item.content,
      botId: item.bot?.id,
      fromBotId: item.fromPeer ? item.bot?.id : undefined,
    })),
    roster,
    viewerId,
  ).map((id) => {
    const bot = bots.find((item) => item.id === id);
    return {
      id,
      author: "bot" as const,
      name: bot?.name ?? id,
      bot,
      content: "",
    };
  });
}

function CollapseRow({
  items,
  bots,
  viewerId,
  expanded,
  onToggle,
}: {
  items: ThreadItem[];
  bots: Bot[];
  viewerId?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const faces = recipientFaces(items, bots, viewerId);
  const single = faces.length === 1 ? faces[0] : undefined;
  const label = single ? single.name : t("messagedBots", { n: faces.length });

  return (
    <div className="chat-collapse">
      <button
        type="button"
        className="chat-collapse-btn"
        aria-expanded={expanded}
        title={expanded ? t("collapseHide") : t("collapseShow")}
        onClick={onToggle}
      >
        <span>{t("messaged")}</span>
        <span
          className="relative inline-flex"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <span className="chat-collapse-avatars">
            {faces.slice(0, 4).map((item) => (
              <span key={item.bot?.id ?? item.name}>
                <Avatar item={item} size={COLLAPSE_AVATAR} />
              </span>
            ))}
          </span>
          {open && faces.length > 0 && (
            <ul className="chat-collapse-pop">
              {faces.map((item) => (
                <li key={item.bot?.id ?? item.name}>
                  <Avatar item={item} size={COLLAPSE_AVATAR} />
                  {item.name}
                </li>
              ))}
            </ul>
          )}
        </span>
        {faces.length > 0 && <span>{label}</span>}
      </button>
    </div>
  );
}

export function Thread({
  items,
  bots = [],
  viewerId,
  empty,
  collapseHandoffs = false,
}: {
  items: ThreadItem[];
  bots?: Bot[];
  viewerId?: string;
  empty: ReactNode;
  collapseHandoffs?: boolean;
}) {
  useLang();
  const [openBundles, setOpenBundles] = useState<Record<string, boolean>>({});
  const names = bots.map((bot) => bot.name);

  if (items.length === 0) return <>{empty}</>;

  const segments = collapseHandoffs
    ? bundleHandoffs(
        items,
        (item) => item.author === "user",
        (item) => Boolean(item.handoff || item.fromPeer),
      )
    : items.map((item) => ({ kind: "item" as const, item }));

  let previousStamp: string | undefined;

  return (
    <ol className="chat-thread">
      {segments.map((segment) => {
        if (segment.kind === "bundle") {
          const key = segment.items.map((item) => item.id).join(":");
          const expanded = Boolean(openBundles[key]);
          const first = segment.items[0];
          const stamp = needsThreadStamp(previousStamp, first?.createdAt);
          previousStamp = segment.items.at(-1)?.createdAt ?? previousStamp;
          return (
            <li key={key} className={`chat-item fade-up${stamp ? " has-stamp" : ""}`}>
              {stamp && first?.createdAt && (
                <p className="chat-stamp">{threadClock(first.createdAt, undefined, timeCopy())}</p>
              )}
              <CollapseRow
                items={segment.items}
                bots={bots}
                viewerId={viewerId}
                expanded={expanded}
                onToggle={() =>
                  setOpenBundles((current) => ({ ...current, [key]: !current[key] }))
                }
              />
              {expanded && (
                <div className="chat-inspect">
                  {segment.items.map((item) => (
                    <div key={item.id} className="mt-2 first:mt-0">
                      <Bubble item={item} inspect names={names} />
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        }

        const item = segment.item;
        const stamp = needsThreadStamp(previousStamp, item.createdAt);
        previousStamp = item.createdAt ?? previousStamp;
        return (
          <li key={item.id} className={`chat-item fade-up${stamp ? " has-stamp" : ""}`}>
            {stamp && <p className="chat-stamp">{threadClock(item.createdAt, undefined, timeCopy())}</p>}
            <Bubble item={item} names={names} />
          </li>
        );
      })}
    </ol>
  );
}
