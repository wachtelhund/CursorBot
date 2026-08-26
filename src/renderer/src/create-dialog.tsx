import { BUDDY_KINDS, type BuddyKind, type ModelOption } from "@shared/types";
import { Buddy } from "./buddy";
import { t, useLang } from "./i18n";
import { CrossIcon } from "./icons";

const DEFAULT_MODEL = "composer-2.5";

type CreateDialogProps = {
  character: BuddyKind;
  models: ModelOption[];
  error?: string | null;
  onCharacter: (kind: BuddyKind) => void;
  onClose: () => void;
  onCreate: (form: FormData) => void;
};

export function CreateDialog({
  character,
  models,
  error,
  onCharacter,
  onClose,
  onCreate,
}: CreateDialogProps) {
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
          <div className="flex items-center gap-3">
            <Buddy kind={character} size={52} />
            <div>
              <h2 className="text-[16px] font-semibold">{t("newBot")}</h2>
              <p className="text-[13px] text-mute">{t("nameForMentions")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-mute hover:bg-white/5 hover:text-ink"
          >
            <CrossIcon />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {BUDDY_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => onCharacter(kind)}
              className={`rounded-2xl p-1.5 ${
                character === kind ? "bg-white/10 ring-1 ring-white/25" : "hover:bg-white/5"
              }`}
            >
              <Buddy kind={kind} size={40} />
            </button>
          ))}
        </div>
        <label className="mt-4 block text-[12px] text-mute">
          {t("name")}
          <input
            name="name"
            required
            placeholder="Research"
            className="mt-1 w-full rounded-2xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none"
          />
        </label>
        <label className="mt-3 block text-[12px] text-mute">
          {t("role")}
          <textarea
            name="role"
            rows={2}
            placeholder={t("rolePlaceholder")}
            className="mt-1 w-full rounded-2xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none"
          />
        </label>
        <label className="mt-3 block text-[12px] text-mute">
          {t("model")}
          {models.length > 0 ? (
            <select
              name="model"
              defaultValue={DEFAULT_MODEL}
              className="mt-1 w-full rounded-2xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none"
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName}
                </option>
              ))}
            </select>
          ) : (
            <input
              name="model"
              defaultValue={DEFAULT_MODEL}
              className="mt-1 w-full rounded-2xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none"
            />
          )}
        </label>
        <label className="mt-3 block text-[12px] text-mute">
          {t("repoUrlOptional")}
          <input
            name="repoUrl"
            placeholder="https://github.com/org/repo"
            className="mt-1 w-full rounded-2xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none"
          />
        </label>
        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
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
