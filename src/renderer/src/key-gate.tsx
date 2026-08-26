import { useState } from "react";
import { writeCloudKey } from "./cloud-api";
import { t } from "./i18n";

export function KeyGate({ onReady }: { onReady: () => void }) {
  const [draft, setDraft] = useState("");

  return (
    <div className="grid h-full place-items-center bg-surface px-6 text-center text-ink">
      <form
        className="w-full max-w-sm text-left"
        onSubmit={(event) => {
          event.preventDefault();
          writeCloudKey(draft);
          onReady();
        }}
      >
        <p className="text-[20px] font-semibold">{t("cursorApiKey")}</p>
        <p className="mt-2 text-[14px] leading-6 text-mute">{t("phoneKeyHelp")}</p>
        <input
          type="password"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="cursor_…"
          className="mt-4 w-full rounded-2xl border border-line bg-surface-alt px-3 py-2.5 text-[14px] outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="mt-3 w-full rounded-full bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-30"
        >
          {t("saveKey")}
        </button>
      </form>
    </div>
  );
}
