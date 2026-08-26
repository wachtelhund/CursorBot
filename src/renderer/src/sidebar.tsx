import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Bot, BotGroup, TeamMessage } from "@shared/types";
import { TEAM_SCOPE } from "@shared/types";
import { dmActivityAt, isHandoffMessage, isRosterNotice, lastDmPreview } from "@shared/collapse";
import { publicBotText } from "@shared/mentions";
import { BotFace } from "./buddy";
import { t, timeCopy, useLang } from "./i18n";
import { DotsVerticalIcon, GearIcon, MessagesSquared, PlusIcon, SidebarIcon } from "./icons";
import { lastPreview, relativeTime } from "./time";

const LIST_MIN = 220;
const LIST_MAX = 520;
const LIST_DEFAULT = 300;
const WIDTH_KEY = "cursor-bots.sidebar-width";

type SidebarProps = {
  bots: Bot[];
  groups: BotGroup[];
  team: TeamMessage[];
  selectedId: string | null;
  thinkingIds: string[];
  filter: string;
  onFilter: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onCreateGroup: () => void;
  onPin: (bot: Bot) => void;
  onEdit: (bot: Bot) => void;
  onOpenAgent: (bot: Bot) => void;
  onCopyAgentLink: (bot: Bot) => void;
  onDelete: (bot: Bot) => void;
  onEditGroup: (group: BotGroup) => void;
  onDeleteGroup: (group: BotGroup) => void;
  onSettings: () => void;
};

type OverflowItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
};

