import { t } from "./i18n";

export function RemoteGate() {
  return (
    <div className="grid h-full place-items-center bg-surface px-6 text-center text-ink">
      <div className="max-w-sm">
        <p className="text-[20px] font-semibold">{t("phoneAccess")}</p>
        <p className="mt-3 text-[14px] leading-6 text-mute">{t("phoneOpenLink")}</p>
      </div>
    </div>
  );
}
