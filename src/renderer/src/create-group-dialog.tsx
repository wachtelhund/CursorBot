import type { Bot } from "@shared/types";
import { BotFace } from "./buddy";
import { t, useLang } from "./i18n";
import { CrossIcon } from "./icons";

type CreateGroupDialogProps = {
  bots: Bot[];
  error?: string | null;
  onClose: () => void;
  onCreate: (form: FormData) => void;
};

export function CreateGroupDialog({
  bots,
  error,
  onClose,
  onCreate,
}: CreateGroupDialogProps) {
  useLang();
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/70 p-4">
      <form
        className="w-full max-w-md rounded-3xl border border-line bg-surface-alt p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(new FormData(event.currentTarget));
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold">{t("newGroup")}</h2>
            <p className="text-[13px] text-mute">{t("pickMembers")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-mute hover:bg-white/5 hover:text-ink"
          >
            <CrossIcon />
          </button>
        </div>
        <label className="mt-4 block text-[12px] text-mute">
          {t("groupName")}
          <input
            name="name"
            required
            placeholder="App"
            className="mt-1 w-full rounded-2xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none"
          />
        </label>
        <fieldset className="mt-3">
          <legend className="text-[12px] text-mute">{t("members")}</legend>
          <div className="mt-1 max-h-56 overflow-y-auto rounded-2xl border border-line bg-surface">
            {bots.map((bot) => (
              <label
                key={bot.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[14px] hover:bg-white/[0.03]"
              >
                <input type="checkbox" name="botIds" value={bot.id} />
                <BotFace bot={bot} size={22} />
                <span className="truncate">{bot.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {(error || typeof window.cursorBots.createGroup !== "function") && (
          <p className="mt-3 text-[13px] text-danger">
            {typeof window.cursorBots.createGroup !== "function"
              ? t("restartAppWindow")
              : error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-mute">
            {t("cancel")}
          </button>
          <button
            type="submit"
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            {t("create")}
          </button>
        </div>
      </form>
    </div>
  );
}
