import {
  LATEST_RELEASE_API,
  parseLatestRelease,
  type UpdateCheckResult,
} from "../shared/updates";

export async function fetchLatestUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Cursor-Bots",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}`);
  }
  return parseLatestRelease(await response.json(), currentVersion);
}
