import { useMemo, useRef, useState } from "react";
import { filterRoster, mentionQueryAt } from "@shared/mentions";
import type { Bot } from "@shared/types";
import { BotFace } from "./buddy";
import { t, useLang } from "./i18n";
import { PlusIcon, SendMessageIcon } from "./icons";

type ComposerProps = {
  bots: Bot[];
  draft: string;
  placeholder: string;
  disabled?: boolean;
  onDraft: (value: string) => void;
  onSend: () => void;
};

export function Composer({
  bots,
  draft,
  placeholder,
  disabled,
  onDraft,
  onSend,
}: ComposerProps) {
  useLang();
  const area = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);

  const names = bots.map((bot) => bot.name);
  const mention = mentionQueryAt(draft, caret, names);
  const suggestions = useMemo(() => {
    if (!mention) return [];
    return filterRoster(
      bots.map((bot) => ({ id: bot.id, name: bot.name })),
      mention.query,
    ).slice(0, 6);
  }, [bots, mention]);

  function applyMention(name: string) {
    if (!mention) return;
    const next = `${draft.slice(0, mention.start)}@${name} ${draft.slice(caret)}`;
    onDraft(next);
    const pos = mention.start + name.length + 2;
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      {suggestions.length > 0 && (
        <div className="absolute inset-x-3 bottom-full mb-2 overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-lg">
          {suggestions.map((bot, index) => {
            const full = bots.find((item) => item.id === bot.id);
            return (
              <button
                key={bot.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  applyMention(bot.name);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  index === active ? "bg-white/5" : "hover:bg-white/[0.03]"
                }`}
              >
                {full && <BotFace bot={full} size={22} />}
                <span className="font-medium">@{bot.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <form
        className="composer-bar"
        title={t("composerHint")}
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) onSend();
        }}
      >
        <span className="composer-plus" aria-hidden="true">
          <PlusIcon size={18} />
        </span>
        <textarea
          ref={area}
          value={draft}
          rows={1}
          placeholder={placeholder}
          className="composer-input"
          onChange={(event) => {
            onDraft(event.target.value);
            setCaret(event.target.selectionStart);
            event.target.style.height = "auto";
            event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
          }}
          onClick={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={(event) => {
            if (suggestions.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => (index + 1) % suggestions.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => (index - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
                const pick = suggestions[active];
                if (pick) {
                  event.preventDefault();
                  applyMention(pick.name);
                  return;
                }
              }
              if (event.key === "Escape") {
                setCaret(0);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!disabled) onSend();
            }
          }}
        />
        <button
          type="submit"
          disabled={disabled || !draft.trim()}
          className="composer-send"
          title={t("send")}
        >
          <SendMessageIcon size={14} />
        </button>
      </form>
    </div>
  );
}
