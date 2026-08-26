import { useEffect, useState } from "react";
import type { AppSettings, SecretName } from "@shared/types";
import type { UpdateCheckResult, UpdateProgress } from "@shared/updates";
import { t } from "./i18n";
import { CrossIcon } from "./icons";

type CheckStatus = "idle" | "checking" | "current" | "available" | "error";

type SettingsPanelProps = {
  hasApiKey: boolean | null;
  secrets: SecretName[];
  apiKeyDraft: string;
  appVersion?: string;
  onApiKeyDraft: (value: string) => void;
  onSaveKey: () => Promise<void>;
  onSettings: (settings: AppSettings) => void;
  onUpdateResult: (result: UpdateCheckResult) => void;
  onClose: () => void;
};

export function SettingsPanel({
  hasApiKey,
  secrets,
  apiKeyDraft,
  appVersion,
  onApiKeyDraft,
  onSaveKey,
  onSettings,
  onUpdateResult,
  onClose,
}: SettingsPanelProps) {
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [secretError, setSecretError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkStatus, setCheckStatus] = useState<CheckStatus>("idle");
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const isPhone = Boolean(window.cursorBotsIsRemote);

  useEffect(() => {
    return window.cursorBots.onUpdateProgress?.((next) => {
      setProgress(next);
      if (next.phase === "error") setApplyError(next.message ?? t("updateFailed"));
    });
  }, []);

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

  async function checkForUpdates() {
    if (typeof window.cursorBots.checkForUpdates !== "function") {
      setCheckStatus("error");
      setCheckError(t("restartAppWindow"));
      return;
    }
    setCheckStatus("checking");
    setCheckError(null);
    try {
      const result = await window.cursorBots.checkForUpdates();
      setCheckResult(result);
      setCheckStatus(result.available ? "available" : "current");
      onUpdateResult(result);
    } catch {
      setCheckStatus("error");
      setCheckError(t("updateCheckFailed"));
    }
  }

  async function applyUpdate() {
    if (typeof window.cursorBots.applyUpdate !== "function") {
      setApplyError(t("restartAppWindow"));
      return;
    }
    setApplyError(null);
    setProgress({ phase: "downloading", percent: 0 });
    try {
      await window.cursorBots.applyUpdate();
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : t("updateFailed"));
      setProgress(null);
    }
  }

  function updateLabel(version: string): string {
    if (progress?.phase === "downloading") {
      return t("downloadingUpdate", { percent: progress.percent ?? 0 });
    }
    if (progress?.phase === "installing" || progress?.phase === "restarting") {
      return t("installingUpdate");
    }
    return t("updateTo", { version });
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

        {!isPhone && (
        <div className="mt-4">
          <h3 className="text-[13px] font-medium text-ink">{t("updates")}</h3>
          {appVersion && (
            <p className="mt-1 text-[13px] text-mute">
              {t("currentVersion", { version: appVersion })}
            </p>
          )}
          {checkStatus === "current" && checkResult && (
            <p className="mt-2 text-[13px] text-ink">
              {t("upToDate", { version: checkResult.currentVersion })}
            </p>
          )}
          {checkStatus === "available" && checkResult?.available && (
            <div className="mt-2">
              <p className="text-[13px] text-ink">
                {t("updateAvailable", { version: checkResult.version })}
              </p>
              {checkResult.notes && (
                <p className="mt-2 max-h-20 overflow-y-auto whitespace-pre-wrap text-[12px] text-mute">
                  {checkResult.notes}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(progress && progress.phase !== "error")}
                  onClick={() => void applyUpdate()}
                  className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-30"
                >
                  {updateLabel(checkResult.version)}
                </button>
              </div>
              {applyError && <p className="mt-2 text-[12px] text-danger">{applyError}</p>}
            </div>
          )}
          {checkStatus === "error" && checkError && (
            <p className="mt-2 text-[12px] text-danger">{checkError}</p>
          )}
          <button
            type="button"
            disabled={checkStatus === "checking"}
            onClick={() => void checkForUpdates()}
            className="mt-3 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black disabled:opacity-30"
          >
            {checkStatus === "checking" ? t("checkingForUpdates") : t("checkForUpdates")}
          </button>
        </div>
        )}

        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-[13px] font-medium text-ink">{t("phoneAccess")}</h3>
          <p className="mt-1 text-[13px] leading-5 text-mute">{t("phoneHelp")}</p>
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

        {!isPhone && (
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
        )}
      </div>
    </div>
  );
}
