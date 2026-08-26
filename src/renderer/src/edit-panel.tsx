import { useEffect, useRef, useState } from "react";
import {
  BUDDY_KINDS,
  type Bot,
  type BuddyKind,
  type ModelOption,
  type UsagePayload,
} from "@shared/types";
import { BotFace, buddyKindFor } from "./buddy";
import { localeTag, t, useLang } from "./i18n";

const DEFAULT_MODEL = "composer-2.5";
const AVATAR_MAX_BYTES = 300 * 1024;

type EditPanelProps = {
  bot: Bot;
  models: ModelOption[];
  hasApiKey: boolean | null;
  onOpenAgent: () => void;
  onCancel: () => void;
  onSaved: (bot: Bot) => void;
};

function formatMoney(cents: number): string {
  return new Intl.NumberFormat(localeTag(), {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > AVATAR_MAX_BYTES) {
      reject(new Error("too-large"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      if (!result.startsWith("data:image/")) {
        reject(new Error("invalid"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("invalid"));
    reader.readAsDataURL(file);
  });
}

export function EditPanel({
  bot,
  models,
  hasApiKey,
  onOpenAgent,
  onCancel,
  onSaved,
}: EditPanelProps) {
  useLang();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(bot.name);
  const [role, setRole] = useState(bot.role);
  const [model, setModel] = useState(bot.model || DEFAULT_MODEL);
  const [repoUrl, setRepoUrl] = useState(bot.repoUrl ?? "");
  const [startingRef, setStartingRef] = useState(bot.startingRef ?? "");
  const [character, setCharacter] = useState<BuddyKind>(buddyKindFor(bot));
  const [avatar, setAvatar] = useState(bot.avatar ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<UsagePayload>(null);

  useEffect(() => {
    setName(bot.name);
    setRole(bot.role);
    setModel(bot.model || DEFAULT_MODEL);
    setRepoUrl(bot.repoUrl ?? "");
    setStartingRef(bot.startingRef ?? "");
    setCharacter(buddyKindFor(bot));
    setAvatar(bot.avatar ?? "");
    setError(null);
  }, [bot.id]);

  useEffect(() => {
    if (!bot.agentId || !hasApiKey) {
      setUsage(null);
      return;
    }
    let cancelled = false;
    window.cursorBots
      .getUsage(bot.id)
      .then((next) => {
        if (!cancelled) setUsage(next);
      })
      .catch(() => {
        if (!cancelled) setUsage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bot.id, bot.agentId, hasApiKey]);

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setAvatar(await readImage(file));
    } catch (err) {
      setError(
        err instanceof Error && err.message === "too-large"
          ? t("photoTooLarge")
          : t("couldNotSave"),
      );
    }
  }

  async function save() {
    const nextName = name.trim();
    if (!nextName) {
      setError(t("nameRequired"));
      return;
    }
    if (typeof window.cursorBots.updateBot !== "function") {
      setError(t("restartAppWindow"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await window.cursorBots.updateBot(bot.id, {
        name: nextName,
        role,
        model,
        repoUrl,
        startingRef,
        character,
        avatar,
      });
      onSaved(updated);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(raw.includes("is not a function") ? t("restartAppWindow") : raw || t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  const draft = { id: bot.id, character, avatar: avatar || undefined };
  const usageParts = [
    usage?.cost ? formatMoney(usage.cost.chargedCents) : null,
    usage?.usage?.totalTokens
      ? t("usageTokens", { n: usage.usage.totalTokens.toLocaleString(localeTag()) })
      : null,
  ].filter(Boolean);
  const usageLine = usageParts.length > 0
    ? usageParts.join(" · ")
    : bot.agentId
      ? t("noUsageYet")
      : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <form
        className="mx-auto w-full max-w-md"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h2 className="text-[16px] font-semibold">{t("editBot")}</h2>

        <div className="mt-4 flex items-center gap-3">
          <BotFace bot={draft} size={64} />
          <div className="min-w-0">
            <p className="text-[12px] text-mute">{t("profilePhoto")}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="rounded-full bg-white/10 px-3 py-1.5 text-[12px] text-ink hover:bg-white/15"
              >
                {t("uploadPhoto")}
              </button>
              {avatar ? (
                <button
                  type="button"
                  onClick={() => setAvatar("")}
                  className="rounded-full px-3 py-1.5 text-[12px] text-mute hover:text-ink"
                >
                  {t("removePhoto")}
                </button>
              ) : null}
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void onPickPhoto(file);
            }}
          />
        </div>

        <p className="mt-4 text-[12px] text-mute">{t("character")}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {BUDDY_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setCharacter(kind)}
              className={`rounded-2xl p-1.5 ${
                character === kind ? "bg-white/10 ring-1 ring-white/25" : "hover:bg-white/5"
              }`}
            >
              <BotFace bot={{ id: bot.id, character: kind }} size={40} />
            </button>
          ))}
        </div>

        <label className="mt-4 block text-[12px] text-mute">
          {t("name")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="mt-1 w-full rounded-2xl border border-line bg-surface-alt px-3 py-2.5 text-[14px] text-ink outline-none"
          />
        </label>
        <label className="mt-3 block text-[12px] text-mute">
          {t("description")}
          <textarea
            value={role}
            onChange={(event) => setRole(event.target.value)}
            rows={2}
            placeholder={t("rolePlaceholder")}
            className="mt-1 w-full rounded-2xl border border-line bg-surface-alt px-3 py-2.5 text-[14px] text-ink outline-none"
          />
        </label>
        <label className="mt-3 block text-[12px] text-mute">
          {t("model")}
          {models.length > 0 ? (
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-line bg-surface-alt px-3 py-2.5 text-[14px] text-ink outline-none"
            >
              {!models.some((item) => item.id === model) && (
                <option value={model}>{model}</option>
              )}
              {models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-line bg-surface-alt px-3 py-2.5 text-[14px] text-ink outline-none"
            />
          )}
        </label>
        <label className="mt-3 block text-[12px] text-mute">
          {t("repoUrlOptional")}
          <input
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder="https://github.com/org/repo"
            className="mt-1 w-full rounded-2xl border border-line bg-surface-alt px-3 py-2.5 text-[14px] text-ink outline-none"
          />
        </label>
        <label className="mt-3 block text-[12px] text-mute">
          {t("startingRefOptional")}
          <input
            value={startingRef}
            onChange={(event) => setStartingRef(event.target.value)}
            placeholder="main"
            className="mt-1 w-full rounded-2xl border border-line bg-surface-alt px-3 py-2.5 text-[14px] text-ink outline-none"
          />
        </label>

        {bot.agentId && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[12px] text-mute">{t("cloudAgent")}</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <code className="min-w-0 truncate text-[12px] text-ink">{bot.agentId}</code>
              <button
                type="button"
                onClick={onOpenAgent}
                className="shrink-0 rounded-full px-3 py-1.5 text-[12px] text-mute hover:text-ink"
              >
                {t("openInCursor")}
              </button>
            </div>
            {usageLine && (
              <p className="mt-2 text-[12px] text-faint">
                {t("usage")} · {usageLine}
              </p>
            )}
          </div>
        )}

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
