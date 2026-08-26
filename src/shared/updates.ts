export const GITHUB_REPO = "wachtelhund/CursorBot";
export const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const LATEST_RELEASE_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;

export type ReleaseAsset = {
  name: string;
  url: string;
};

export type UpdateAvailable = {
  available: true;
  currentVersion: string;
  version: string;
  url: string;
  downloadUrl?: string;
  notes: string;
};

export type UpdateCurrent = {
  available: false;
  currentVersion: string;
  version: string;
  url: string;
  downloadUrl?: string;
  notes: string;
};

export type UpdateCheckResult = UpdateAvailable | UpdateCurrent;

export type UpdateProgress = {
  phase: "downloading" | "installing" | "restarting" | "error";
  percent?: number;
  message?: string;
};

export type ParseReleaseOpts = {
  platform?: string;
  arch?: string;
};

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

export function isAllowedInstallerUrl(value: string): boolean {
  const parsed = httpsUrl(value);
  if (!parsed) return false;
  try {
    const url = new URL(parsed);
    if (url.hostname !== "github.com") return false;
    const prefix = `/${GITHUB_REPO}/releases/download/`;
    if (!url.pathname.startsWith(prefix)) return false;
    return /\.(dmg|exe|AppImage)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function parseReleaseAssets(payload: unknown): ReleaseAsset[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as { assets?: unknown }).assets;
  if (!Array.isArray(raw)) return [];
  const assets: ReleaseAsset[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const name = (item as { name?: unknown }).name;
    const url = (item as { browser_download_url?: unknown }).browser_download_url;
    if (typeof name !== "string" || !name.trim()) continue;
    if (typeof url !== "string" || !isAllowedInstallerUrl(url)) continue;
    assets.push({ name: name.trim(), url });
  }
  return assets;
}

function platformNeedles(platform: string): { os: string[]; ext: string } | undefined {
  if (platform === "darwin") return { os: ["mac", "darwin"], ext: ".dmg" };
  if (platform === "win32") return { os: ["win", "windows"], ext: ".exe" };
  if (platform === "linux") return { os: ["linux"], ext: ".appimage" };
  return undefined;
}

function archNeedles(arch: string): string[] {
  return arch === "arm64" ? ["arm64", "aarch64"] : ["x64", "x86_64", "amd64"];
}

export function pickInstallerUrl(
  assets: ReleaseAsset[],
  platform: string,
  arch: string,
): string | undefined {
  const want = platformNeedles(platform);
  if (!want) return undefined;
  const named = assets.filter((asset) => {
    const name = asset.name.toLowerCase();
    if (!name.endsWith(want.ext)) return false;
    if (name.includes("blockmap")) return false;
    return want.os.some((os) => name.includes(os));
  });
  const archHit = named.filter((asset) =>
    archNeedles(arch).some((token) => asset.name.toLowerCase().includes(token)),
  );
  if (archHit.length === 1) return archHit[0]?.url;
  if (archHit.length > 1) {
    const os = want.os[0];
    const exact = archHit.find((asset) =>
      archNeedles(arch).some((token) =>
        asset.name.toLowerCase().includes(`-${os}-${token}.`),
      ),
    );
    return (exact ?? archHit[0])?.url;
  }
  if (arch === "arm64") {
    const fallback = named.find((asset) =>
      archNeedles("x64").some((token) => asset.name.toLowerCase().includes(token)),
    );
    if (fallback) return fallback.url;
  }
  return named[0]?.url;
}

export function parseLatestRelease(
  payload: unknown,
  currentVersion: string,
  opts: ParseReleaseOpts = {},
): UpdateCheckResult {
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
  const downloadUrl =
    opts.platform && opts.arch
      ? pickInstallerUrl(parseReleaseAssets(payload), opts.platform, opts.arch)
      : undefined;
  const picked = downloadUrl ? { downloadUrl } : {};
  if (isNewerVersion(version, current)) {
    return { available: true, currentVersion: current, version, url, notes, ...picked };
  }
  return { available: false, currentVersion: current, version, url, notes, ...picked };
}