function OverflowMenu({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: OverflowItem[];
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;

    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 196;
      const height = items.length * 36 + 12;
      let left = rect.right - width;
      let top = rect.bottom + 4;
      if (left < 8) left = 8;
      if (left + width > window.innerWidth - 8) {
        left = window.innerWidth - width - 8;
      }
      if (top + height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - height - 4);
      }
      setPos({ top, left });
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      onOpenChange(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }

    place();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, items.length, onOpenChange]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="grid size-7 place-items-center rounded-lg text-mute hover:text-ink"
        title={t("moreActions")}
        aria-label={t("moreActions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DotsVerticalIcon size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="row-overflow-menu"
            style={{ top: pos.top, left: pos.left }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.title}
                className={item.danger ? "is-danger" : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.disabled) return;
                  onOpenChange(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function readListWidth(): number {
  try {
    const raw = Number(localStorage.getItem(WIDTH_KEY));
    if (!Number.isFinite(raw)) return LIST_DEFAULT;
    if (raw === 0) return 0;
    return Math.min(LIST_MAX, Math.max(LIST_MIN, raw));
  } catch {
    return LIST_DEFAULT;
  }
}

function groupPreview(
  group: BotGroup,
  thinking: boolean,
): { text: string; wait: boolean } {
  if (thinking) return { text: t("thinking"), wait: true };
  const text = lastUserFacingTeam(group.messages);
  if (text) return { text: lastPreview(text), wait: false };
  return { text: t("groupMembers", { n: group.botIds.length }), wait: false };
}

function lastUserFacingTeam(messages: TeamMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.from === "user") return message.content;
    if (message.source === "handoff" || message.source === "system") continue;
    if (isRosterNotice(message.content) || isHandoffMessage(message)) continue;
    const text = publicBotText(message.content);
    if (text) return text;
  }
  return "";
}

function GroupRow({
  group,
  selected,
  thinking,
  menuOpen,
  onMenuOpenChange,
  onSelect,
  onEdit,
  onDelete,
}: {
  group: BotGroup;
  selected: boolean;
  thinking: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const preview = groupPreview(group, thinking);
  return (
    <div
      className={`bot-row mb-0.5 flex items-center rounded-2xl ${
        menuOpen ? "menu-open" : ""
      } ${selected ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left"
      >
        <span className="grid size-10 place-items-center rounded-full bg-surface-3 text-ink">
          <MessagesSquared size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[14px] font-semibold">{group.name}</span>
            <span className="row-time shrink-0 text-[11px] text-faint">
              {thinking ? (
                <span className="pulse-dot inline-block size-1.5 rounded-full bg-wait" />
              ) : (
                relativeTime(group.updatedAt, undefined, timeCopy())
              )}
            </span>
          </span>
          <span
            className={`mt-0.5 block truncate text-[12px] ${
              preview.wait ? "text-wait" : "text-mute"
            }`}
          >
            {preview.text}
          </span>
        </span>
      </button>
      <div className="row-actions mr-1.5 flex shrink-0 items-center">
        <OverflowMenu
          open={menuOpen}
          onOpenChange={onMenuOpenChange}
          items={[
            { label: t("edit"), onSelect: onEdit },
            { label: t("delete"), onSelect: onDelete, danger: true },
          ]}
        />
      </div>
    </div>
  );
}

function previewFor(bot: Bot, thinking: boolean, team: TeamMessage[]): { text: string; wait: boolean } {
  if (thinking) return { text: t("thinking"), wait: true };
  const text = lastDmPreview(bot.messages, { botId: bot.id, team });
  if (text) return { text: lastPreview(text), wait: false };
  return { text: bot.role || t("noActivity"), wait: false };
}

function BotRow({
  bot,
  team,
  selected,
  thinking,
  menuOpen,
  onMenuOpenChange,
  onSelect,
  onPin,
  onEdit,
  onOpenAgent,
  onCopyAgentLink,
  onDelete,
}: {
  bot: Bot;
  team: TeamMessage[];
  selected: boolean;
  thinking: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onSelect: () => void;
  onPin: () => void;
  onEdit: () => void;
  onOpenAgent: () => void;
  onCopyAgentLink: () => void;
  onDelete: () => void;
}) {
  const preview = previewFor(bot, thinking, team);
  return (
    <div
      className={`bot-row mb-0.5 flex items-center rounded-2xl ${
        menuOpen ? "menu-open" : ""
      } ${selected ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left"
      >
        <BotFace bot={bot} mood={thinking ? "thinking" : "idle"} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[14px] font-semibold">{bot.name}</span>
            <span className="row-time shrink-0 text-[11px] text-faint">
              {thinking ? (
                <span className="pulse-dot inline-block size-1.5 rounded-full bg-wait" />
              ) : (
                relativeTime(dmActivityAt(bot, team), undefined, timeCopy())
              )}
            </span>
          </span>
          <span
            className={`mt-0.5 block truncate text-[12px] ${
              preview.wait ? "text-wait" : "text-mute"
            }`}
          >
            {preview.text}
          </span>
        </span>
      </button>
      <div className="row-actions mr-1.5 flex shrink-0 items-center">
        <OverflowMenu
          open={menuOpen}
          onOpenChange={onMenuOpenChange}
          items={[
            { label: t("edit"), onSelect: onEdit },
            { label: bot.pinned ? t("unpin") : t("pin"), onSelect: onPin },
            {
              label: t("openInCursor"),
              onSelect: onOpenAgent,
              disabled: !bot.agentId,
              title: bot.agentId ? undefined : t("noCloudAgent"),
            },
            {
              label: t("copyAgentLink"),
              onSelect: onCopyAgentLink,
              disabled: !bot.agentId,
              title: bot.agentId ? undefined : t("noCloudAgent"),
            },
            { label: t("delete"), onSelect: onDelete, danger: true },
          ]}
        />
      </div>
    </div>
  );
}

export function Sidebar({
  bots,
  groups,
  team,
  selectedId,
  thinkingIds,
  filter,
  onFilter,
  onSelect,
  onCreate,
  onCreateGroup,
  onPin,
  onEdit,
  onOpenAgent,
  onCopyAgentLink,
  onDelete,
  onEditGroup,
  onDeleteGroup,
  onSettings,
}: SidebarProps) {
  const { lang, setLang } = useLang();
  const [listWidth, setListWidth] = useState(readListWidth);
  const [resizing, setResizing] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? bots.filter(
        (bot) =>
          bot.name.toLowerCase().includes(needle) ||
          bot.role.toLowerCase().includes(needle),
      )
    : bots;
  const pinned = visible.filter((bot) => bot.pinned);
  const recent = visible.filter((bot) => !bot.pinned);
  const visibleGroups = needle
    ? groups.filter((group) => group.name.toLowerCase().includes(needle))
    : groups;
  const collapsed = listWidth === 0;

  useEffect(() => {
    if (collapsed) setOpenMenuId(null);
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(listWidth));
    } catch {
      // Ignore quota / private mode.
    }
  }, [listWidth]);

  useEffect(() => {
    if (!resizing) return;

    function move(event: PointerEvent) {
      if (!drag.current) return;
      const next = drag.current.startW + (event.clientX - drag.current.startX);
      setListWidth(Math.min(LIST_MAX, Math.max(0, next)));
    }

    function up() {
      drag.current = null;
      setResizing(false);
      setListWidth((width) => {
        if (width < 140) return 0;
        return Math.min(LIST_MAX, Math.max(LIST_MIN, width));
      });
      document.body.classList.remove("is-resizing");
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [resizing]);

  function startResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    drag.current = { startX: event.clientX, startW: listWidth };
    setResizing(true);
    document.body.classList.add("is-resizing");
  }

  return (
    <aside className="relative flex h-full shrink-0">
      <div className="flex w-[52px] shrink-0 flex-col items-center border-r border-line bg-surface-alt pb-3">
        <div className="app-drag h-11 w-full shrink-0" />
        <div className="flex flex-1 flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => setListWidth((width) => (width === 0 ? LIST_DEFAULT : 0))}
            className="grid size-9 place-items-center rounded-lg text-mute hover:bg-white/5 hover:text-ink"
            title={collapsed ? t("showSidebar") : t("hideSidebar")}
          >
            <SidebarIcon size={18} />
          </button>
          <button
            type="button"
            onClick={() => onSelect(TEAM_SCOPE)}
            className={`grid size-9 place-items-center rounded-lg ${
              selectedId === TEAM_SCOPE ? "bg-white/10 text-ink" : "text-mute hover:bg-white/5 hover:text-ink"
            }`}
            title={t("team")}
          >
            <MessagesSquared size={18} />
          </button>
        </div>
        <div className="mb-1 flex flex-col items-center gap-0.5" role="group" aria-label={t("language")}>
          <button
            type="button"
            onClick={() => setLang("en")}
            className={`rounded px-1 py-0.5 text-[10px] font-semibold tracking-wide ${
              lang === "en" ? "text-ink" : "text-faint hover:text-ink"
            }`}
            aria-pressed={lang === "en"}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang("sv")}
            className={`rounded px-1 py-0.5 text-[10px] font-semibold tracking-wide ${
              lang === "sv" ? "text-ink" : "text-faint hover:text-ink"
            }`}
            aria-pressed={lang === "sv"}
          >
            SV
          </button>
        </div>
        <button
          type="button"
          onClick={onSettings}
          className="grid size-9 place-items-center rounded-lg text-mute hover:bg-white/5 hover:text-ink"
          title={t("settings")}
        >
          <GearIcon size={16} />
        </button>
      </div>

      {!collapsed && (
        <div
          className="flex min-w-0 flex-col border-r border-line bg-surface-alt"
          style={{ width: listWidth }}
        >
          <div className="app-drag h-11 shrink-0" />
          <div className="px-3 pb-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[13px] font-semibold tracking-tight text-ink">{t("chats")}</p>
              <button
                type="button"
                onClick={onCreate}
                className="grid size-7 place-items-center rounded-lg text-ink hover:bg-white/5"
                title={t("newBot")}
              >
                <PlusIcon size={16} />
              </button>
            </div>
            <input
              value={filter}
              onChange={(event) => onFilter(event.target.value)}
              placeholder={t("searchBots")}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-faint"
            />
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            <button
              type="button"
              onClick={() => onSelect(TEAM_SCOPE)}
              className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left ${
                selectedId === TEAM_SCOPE ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"
              }`}
            >
              <span className="grid size-10 place-items-center rounded-full bg-surface-3 text-accent">
                <MessagesSquared size={18} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{t("team")}</span>
                <span className="block truncate text-[12px] text-mute">
                  {thinkingIds.length > 0
                    ? t("thinkingCount", { n: thinkingIds.length })
                    : t("teamAllThread")}
                </span>
              </span>
            </button>

            {bots.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between pr-1">
                  <p className="list-section">{t("groups")}</p>
                  <button
                    type="button"
                    onClick={onCreateGroup}
                    className="grid size-7 place-items-center rounded-lg text-ink hover:bg-white/5"
                    title={t("newGroup")}
                  >
                    <PlusIcon size={14} />
                  </button>
                </div>
                {visibleGroups.map((group) => (
                  <GroupRow
                    key={group.id}
                    group={group}
                    selected={group.id === selectedId}
                    thinking={thinkingIds.some((id) => group.botIds.includes(id))}
                    menuOpen={openMenuId === group.id}
                    onMenuOpenChange={(open) => setOpenMenuId(open ? group.id : null)}
                    onSelect={() => onSelect(group.id)}
                    onEdit={() => onEditGroup(group)}
                    onDelete={() => onDeleteGroup(group)}
                  />
                ))}
              </div>
            )}

            {visible.length === 0 ? (
              <p className="px-3 pt-6 text-[13px] text-mute">
                {bots.length === 0 ? t("noBotsYet") : t("noMatches")}
              </p>
            ) : (
              <>
                {pinned.length > 0 && (
                  <div className="mt-2">
                    <p className="list-section">{t("pinned")}</p>
                    {pinned.map((bot) => (
                      <BotRow
                        key={bot.id}
                        bot={bot}
                        team={team}
                        selected={bot.id === selectedId}
                        thinking={thinkingIds.includes(bot.id)}
                        menuOpen={openMenuId === bot.id}
                        onMenuOpenChange={(open) => setOpenMenuId(open ? bot.id : null)}
                        onSelect={() => onSelect(bot.id)}
                        onPin={() => onPin(bot)}
                        onEdit={() => onEdit(bot)}
                        onOpenAgent={() => onOpenAgent(bot)}
                        onCopyAgentLink={() => onCopyAgentLink(bot)}
                        onDelete={() => onDelete(bot)}
                      />
                    ))}
                  </div>
                )}
                {recent.length > 0 && (
                  <div className={pinned.length > 0 ? "mt-2" : "mt-1"}>
                    <p className="list-section">{t("recent")}</p>
                    {recent.map((bot) => (
                      <BotRow
                        key={bot.id}
                        bot={bot}
                        team={team}
                        selected={bot.id === selectedId}
                        thinking={thinkingIds.includes(bot.id)}
                        menuOpen={openMenuId === bot.id}
                        onMenuOpenChange={(open) => setOpenMenuId(open ? bot.id : null)}
                        onSelect={() => onSelect(bot.id)}
                        onPin={() => onPin(bot)}
                        onEdit={() => onEdit(bot)}
                        onOpenAgent={() => onOpenAgent(bot)}
                        onCopyAgentLink={() => onCopyAgentLink(bot)}
                        onDelete={() => onDelete(bot)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </nav>
        </div>
      )}

      <button
        type="button"
        aria-label={t("resizeSidebarAria")}
        title={t("resizeSidebarTitle")}
        onPointerDown={startResize}
        onDoubleClick={() => setListWidth(LIST_DEFAULT)}
        className={`sidebar-resizer ${resizing ? "is-active" : ""}`}
      />
    </aside>
  );
}
