export const GITHUB_REPO = "wachtelhund/CursorBot";
export const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const LATEST_RELEASE_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;

export type UpdateAvailable = {
  available: true;
  currentVersion: string;
  version: string;
  url: string;
  notes: string;
};

export type UpdateCurrent = {
  available: false;
  currentVersion: string;
  version: string;
  url: string;
  notes: string;
};

export type UpdateCheckResult = UpdateAvailable | UpdateCurrent;

export function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "");
}

export function versionParts(raw: string): [number, number, number] {
  const core = normalizeVersion(raw).split("-")[0] ?? "0";
  const bits = core.split(".").map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return [bits[0] ?? 0, bits[1] ?? 0, bits[2] ?? 0];
}

export function isNewerVersion(latest: string, current: string): boolean {
  const next = versionParts(latest);
  const now = versionParts(current);
  for (let i = 0; i < 3; i++) {
    if (next[i] !== now[i]) return next[i] > now[i];
  }
  return false;
}

export function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.href;
  } catch {
    // Ignore invalid URLs.
  }
  return undefined;
}

export function parseLatestRelease(payload: unknown, currentVersion: string): UpdateCheckResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid release payload");
  }
  const data = payload as { tag_name?: unknown; html_url?: unknown; body?: unknown };
  if (typeof data.tag_name !== "string" || !data.tag_name.trim()) {
    throw new Error("Invalid release payload");
  }
  const version = normalizeVersion(data.tag_name);
  const current = normalizeVersion(currentVersion);
  const url = httpsUrl(data.html_url) ?? LATEST_RELEASE_PAGE;
  const notes = typeof data.body === "string" ? data.body.trim() : "";
  if (isNewerVersion(version, current)) {
    return { available: true, currentVersion: current, version, url, notes };
  }
  return { available: false, currentVersion: current, version, url, notes };
}
