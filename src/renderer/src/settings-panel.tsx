import { useState } from "react";
import type { AppSettings, SecretName } from "@shared/types";
import { t, useLang } from "./i18n";
import { CrossIcon } from "./icons";

type SettingsPanelProps = {
  hasApiKey: boolean | null;
  secrets: SecretName[];
  apiKeyDraft: string;
  onApiKeyDraft: (value: string) => void;
  onSaveKey: () => Promise<void>;
  onSettings: (settings: AppSettings) => void;
  onClose: () => void;
};

export function SettingsPanel({
  hasApiKey,
  secrets,
  apiKeyDraft,
  onApiKeyDraft,
  onSaveKey,
  onSettings,
  onClose,
}: SettingsPanelProps) {
  const { lang, setLang } = useLang();
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [secretError, setSecretError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveSecret() {
    setSecretError(null);
    setBusy(true);
    try {
      const settings = await window.cursorBots.upsertSecret({
        name: secretName,
        value: secretValue,
      });
      onSettings(settings);
      setSecretName("");
      setSecretValue("");
    } catch (error) {
      setSecretError(error instanceof Error ? error.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function removeSecret(name: string) {
    setSecretError(null);
    setBusy(true);
    try {
      onSettings(await window.cursorBots.deleteSecret(name));
    } catch (error) {
      setSecretError(error instanceof Error ? error.message : t("couldNotDelete"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/70 p-4">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-3xl border border-line bg-surface-alt p-5">
        <div className="flex items-start justify-between">
          <h2 className="text-[16px] font-semibold">{t("settings")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-mute hover:bg-white/5 hover:text-ink"
          >
            <CrossIcon />
          </button>
        </div>

        <div className="mt-4">
          <h3 className="text-[13px] font-medium text-ink">{t("language")}</h3>
          <p className="mt-1 text-[13px] text-mute">
            {lang === "sv" ? t("languageSv") : t("languageEn")}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`rounded-full px-3 py-1.5 text-sm ${
                lang === "en" ? "bg-white/10 text-ink" : "text-mute hover:text-ink"
              }`}
              aria-pressed={lang === "en"}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang("sv")}
              className={`rounded-full px-3 py-1.5 text-sm ${
                lang === "sv" ? "bg-white/10 text-ink" : "text-mute hover:text-ink"
              }`}
              aria-pressed={lang === "sv"}
            >
              SV
            </button>
          </div>
        </div>

        <form
          className="mt-6 border-t border-line pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void onSaveKey();
          }}
        >
          <h3 className="text-[13px] font-medium text-ink">{t("cursorApiKey")}</h3>
          <p className="mt-1 text-[13px] text-mute">{t("apiKeyHelp")}</p>
          <input
            type="password"
            value={apiKeyDraft}
            onChange={(event) => onApiKeyDraft(event.target.value)}
            placeholder={hasApiKey ? t("pasteToReplace") : "cursor_…"}
            className="mt-3 w-full rounded-2xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none"
          />
          <div className="mt-3 flex justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                void window.cursorBots.openExternal("https://cursor.com/dashboard/api")
              }
              className="rounded-full px-3 py-1.5 text-sm text-mute hover:text-ink"
            >
              Dashboard
            </button>
            <button
              type="submit"
              disabled={!apiKeyDraft.trim()}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-30"
            >
              {t("saveKey")}
            </button>
          </div>
        </form>

        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-[13px] font-medium text-ink">{t("sharedSecrets")}</h3>
          <p className="mt-1 text-[13px] leading-5 text-mute">{t("secretsHelp")}</p>
          <button
            type="button"
            onClick={() => void window.cursorBots.openExternal("https://cursor.com/dashboard")}
            className="mt-2 text-[12px] text-mute underline"
          >
            {t("openCursorDashboard")}
          </button>

          {secrets.length > 0 && (
            <ul className="mt-3 space-y-1">
              {secrets.map((secret) => (
                <li
                  key={secret.name}
                  className="flex items-center justify-between rounded-2xl bg-surface px-3 py-2"
                >
                  <code className="text-[13px] text-ink">{secret.name}</code>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeSecret(secret.name)}
                    className="text-[12px] text-faint hover:text-danger"
                  >
                    {t("delete")}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveSecret();
            }}
          >
            <input
              value={secretName}
              onChange={(event) => setSecretName(event.target.value)}
              placeholder="OPENAI_API_KEY"
              className="w-full rounded-2xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none"
            />
            <input
              type="password"
              value={secretValue}
              onChange={(event) => setSecretValue(event.target.value)}
              placeholder={
                secrets.some((secret) => secret.name === secretName.trim())
                  ? t("leaveEmptyToKeep")
                  : t("value")
              }
              className="mt-2 w-full rounded-2xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none"
            />
            {secretError && <p className="mt-2 text-[12px] text-danger">{secretError}</p>}
            <button
              type="submit"
              disabled={busy || !secretName.trim()}
              className="mt-3 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black disabled:opacity-30"
            >
              {t("saveSecret")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
