import { useEffect, useState } from "react";
import type { Bot, BotGroup } from "@shared/types";
import { BotFace } from "./buddy";
import { t, useLang } from "./i18n";

type GroupEditPanelProps = {
  group: BotGroup;
  bots: Bot[];
  onCancel: () => void;
  onSaved: (group: BotGroup) => void;
};

export function GroupEditPanel({ group, bots, onCancel, onSaved }: GroupEditPanelProps) {
  useLang();
  const [name, setName] = useState(group.name);
  const [botIds, setBotIds] = useState<string[]>(group.botIds);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(group.name);
    setBotIds(group.botIds);
    setError(null);
  }, [group.id]);

  function toggle(botId: string) {
    setBotIds((current) =>
      current.includes(botId) ? current.filter((id) => id !== botId) : [...current, botId],
    );
  }

  async function save() {
    const nextName = name.trim();
    if (!nextName) {
      setError(t("nameRequired"));
      return;
    }
    if (botIds.length === 0) {
      setError(t("noMembersSelected"));
      return;
    }
    if (typeof window.cursorBots.updateGroup !== "function") {
      setError(t("restartAppWindow"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await window.cursorBots.updateGroup(group.id, {
        name: nextName,
        botIds,
      });
      onSaved(updated);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(raw.includes("is not a function") ? t("restartAppWindow") : raw || t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <form
        className="mx-auto w-full max-w-md"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h2 className="text-[16px] font-semibold">{t("editGroup")}</h2>
        <label className="mt-4 block text-[12px] text-mute">
          {t("groupName")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="mt-1 w-full rounded-2xl border border-line bg-surface-alt px-3 py-2.5 text-[14px] text-ink outline-none"
          />
        </label>
        <fieldset className="mt-3">
          <legend className="text-[12px] text-mute">{t("members")}</legend>
          <div className="mt-1 max-h-72 overflow-y-auto rounded-2xl border border-line bg-surface-alt">
            {bots.map((bot) => (
              <label
                key={bot.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[14px] hover:bg-white/[0.03]"
              >
                <input
                  type="checkbox"
                  checked={botIds.includes(bot.id)}
                  onChange={() => toggle(bot.id)}
                />
                <BotFace bot={bot} size={22} />
                <span className="truncate">{bot.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm text-mute hover:text-ink"
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {t("save")}
          </button>
        </div>
      </form>
    </div>
  );
}
