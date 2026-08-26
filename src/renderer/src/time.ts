const STAMP_GAP_MS = 5 * 60 * 1000;

export type TimeCopy = {
  locale: string;
  today: string;
  yesterday: string;
};

export const DEFAULT_TIME_COPY: TimeCopy = {
  locale: "en-US",
  today: "Today",
  yesterday: "Yesterday",
};

function parsedDate(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dayDiff(from: Date, now: Date): number {
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((startOfNow.getTime() - startOfFrom.getTime()) / 86_400_000);
}

function clockTime(date: Date): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function relativeTime(
  iso?: string,
  now = new Date(),
  copy: TimeCopy = DEFAULT_TIME_COPY,
): string {
  const date = parsedDate(iso);
  if (!date) return "";

  const days = dayDiff(date, now);
  if (days === 0) return clockTime(date);
  if (days === 1) return copy.yesterday;
  if (days < 7) {
    return date.toLocaleDateString(copy.locale, { weekday: "long" });
  }
  return date.toLocaleDateString(copy.locale, { day: "numeric", month: "short" });
}

/** Thread stamp: "Today 8:51". */
export function threadClock(
  iso?: string,
  now = new Date(),
  copy: TimeCopy = DEFAULT_TIME_COPY,
): string {
  const date = parsedDate(iso);
  if (!date) return "";

  const time = clockTime(date);
  const days = dayDiff(date, now);
  if (days === 0) return `${copy.today} ${time}`;
  if (days === 1) return `${copy.yesterday} ${time}`;
  if (days > 1 && days < 7) {
    const weekday = date.toLocaleDateString(copy.locale, { weekday: "long" });
    return `${weekday} ${time}`;
  }
  const day = date.toLocaleDateString(copy.locale, { day: "numeric", month: "short" });
  return `${day} ${time}`;
}

export function needsThreadStamp(
  prevIso?: string,
  nextIso?: string,
  gapMs = STAMP_GAP_MS,
): boolean {
  const next = parsedDate(nextIso);
  if (!next) return false;
  const prev = parsedDate(prevIso);
  if (!prev) return true;
  if (dayDiff(next, prev) !== 0) return true;
  return next.getTime() - prev.getTime() >= gapMs;
}

export function lastPreview(content: string): string {
  const line = content.replace(/\s+/g, " ").trim();
  if (!line) return "";
  return line.length > 42 ? `${line.slice(0, 41)}…` : line;
}
